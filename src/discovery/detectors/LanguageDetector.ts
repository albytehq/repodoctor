/**
 * Language detector.
 *
 * Determines which programming language(s) the repository uses, based on
 * the presence of manifest and config files.
 *
 * Detection rules (expanded in v0.0.9):
 *   1. If `tsconfig.json` exists -> push `TypeScript`.
 *   2. If `package.json` exists and `tsconfig.json` does not -> push `JavaScript`.
 *   3. If `requirements.txt` or `pyproject.toml` exists -> push `Python`.
 *   4. If `go.mod` exists -> push `Go`.
 *   5. If `Cargo.toml` exists -> push `Rust`.
 *   6. If none of the above -> `[Unknown]`.
 *
 * Priority: Node.js manifests take precedence for the primary language
 * classification. If both `package.json` and `requirements.txt` exist,
 * Node.js wins (for v0.0.9).
 *
 * Architectural role: discovery — may import from core, infrastructure,
 * errors, utils. This module imports `core/domain/Discovery` (type-only).
 */

import type { DiscoveredFile, Language } from '@repodoctor/core/domain/Discovery';
import type { PackageJsonData } from '@repodoctor/discovery/parsers/PackageJsonParser';

/**
 * Result of language detection.
 */
export interface LanguageDetectionResult {
  readonly languages: readonly Language[];
  /**
   * `true` when `package.json` contains `"type": "module"`. Surfaced for
   * future use (the v0.0.2 enum does not distinguish ESM/CJS, but this
   * flag lets downstream consumers branch on it).
   */
  readonly isEsm: boolean;
}

/**
 * Detect the repository's language(s).
 *
 * @param rootFiles Files discovered at the repository root.
 * @param packageJson Parsed `package.json` data, or `null` when the file
 *   is absent.
 */
export function detectLanguage(
  rootFiles: readonly DiscoveredFile[],
  packageJson: PackageJsonData | null,
): LanguageDetectionResult {
  const fileNames = new Set(rootFiles.map((f) => f.name));
  const hasTsconfig = fileNames.has('tsconfig.json');
  const hasPackageJson = packageJson !== null;
  const hasRequirementsTxt = fileNames.has('requirements.txt');
  const hasPyprojectToml = fileNames.has('pyproject.toml');
  const hasGoMod = fileNames.has('go.mod');
  const hasCargoToml = fileNames.has('Cargo.toml');
  const isEsm = packageJson?.type === 'module';

  const languages: Language[] = [];

  // --- Node.js ecosystem ---
  if (hasTsconfig) {
    languages.push('TypeScript');
  }
  if (hasPackageJson && !hasTsconfig) {
    languages.push('JavaScript');
  }

  // --- Python ecosystem (v0.0.9) ---
  if (hasRequirementsTxt || hasPyprojectToml) {
    languages.push('Python');
  }

  // --- Go ecosystem (v0.0.9) ---
  if (hasGoMod) {
    languages.push('Go');
  }

  // --- Rust ecosystem (v0.0.9) ---
  if (hasCargoToml) {
    languages.push('Rust');
  }

  if (languages.length === 0) {
    languages.push('Unknown');
  }

  return { languages, isEsm };
}
