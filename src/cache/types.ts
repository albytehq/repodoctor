/**
 * Cache domain model.
 *
 * Pure type definitions for the persistent cache system introduced in
 * v0.0.7. The cache stores intermediate results (ScanResult +
 * AnalysisResult) keyed by a deterministic state hash derived from the
 * repository profile fingerprint and file modification times.
 *
 * Architectural role: cache — type-only. May be imported by `cache/`,
 * `cli/`, and `core/` (via re-export).
 */

import type { ScanResult } from '@repodoctor/core/domain/Scan';
import type { AnalysisResult } from '@repodoctor/core/domain/Analysis';

/**
 * A single cache entry stored on disk.
 *
 * Contains the intermediate results of the observation (ScanResult) and
 * interpretation (AnalysisResult) phases. The Health Engine, Treatment
 * Engine, and Reporters are always run live (they are pure functions
 * and extremely fast), so their outputs are NOT cached.
 */
export interface CacheEntry {
  /** The repository state hash that this entry was created with. */
  readonly stateHash: string;
  /** The cached scan result (facts). */
  readonly scanResult: ScanResult;
  /** The cached analysis result (findings). */
  readonly analysisResult: AnalysisResult;
  /** ISO-8601 timestamp marking when the cache entry was created. */
  readonly createdAt: string;
}

/**
 * The on-disk cache file format.
 *
 * The cache file is a JSON object mapping cache keys (derived from the
 * repository path) to {@link CacheEntry} objects. This allows caching
 * multiple repositories in a single file.
 */
export interface CacheFile {
  /** Schema version for forward compatibility. Currently `1`. */
  readonly schemaVersion: number;
  /** Map of repository path -> cache entry. */
  readonly entries: Readonly<Record<string, CacheEntry>>;
}

/**
 * Result of a cache lookup.
 */
export type CacheLookupResult =
  | { readonly hit: true; readonly entry: CacheEntry }
  | { readonly hit: false; readonly reason: 'no-cache-file' | 'no-entry' | 'stale' };

/**
 * File metadata used for state hash computation.
 */
export interface FileMetadata {
  /** The file name (relative to the repository root). */
  readonly name: string;
  /** The file's modification time in milliseconds since epoch. */
  readonly mtimeMs: number;
  /** The file's size in bytes. */
  readonly size: number;
}

/**
 * Parameters for computing a repository state hash.
 */
export interface StateHashParams {
  /** The repository fingerprint hash (from v0.0.2 discovery). */
  readonly fingerprintHash: string;
  /** Metadata for key root files (package.json, lockfile, etc.). */
  readonly fileMetadata: readonly FileMetadata[];
}
