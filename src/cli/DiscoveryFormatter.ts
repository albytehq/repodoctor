/**
 * Discovery result formatter.
 *
 * Converts a {@link DiscoveryResult} into either a human-readable terminal
 * string or a JSON string. Used by the CLI bootstrap when the `--json`
 * flag is (or is not) present.
 *
 * Architectural role: cli — may import from every other layer. This
 * module imports `core/domain/Discovery` (type-only).
 */

import type { DiscoveryResult } from '@repodoctor/core/domain/Discovery';

/**
 * Format a {@link DiscoveryResult} as a human-readable terminal string.
 *
 * The format matches the v0.0.2 spec section 8:
 *
 * ```text
 * RepoDoctor — Repository Discovery
 * Patient: my-saas-app | Scanned: 2023-10-27T14:30:00Z
 *
 * ┌─ Profile ───────────────────────────────────────┐
 * │ Type:           NodeApplication                 │
 * │ Language:       TypeScript                      │
 * │ Package Mgr:    pnpm                            │
 * │ Monorepo:       No                              │
 * │ Fingerprint:    a1b2c3d4e5f6g7h8                │
 * └─────────────────────────────────────────────────┘
 *
 * Frameworks Detected:
 *   - Next.js (High Confidence)
 *
 * Root Files (12):
 *   .gitignore, package.json, pnpm-lock.yaml, README.md, tsconfig.json, ...
 * ```
 */
export function formatDiscoveryResult(result: DiscoveryResult): string {
  const lines: string[] = [];
  const profile = result.profile;

  lines.push('RepoDoctor — Repository Discovery');
  lines.push(`Patient: ${profile.name} | Scanned: ${result.discoveredAt}`);
  lines.push('');

  // Profile box
  const typeLabel = profile.type;
  const languageLabel = profile.languages.join(', ');
  const packageManagerLabel = profile.packageManager;
  const monorepoLabel = profile.isMonorepo ? 'Yes' : 'No';
  const fingerprintLabel = result.fingerprint.hash;

  const profileRows: Array<[string, string]> = [
    ['Type:', typeLabel],
    ['Language:', languageLabel],
    ['Package Mgr:', packageManagerLabel],
    ['Monorepo:', monorepoLabel],
    ['Fingerprint:', fingerprintLabel],
  ];

  const labelWidth = Math.max(...profileRows.map(([label]) => label.length));
  const valueWidth = Math.max(...profileRows.map(([, value]) => value.length));
  const innerWidth = Math.max(labelWidth + 1 + valueWidth, ' Profile '.length);
  const boxWidth = innerWidth + 4; // 2 spaces padding + 2 borders

  lines.push('┌' + '─'.repeat(boxWidth - 2) + '┐');
  lines.push('│' + padTo(' Profile', boxWidth - 2) + '│');
  lines.push('├' + '─'.repeat(boxWidth - 2) + '┤');
  for (const [label, value] of profileRows) {
    const row = ` ${label} ${value}`;
    lines.push('│' + padTo(row, boxWidth - 2) + '│');
  }
  lines.push('└' + '─'.repeat(boxWidth - 2) + '┘');
  lines.push('');

  // Frameworks
  if (profile.frameworks.length > 0) {
    lines.push('Frameworks Detected:');
    for (const fw of profile.frameworks) {
      lines.push(`  - ${fw.name} (${fw.confidence} Confidence)`);
    }
    lines.push('');
  }

  // Root files
  const fileCount = profile.rootFiles.length;
  lines.push(`Root Files (${fileCount}):`);
  if (fileCount > 0) {
    const fileNames = profile.rootFiles.map((f) => f.name);
    const fileList = fileNames.join(', ');
    // Truncate the list if it's very long (keep the output readable).
    const maxLen = 200;
    const displayList = fileList.length > maxLen ? fileList.slice(0, maxLen) + '...' : fileList;
    lines.push(`  ${displayList}`);
  } else {
    lines.push('  (none)');
  }

  return lines.join('\n') + '\n';
}

/**
 * Format a {@link DiscoveryResult} as a JSON string.
 *
 * The output strictly matches the `DiscoveryResult` interface — no extra
 * wrapper fields. Pretty-printed with 2-space indentation for readability.
 */
export function formatDiscoveryResultJson(result: DiscoveryResult): string {
  return JSON.stringify(result, null, 2);
}

/**
 * Pad a string to a fixed width with trailing spaces.
 */
function padTo(s: string, width: number): string {
  if (s.length >= width) {
    return s;
  }
  return s + ' '.repeat(width - s.length);
}
