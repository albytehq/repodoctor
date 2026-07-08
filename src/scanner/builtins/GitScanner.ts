/**
 * Git Scanner.
 *
 * Reads `.gitignore` and parses its entries (ignoring comments and
 * blank lines). Emits `GITIGNORE_ENTRIES` (value: array of strings).
 *
 * Triggers: Always (if `.gitignore` does not exist, the scanner returns
 * an empty array — that itself is an objective fact).
 *
 * Architectural role: scanner/builtins — uses only the injected
 * `ScannerContext.fs`.
 */

import type { RawFact } from '@repodoctor/core/domain/Scan';
import type { RepositoryProfile } from '@repodoctor/core/domain/Discovery';
import type { IScanner, ScannerContext } from '@repodoctor/scanner/IScanner';

/**
 * Scanner that parses `.gitignore` entries.
 */
export class GitScanner implements IScanner {
  public readonly id = 'git-scanner';
  public readonly version = '1.0.0';

  public supports(_profile: RepositoryProfile): boolean {
    return true;
  }

  public async execute(context: ScannerContext): Promise<RawFact[]> {
    const exists = await context.fs.fileExists('.gitignore');
    if (!exists) {
      return [];
    }

    let contents: string;
    try {
      contents = await context.fs.readFile('.gitignore');
    } catch {
      return [];
    }

    const entries = parseGitignore(contents);
    if (entries.length === 0) {
      return [];
    }

    return [
      {
        type: 'GITIGNORE_ENTRIES',
        target: '.gitignore',
        value: entries,
      },
    ];
  }
}

/**
 * Parse `.gitignore` contents into an array of entry strings.
 *
 * Rules:
 *   - Lines starting with `#` are comments — skipped.
 *   - Blank lines (or whitespace-only lines) — skipped.
 *   - Trailing whitespace is stripped from each entry.
 *   - Entries are returned in the order they appear.
 */
function parseGitignore(contents: string): string[] {
  const lines = contents.split('\n');
  const entries: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') {
      continue;
    }
    if (trimmed.startsWith('#')) {
      continue;
    }
    entries.push(trimmed);
  }
  return entries;
}
