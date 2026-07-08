/**
 * Cache Validator.
 *
 * Computes a deterministic repository state hash and compares it against
 * a cached hash to determine whether the cache is still valid.
 *
 * The state hash is based on:
 *   - The repository fingerprint (from v0.0.2 discovery).
 *   - File modification times (mtimes) of key root files.
 *   - File sizes of key root files.
 *
 * If any of these change, the cache is considered stale and the full
 * pipeline must run again.
 *
 * Architectural role: cache — pure module. No I/O. May import from core,
 * utils, infrastructure, discovery, scanner, analyzer.
 */

import { createHash } from 'node:crypto';
import type { StateHashParams, FileMetadata } from '@repodoctor/cache/types';

/**
 * Compute a deterministic repository state hash from the profile and
 * file metadata.
 *
 * The hash is a SHA-256 digest truncated to 16 hex characters. The
 * basis is:
 *   `${fingerprint}:${sortedFileMetadata}`
 *
 * where `sortedFileMetadata` is the file metadata sorted by name and
 * serialized as `name:mtimeMs:size` joined by `|`.
 *
 * @returns A 16-character hex string.
 */
export function computeStateHash(params: StateHashParams): string {
  const { fingerprintHash, fileMetadata } = params;

  // Sort file metadata by name for determinism (lexicographic, not locale-dependent).
  const sorted = [...fileMetadata].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  const metadataString = sorted
    .map((m) => `${m.name}:${m.mtimeMs}:${m.size}`)
    .join('|');

  const basis = `${fingerprintHash}:${metadataString}`;
  return createHash('sha256').update(basis, 'utf8').digest('hex').slice(0, 16);
}

/**
 * Check whether a cached state hash matches the current state hash.
 *
 * @returns `true` if the cache is valid (hashes match), `false` if stale.
 */
export function isCacheValid(
  cachedHash: string,
  currentHash: string,
): boolean {
  return cachedHash === currentHash;
}

/**
 * Collect file metadata from a list of file paths.
 *
 * This is a pure function: it takes pre-fetched metadata and returns
 * it sorted. The actual I/O (calling `stat`) is the caller's
 * responsibility — this keeps the validator testable without mocking
 * the filesystem.
 *
 * @param files An array of file names + their stat results.
 * @returns The sorted metadata array.
 */
export function collectFileMetadata(
  files: ReadonlyArray<{ name: string; mtimeMs: number; size: number }>,
): readonly FileMetadata[] {
  return files
    .map((f) => ({ name: f.name, mtimeMs: f.mtimeMs, size: f.size }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
