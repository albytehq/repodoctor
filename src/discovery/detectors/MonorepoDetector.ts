/**
 * Monorepo detector.
 *
 * Determines whether a repository is a monorepo, based on:
 *   1. The `workspaces` field in `package.json`.
 *   2. The presence of `pnpm-workspace.yaml`.
 *   3. The presence of `lerna.json`.
 *
 * Architectural role: discovery — may import from core, infrastructure,
 * errors, utils. This module imports `core/domain/Discovery` (type-only).
 */

import type { DiscoveredFile } from '@repodoctor/core/domain/Discovery';
import type { PackageJsonData } from '@repodoctor/discovery/parsers/PackageJsonParser';

/**
 * Result of monorepo detection.
 */
export interface MonorepoDetectionResult {
  /** `true` if the repository is a monorepo. */
  readonly isMonorepo: boolean;
  /**
   * Workspace glob patterns (empty unless `isMonorepo` is `true`).
   * Sources from `package.json#workspaces` when present; otherwise an
   * empty array (we do not parse `pnpm-workspace.yaml` or `lerna.json`
   * contents in v0.0.2 — only their presence is probed).
   */
  readonly workspaces: readonly string[];
  /**
   * The source of the monorepo signal — useful for `--debug` logging.
   * One of: `'package-json-workspaces'`, `'pnpm-workspace'`,
   * `'lerna-json'`, `'none'`.
   */
  readonly source:
    | 'package-json-workspaces'
    | 'pnpm-workspace'
    | 'lerna-json'
    | 'none';
}

/**
 * Detect whether the repository is a monorepo.
 *
 * @param rootFiles Files discovered at the repository root.
 * @param packageJson Parsed `package.json` data, or `null` when the file
 *   is absent.
 */
export function detectMonorepo(
  rootFiles: readonly DiscoveredFile[],
  packageJson: PackageJsonData | null,
): MonorepoDetectionResult {
  const fileNames = new Set(rootFiles.map((f) => f.name));

  // 1. package.json#workspaces
  if (packageJson?.workspaces !== undefined) {
    // `workspaces` may be a `string[]` or `{ packages: string[] }`.
    // The PackageJsonParser normalizes both forms to a flat array, but
    // we handle both here in case the detector is called with raw data.
    const workspaces = extractWorkspaces(packageJson.workspaces);
    if (workspaces.length > 0) {
      return {
        isMonorepo: true,
        workspaces,
        source: 'package-json-workspaces',
      };
    }
  }

  // 2. pnpm-workspace.yaml
  if (fileNames.has('pnpm-workspace.yaml')) {
    return {
      isMonorepo: true,
      workspaces: [],
      source: 'pnpm-workspace',
    };
  }

  // 3. lerna.json
  if (fileNames.has('lerna.json')) {
    return {
      isMonorepo: true,
      workspaces: [],
      source: 'lerna-json',
    };
  }

  // 4. Not a monorepo.
  return {
    isMonorepo: false,
    workspaces: [],
    source: 'none',
  };
}

/**
 * Extract a clean `string[]` from a `workspaces` value that may be either
 * a `readonly string[]` or a `{ packages: readonly string[] }` object.
 *
 * Returns an empty array when the value is neither form (e.g. an empty
 * object with no `packages` key).
 */
function extractWorkspaces(
  ws: readonly string[] | { readonly packages?: readonly string[] },
): string[] {
  if (Array.isArray(ws)) {
    // `ws` is narrowed to `readonly string[]` here; filter + map to
    // produce a mutable `string[]`.
    return ws.filter((entry: unknown): entry is string => typeof entry === 'string');
  }
  if (ws !== null && typeof ws === 'object') {
    const maybePackages = (ws as { packages?: unknown }).packages;
    if (Array.isArray(maybePackages)) {
      return maybePackages.filter(
        (entry: unknown): entry is string => typeof entry === 'string',
      );
    }
  }
  return [];
}
