/**
 * Package Manager detector.
 *
 * Determines which package manager (npm, yarn, pnpm, bun) a repository
 * uses, based on lockfile presence and the `packageManager` field in
 * `package.json`.
 *
 * Detection priority (highest first):
 *   1. `package.json#packageManager` field (e.g. `"yarn@3.2.1"`).
 *   2. `pnpm-lock.yaml` -> Pnpm
 *   3. `yarn.lock` -> Yarn
 *   4. `bun.lockb` -> Bun
 *   5. `package-lock.json` -> Npm
 *   6. `package.json` exists but no lockfile -> Unknown
 *   7. No `package.json` -> Unknown
 *
 * Architectural role: discovery — may import from core, infrastructure,
 * errors, utils. This module imports `core/domain/Discovery` (type-only).
 */

import type { PackageManager, DiscoveredFile } from '@repodoctor/core/domain/Discovery';
import type { PackageJsonData } from '@repodoctor/discovery/parsers/PackageJsonParser';

/**
 * Lockfile names recognized by the detector, in priority order.
 *
 * The order matters: if multiple lockfiles are present (unusual but
 * possible during a migration), the first match wins.
 */
const LOCKFILE_PRIORITY: ReadonlyArray<{ readonly name: string; readonly manager: PackageManager }> = [
  { name: 'pnpm-lock.yaml', manager: 'Pnpm' },
  { name: 'yarn.lock', manager: 'Yarn' },
  { name: 'bun.lockb', manager: 'Bun' },
  { name: 'package-lock.json', manager: 'Npm' },
];

/**
 * Result of package-manager detection.
 */
export interface PackageManagerDetectionResult {
  readonly packageManager: PackageManager;
  /**
   * The source of the detection — useful for `--debug` logging.
   * One of: `'packageManager-field'`, `'lockfile'`, `'no-lockfile'`,
   * `'no-package-json'`.
   */
  readonly source: 'packageManager-field' | 'lockfile' | 'no-lockfile' | 'no-package-json';
}

/**
 * Detect the package manager.
 *
 * @param rootFiles Files discovered at the repository root.
 * @param packageJson Parsed `package.json` data, or `null` when the file
 *   is absent.
 */
export function detectPackageManager(
  rootFiles: readonly DiscoveredFile[],
  packageJson: PackageJsonData | null,
): PackageManagerDetectionResult {
  // 1. The `packageManager` field in package.json overrides everything.
  if (packageJson?.packageManager !== undefined) {
    const manager = parsePackageManagerField(packageJson.packageManager);
    if (manager !== null) {
      return { packageManager: manager, source: 'packageManager-field' };
    }
  }

  // 2. No package.json at all -> check non-Node ecosystems (v0.0.9).
  if (packageJson === null) {
    const fileNames = new Set(rootFiles.map((f) => f.name));
    // Python: poetry.lock -> Poetry, requirements.txt -> Pip.
    if (fileNames.has('poetry.lock')) {
      return { packageManager: 'Poetry', source: 'lockfile' };
    }
    if (fileNames.has('requirements.txt') || fileNames.has('pyproject.toml')) {
      return { packageManager: 'Pip', source: 'lockfile' };
    }
    // Go: go.mod -> GoModules.
    if (fileNames.has('go.mod')) {
      return { packageManager: 'GoModules', source: 'lockfile' };
    }
    // Rust: Cargo.toml -> Cargo.
    if (fileNames.has('Cargo.toml')) {
      return { packageManager: 'Cargo', source: 'lockfile' };
    }
    return { packageManager: 'Unknown', source: 'no-package-json' };
  }

  // 3. Lockfile presence (Node.js).
  const fileNames = new Set(rootFiles.map((f) => f.name));
  for (const { name, manager } of LOCKFILE_PRIORITY) {
    if (fileNames.has(name)) {
      return { packageManager: manager, source: 'lockfile' };
    }
  }

  // 4. package.json exists but no lockfile.
  return { packageManager: 'Unknown', source: 'no-lockfile' };
}

/**
 * Parse a `packageManager` field value (e.g. `"yarn@3.2.1"`) and return
 * the corresponding {@link PackageManager}. Returns `null` when the
 * value does not match a known manager.
 */
function parsePackageManagerField(value: string): PackageManager | null {
  // The field format is `<name>@<version>` (per the Corepack spec). We
  // only care about the name.
  const atIndex = value.indexOf('@');
  const name = atIndex === -1 ? value : value.slice(0, atIndex);
  switch (name) {
    case 'npm':
      return 'Npm';
    case 'yarn':
      return 'Yarn';
    case 'pnpm':
      return 'Pnpm';
    case 'bun':
      return 'Bun';
    default:
      return null;
  }
}
