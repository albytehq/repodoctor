/**
 * Cargo.toml parser.
 *
 * Parses `Cargo.toml` to extract the crate name and the `[dependencies]`
 * section (dependency names). Uses a zero-dependency regex approach.
 *
 * Architectural role: scanner/parsers — may import from core, errors.
 */

import type { IScannerFileSystem } from '@repodoctor/core/IScannerFileSystem';

/**
 * The parsed result from a `Cargo.toml` file.
 */
export interface CargoTomlData {
  /** The crate name (from `[package] name = "..."`). */
  readonly crateName: string;
  /** Dependency crate names from the `[dependencies]` section. */
  readonly dependencies: readonly string[];
}

/**
 * Parse a `Cargo.toml` file.
 *
 * Reads the file via the injected `IScannerFileSystem`, then extracts
 * the crate name and dependencies using regex patterns.
 *
 * @param fs The scanner file system.
 * @returns Parsed Cargo.toml data, or `null` if the file is not found.
 */
export async function parseCargoToml(
  fs: IScannerFileSystem,
): Promise<CargoTomlData | null> {
  if (!(await fs.fileExists('Cargo.toml'))) {
    return null;
  }

  const content = await fs.readFile('Cargo.toml');
  return parseCargoTomlContent(content);
}

/**
 * Parse `Cargo.toml` content.
 *
 * Extracts:
 *   - The crate name from `[package] name = "..."`.
 *   - All entries from the `[dependencies]` section.
 *
 * Example Cargo.toml:
 * ```toml
 * [package]
 * name = "my-crate"
 * version = "0.1.0"
 *
 * [dependencies]
 * actix-web = "4.0"
 * tokio = { version = "1.0", features = ["full"] }
 * ```
 */
export function parseCargoTomlContent(content: string): CargoTomlData {
  // --- Crate name ---
  let crateName = '';
  const nameMatch = content.match(/^name\s*=\s*"([^"]+)"/m);
  if (nameMatch !== null && nameMatch[1] !== undefined) {
    crateName = nameMatch[1];
  }

  // --- [dependencies] section ---
  const deps: string[] = [];

  // Match the [dependencies] section: everything between [dependencies]
  // and the next [section] or end of file.
  const depSectionMatch = content.match(
    /\[dependencies\]\s*([\s\S]*?)(?=\n\[|$)/,
  );
  if (depSectionMatch !== null && depSectionMatch[1] !== undefined) {
    const section = depSectionMatch[1];
    for (const line of section.split('\n')) {
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('[')) {
        continue;
      }
      // Each line is: `crate-name = "version"` or `crate-name = { ... }`
      const match = trimmed.match(/^([a-zA-Z0-9_.-]+)\s*=/);
      if (match !== null && match[1] !== undefined) {
        deps.push(match[1].toLowerCase());
      }
    }
  }

  // Also match inline-table dependencies: [dependencies.NAME]
  // This is a common Cargo pattern for deps with options:
  //   [dependencies.serde]
  //   version = "1.0"
  //   features = ["derive"]
  const inlineDepMatches = content.matchAll(
    /\[dependencies\.([a-zA-Z0-9_.-]+)\]/g,
  );
  for (const m of inlineDepMatches) {
    if (m[1] !== undefined) {
      deps.push(m[1].toLowerCase());
    }
  }

  return { crateName, dependencies: deps };
}
