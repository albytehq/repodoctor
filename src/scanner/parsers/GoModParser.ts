/**
 * Go module parser.
 *
 * Parses `go.mod` to extract the module path and the `require` block
 * (dependency names). Uses a zero-dependency regex approach.
 *
 * Architectural role: scanner/parsers — may import from core, errors.
 */

import type { IScannerFileSystem } from '@repodoctor/core/IScannerFileSystem';

/**
 * The parsed result from a `go.mod` file.
 */
export interface GoModData {
  /** The module path (e.g. `github.com/user/repo`). */
  readonly modulePath: string;
  /** Dependency module paths from the `require` block. */
  readonly dependencies: readonly string[];
}

/**
 * Parse a `go.mod` file.
 *
 * Reads the file via the injected `IScannerFileSystem`, then extracts
 * the module path and require block using regex patterns.
 *
 * @param fs The scanner file system.
 * @returns Parsed go.mod data, or `null` if the file is not found.
 */
export async function parseGoMod(
  fs: IScannerFileSystem,
): Promise<GoModData | null> {
  if (!(await fs.fileExists('go.mod'))) {
    return null;
  }

  const content = await fs.readFile('go.mod');
  return parseGoModContent(content);
}

/**
 * Parse `go.mod` content.
 *
 * Extracts:
 *   - The `module` directive (module path).
 *   - All `require` block entries (both single-line and block form).
 *
 * Example go.mod:
 * ```go
 * module github.com/user/repo
 *
 * go 1.21
 *
 * require (
 *   github.com/gin-gonic/gin v1.9.0
 *   github.com/labstack/echo/v4 v4.11.0
 * )
 * ```
 */
export function parseGoModContent(content: string): GoModData {
  // --- Module path ---
  let modulePath = '';
  const moduleMatch = content.match(/^module\s+(\S+)/m);
  if (moduleMatch !== null && moduleMatch[1] !== undefined) {
    modulePath = moduleMatch[1];
  }

  // --- Require block ---
  const deps: string[] = [];

  // Match block-form require: require ( ... )
  // Use matchAll to iterate over ALL require blocks, not just the first.
  const blockMatches = content.matchAll(/require\s*\(([\s\S]*?)\)/g);
  for (const blockMatch of blockMatches) {
    if (blockMatch[1] === undefined) {
      continue;
    }
    for (const line of blockMatch[1].split('\n')) {
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith('//')) {
        continue;
      }
      // Each line is: `module-path version // optional comment`
      const match = trimmed.match(/^(\S+)\s+/);
      if (match !== null && match[1] !== undefined) {
        deps.push(match[1]);
      }
    }
  }

  // Match single-line require: require module-path version
  // Negative lookahead skips `(` to avoid capturing the block-form opener.
  const singleLineMatches = content.matchAll(/^require\s+(?!\()(\S+)\s+\S+/gm);
  for (const match of singleLineMatches) {
    if (match[1] !== undefined && !deps.includes(match[1])) {
      deps.push(match[1]);
    }
  }

  return { modulePath, dependencies: deps };
}
