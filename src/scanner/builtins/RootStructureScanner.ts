/**
 * Root Structure Scanner.
 *
 * Checks for the presence of common root-level files:
 *   `.gitignore`, `.env`, `.env.example`, `Dockerfile`, `LICENSE`, `README.md`.
 *
 * Emits `FILE_EXISTS` facts (value: `true` or `false`) for each.
 *
 * Triggers: Always (runs for every repository type).
 *
 * Architectural role: scanner/builtins — may import from core,
 * infrastructure, errors, utils, discovery. Uses only the injected
 * `ScannerContext.fs`.
 */

import type { RawFact } from '@repodoctor/core/domain/Scan';
import type { RepositoryProfile } from '@repodoctor/core/domain/Discovery';
import type { IScanner, ScannerContext } from '@repodoctor/scanner/IScanner';

/**
 * The set of root-level files probed by this scanner.
 */
const PROBED_FILES: readonly string[] = [
  '.gitignore',
  '.env',
  '.env.example',
  'Dockerfile',
  'LICENSE',
  'README.md',
  'requirements.txt',
  'pyproject.toml',
  'go.mod',
  'Cargo.toml',
];

/**
 * Scanner that probes for common root-level files.
 *
 * For each file in {@link PROBED_FILES}, the scanner emits a `FILE_EXISTS`
 * fact with `target` set to the file name and `value` set to `true` or
 * `false`.
 */
export class RootStructureScanner implements IScanner {
  public readonly id = 'root-structure-scanner';
  public readonly version = '1.0.0';

  public supports(_profile: RepositoryProfile): boolean {
    // Always runs.
    return true;
  }

  public async execute(context: ScannerContext): Promise<RawFact[]> {
    const facts: RawFact[] = [];
    for (const fileName of PROBED_FILES) {
      const exists = await context.fs.fileExists(fileName);
      facts.push({
        type: 'FILE_EXISTS',
        target: fileName,
        value: exists,
      });
    }
    return facts;
  }
}
