/**
 * Platform and runtime information helpers.
 *
 * Pure wrappers around `process.platform`, `process.arch`, and `process.version`.
 * They exist so that downstream code does not touch `process` directly, which
 * keeps the rest of the codebase testable and dependency-injected.
 *
 * Architectural role: utils (lowest layer) — may only use Node built-ins.
 */

import { platform as nodePlatform, arch as nodeArch, release as nodeRelease } from 'node:os';

/**
 * Normalized operating system name.
 *
 * We intentionally narrow Node's wide `process.platform` string into a small
 * union so that downstream code can exhaustively switch on it.
 */
export type NormalizedPlatform = 'linux' | 'darwin' | 'win32' | 'other';

/**
 * Normalized CPU architecture.
 */
export type NormalizedArch = 'x64' | 'arm64' | 'other';

/**
 * Readonly snapshot of the current process's platform metadata.
 *
 * The snapshot is taken lazily and cached; the underlying OS does not change
 * during the lifetime of a process, so this is safe.
 */
export interface PlatformInfo {
  /** Operating system name (normalized). */
  readonly platform: NormalizedPlatform;
  /** CPU architecture (normalized). */
  readonly arch: NormalizedArch;
  /** OS release string (e.g. kernel version). */
  readonly release: string;
  /** Node.js runtime version, e.g. `v20.11.0`. */
  readonly nodeVersion: string;
}

/**
 * Normalize a raw `process.platform` string into the `NormalizedPlatform`
 * union. Unknown values map to `'other'`.
 */
function normalizePlatform(raw: string): NormalizedPlatform {
  switch (raw) {
    case 'linux':
    case 'darwin':
    case 'win32':
      return raw;
    default:
      return 'other';
  }
}

/**
 * Normalize a raw `process.arch` string into the `NormalizedArch` union.
 * Unknown values map to `'other'`.
 */
function normalizeArch(raw: string): NormalizedArch {
  switch (raw) {
    case 'x64':
    case 'arm64':
      return raw;
    default:
      return 'other';
  }
}

let cachedInfo: PlatformInfo | undefined;

/**
 * Returns a cached snapshot of the current platform's metadata.
 *
 * @returns A readonly {@link PlatformInfo} snapshot.
 */
export function getPlatformInfo(): PlatformInfo {
  if (cachedInfo === undefined) {
    cachedInfo = {
      platform: normalizePlatform(nodePlatform()),
      arch: normalizeArch(nodeArch()),
      release: nodeRelease(),
      nodeVersion: process.version,
    };
  }
  return cachedInfo;
}

/**
 * Returns true if the current platform is Windows (win32).
 */
export function isWindows(): boolean {
  return getPlatformInfo().platform === 'win32';
}

/**
 * Returns true if the current platform is macOS (darwin).
 */
export function isMacos(): boolean {
  return getPlatformInfo().platform === 'darwin';
}

/**
 * Returns true if the current platform is Linux.
 */
export function isLinux(): boolean {
  return getPlatformInfo().platform === 'linux';
}

/**
 * Resets the cached platform snapshot.
 *
 * This exists purely for test isolation: tests that mock `node:os` need a way
 * to invalidate the cache so subsequent calls observe the mocked values.
 * Production code must not call this function.
 */
export function _resetPlatformCacheForTests(): void {
  cachedInfo = undefined;
}
