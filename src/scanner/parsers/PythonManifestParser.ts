/**
 * Python manifest parser.
 *
 * Parses `requirements.txt` (list of `package==version`) or
 * `pyproject.toml` (TOML format, `[tool.poetry.dependencies]` or
 * `[project.dependencies]`) to extract dependency names.
 *
 * Uses a zero-dependency regex approach for simple extraction.
 *
 * Architectural role: scanner/parsers — may import from core, errors.
 */

import type { IScannerFileSystem } from '@repodoctor/core/IScannerFileSystem';

/**
 * The parsed result from a Python manifest.
 */
export interface PythonManifestData {
  /** Dependency package names (without versions), deduplicated. */
  readonly dependencies: readonly string[];
  /** Which manifest file was parsed. When both exist, both are parsed
   *  and the deps are merged; `source` is the primary one. */
  readonly source: 'requirements.txt' | 'pyproject.toml' | 'both';
}

/**
 * Parse a Python manifest file (requirements.txt and/or pyproject.toml).
 *
 * When BOTH files exist, BOTH are parsed and their dependency sets are
 * merged (deduplicated). This fixes the bug where a repo with both
 * manifests (common during migration) only had its requirements.txt
 * deps visible — pyproject.toml deps (often including Django/FastAPI)
 * were silently dropped.
 *
 * @param fs The scanner file system.
 * @returns Parsed manifest data, or `null` if no manifest is found.
 */
export async function parsePythonManifest(
  fs: IScannerFileSystem,
): Promise<PythonManifestData | null> {
  const hasRequirements = await fs.fileExists('requirements.txt');
  const hasPyproject = await fs.fileExists('pyproject.toml');

  if (!hasRequirements && !hasPyproject) {
    return null;
  }

  const deps = new Set<string>();
  let source: PythonManifestData['source'];

  if (hasRequirements) {
    const content = await fs.readFile('requirements.txt');
    for (const dep of parseRequirementsTxt(content)) {
      deps.add(dep);
    }
  }

  if (hasPyproject) {
    const content = await fs.readFile('pyproject.toml');
    for (const dep of parsePyprojectToml(content)) {
      deps.add(dep);
    }
  }

  if (hasRequirements && hasPyproject) {
    source = 'both';
  } else if (hasRequirements) {
    source = 'requirements.txt';
  } else {
    source = 'pyproject.toml';
  }

  return { dependencies: [...deps].sort(), source };
}

/**
 * Parse `requirements.txt` format.
 *
 * Each line is a dependency specification:
 *   - `package==1.0.0` -> `package`
 *   - `package>=1.0.0` -> `package`
 *   - `package` -> `package`
 *   - `# comment` -> skipped
 *   - `-r other.txt` -> skipped (include directive)
 *   - Empty lines -> skipped
 */
export function parseRequirementsTxt(content: string): string[] {
  const deps: string[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('-')) {
      continue;
    }
    // Extract the package name (everything before the first version specifier).
    const match = trimmed.match(/^([a-zA-Z0-9_.-]+)/);
    if (match !== null && match[1] !== undefined) {
      deps.push(match[1].toLowerCase());
    }
  }
  return deps;
}

/**
 * Parse `pyproject.toml` format.
 *
 * Extracts dependencies from:
 *   - `[tool.poetry.dependencies]` section (Poetry style)
 *   - `[project.dependencies]` array (PEP 621 style)
 *
 * Uses a simple regex-based approach — no full TOML parser needed for
 * dependency name extraction.
 */
export function parsePyprojectToml(content: string): string[] {
  const deps: string[] = [];

  // --- Poetry style: [tool.poetry.dependencies] ---
  // Look for the section and extract keys until the next section.
  const poetryMatch = content.match(
    /\[tool\.poetry\.dependencies\]\s*([\s\S]*?)(?=\n\[|$)/,
  );
  if (poetryMatch !== null && poetryMatch[1] !== undefined) {
    const section = poetryMatch[1];
    for (const line of section.split('\n')) {
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith('#')) {
        continue;
      }
      // Poetry format: `package = "1.0.0"` or `package = {version = "1.0.0", ...}`
      const match = trimmed.match(/^([a-zA-Z0-9_.-]+)\s*=/);
      if (match !== null && match[1] !== undefined) {
        // Skip `python` — it's the Python version constraint, not a dep.
        const name = match[1].toLowerCase();
        if (name !== 'python') {
          deps.push(name);
        }
      }
    }
  }

  // --- PEP 621 style: dependencies = ["package>=1.0", ...] ---
  // Negative lookbehind avoids matching `optional-dependencies`.
  const pep621Match = content.match(
    /(?<![-\w])dependencies\s*=\s*\[([\s\S]*?)\]/,
  );
  if (pep621Match !== null && pep621Match[1] !== undefined) {
    const section = pep621Match[1];
    // Each entry is a quoted string like "package>=1.0.0".
    const depMatches = section.matchAll(/["']([a-zA-Z0-9_.-]+)/g);
    for (const match of depMatches) {
      if (match[1] !== undefined) {
        deps.push(match[1].toLowerCase());
      }
    }
  }

  return deps;
}
