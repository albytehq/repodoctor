/**
 * Documentation Scanner.
 *
 * Emits:
 *   - `FILE_SIZE_BYTES` for `README.md` (if it exists).
 *   - `FILE_EXISTS` for `CONTRIBUTING.md`.
 *
 * Triggers: Always.
 *
 * Architectural role: scanner/builtins — uses only the injected
 * `ScannerContext.fs`.
 */

import type { RawFact } from '@repodoctor/core/domain/Scan';
import type { RepositoryProfile } from '@repodoctor/core/domain/Discovery';
import type { IScanner, ScannerContext } from '@repodoctor/scanner/IScanner';

/**
 * Scanner that probes documentation files.
 */
export class DocumentationScanner implements IScanner {
  public readonly id = 'documentation-scanner';
  public readonly version = '1.0.0';

  public supports(_profile: RepositoryProfile): boolean {
    return true;
  }

  public async execute(context: ScannerContext): Promise<RawFact[]> {
    const facts: RawFact[] = [];

    // --- README.md size ---
    const readmeExists = await context.fs.fileExists('README.md');
    if (readmeExists) {
      try {
        const size = await context.fs.getFileSize('README.md');
        facts.push({
          type: 'FILE_SIZE_BYTES',
          target: 'README.md',
          value: size,
        });
      } catch {
        // getFileSize failed — skip this fact. The scanner does not
        // throw; the executor handles scanner-level failures.
      }
    }

    // --- CONTRIBUTING.md exists ---
    const contributingExists = await context.fs.fileExists('CONTRIBUTING.md');
    facts.push({
      type: 'FILE_EXISTS',
      target: 'CONTRIBUTING.md',
      value: contributingExists,
    });

    return facts;
  }
}
