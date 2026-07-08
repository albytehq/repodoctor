/**
 * Environment Scanner.
 *
 * Reads `.env` and `.env.example` files, extracting ONLY the variable
 * keys (never the values). Emits `ENV_VARIABLE_DEFINED` (value: array
 * of key names).
 *
 * Triggers: `.env` or `.env.example` exists (determined via quick FS
 * check in `supports`).
 *
 * Security: This scanner NEVER reads or stores environment variable
 * values. It only extracts key names. This is critical — values may
 * contain secrets.
 *
 * Architectural role: scanner/builtins — uses only the injected
 * `ScannerContext.fs`.
 */

import type { RawFact } from '@repodoctor/core/domain/Scan';
import type { RepositoryProfile } from '@repodoctor/core/domain/Discovery';
import type { IScanner, ScannerContext } from '@repodoctor/scanner/IScanner';

/**
 * The env files probed by this scanner.
 */
const ENV_FILES: readonly string[] = ['.env', '.env.example'];

/**
 * Scanner that extracts environment variable keys from `.env` files.
 *
 * SECURITY: Only keys are extracted. Values are discarded immediately
 * during parsing and never appear in any fact.
 */
export class EnvironmentScanner implements IScanner {
  public readonly id = 'environment-scanner';
  public readonly version = '1.0.0';

  /**
   * Determines whether this scanner should run. The spec says it
   * triggers when `.env` or `.env.example` exists.
   *
   * Note: `supports` receives the discovery profile, not the filesystem.
   * We use a heuristic: if the profile is a Node.js project, we assume
   * env files might exist and let `execute` perform the actual FS check.
   * If neither file exists, `execute` returns an empty array.
   *
   * For non-Node repositories, we still run — env files are
   * language-agnostic.
   */
  public supports(_profile: RepositoryProfile): boolean {
    // Always run — execute() will return an empty array if no env files
    // exist. This keeps the scanner simple and avoids a race condition
    // between `supports` and `execute`.
    return true;
  }

  public async execute(context: ScannerContext): Promise<RawFact[]> {
    const allKeys: string[] = [];

    for (const fileName of ENV_FILES) {
      const exists = await context.fs.fileExists(fileName);
      if (!exists) {
        continue;
      }

      let contents: string;
      try {
        contents = await context.fs.readFile(fileName);
      } catch {
        continue;
      }

      const keys = parseEnvKeys(contents);
      for (const key of keys) {
        if (!allKeys.includes(key)) {
          allKeys.push(key);
        }
      }
    }

    if (allKeys.length === 0) {
      return [];
    }

    return [
      {
        type: 'ENV_VARIABLE_DEFINED',
        target: '.env',
        value: allKeys,
      },
    ];
  }
}

/**
 * Parse `.env` file contents and extract variable keys.
 *
 * Rules:
 *   - Lines starting with `#` are comments — skipped.
 *   - Blank lines — skipped.
 *   - Lines must contain `=` to be a variable definition.
 *   - The key is the text before the first `=`, trimmed.
 *   - The value (after `=`) is DISCARDED — never returned.
 *   - `export KEY=value` syntax is supported (the `export` prefix is
 *     stripped).
 */
function parseEnvKeys(contents: string): string[] {
  const lines = contents.split('\n');
  const keys: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') {
      continue;
    }
    if (trimmed.startsWith('#')) {
      continue;
    }

    // Strip optional `export ` prefix.
    let working = trimmed;
    if (working.startsWith('export ')) {
      working = working.slice('export '.length).trim();
    }

    const eqIndex = working.indexOf('=');
    if (eqIndex === -1) {
      continue;
    }

    const key = working.slice(0, eqIndex).trim();
    if (key === '') {
      continue;
    }

    // NOTE: We deliberately do NOT read or store the value.
    keys.push(key);
  }
  return keys;
}
