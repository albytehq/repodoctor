/**
 * Cache Manager.
 *
 * Orchestrates cache read/write/validation. The cache is stored as a
 * JSON file on disk (typically `.cache/repodoctor/cache.json` or an OS
 * temp directory equivalent).
 *
 * The manager:
 *   1. Computes the repository state hash.
 *   2. Reads the cache file (if it exists).
 *   3. Looks up the entry for this repository path.
 *   4. Compares the stored state hash with the current one.
 *   5. If valid, returns the cached ScanResult + AnalysisResult.
 *   6. If invalid (or missing), returns a miss.
 *   7. After a successful pipeline run, the caller calls `write()` to
 *      persist the new results.
 *
 * Architectural role: cache — may import from core, utils,
 * infrastructure, discovery, scanner, analyzer. This module imports
 * `fs/promises` and `node:path` (via infrastructure) and the cache
 * types + validator.
 */

import { readFile as nodeReadFile, writeFile as nodeWriteFile, mkdir as nodeMkdir, rm as nodeRm, rename as nodeRename } from 'node:fs/promises';
import { join as nodeJoin, dirname as nodeDirname } from 'node:path';
import type { ScanResult } from '@repodoctor/core/domain/Scan';
import type { AnalysisResult } from '@repodoctor/core/domain/Analysis';
import type {
  CacheEntry,
  CacheFile,
  CacheLookupResult,
  FileMetadata,
} from '@repodoctor/cache/types';
import { computeStateHash, isCacheValid } from '@repodoctor/cache/CacheValidator';

/**
 * The schema version for the cache file format.
 */
const CACHE_SCHEMA_VERSION = 1;

/**
 * The default cache directory name (relative to the repository root).
 */
const DEFAULT_CACHE_DIR = '.cache/repodoctor';

/**
 * The cache file name within the cache directory.
 */
const CACHE_FILE_NAME = 'cache.json';

/**
 * Parameters for the {@link CacheManager}.
 */
export interface CacheManagerParams {
  /** The repository root path (used as the cache key). */
  readonly repoPath: string;
  /** The directory where the cache file is stored. */
  readonly cacheDir: string;
  /** Whether to bypass the cache entirely (--no-cache flag). */
  readonly noCache: boolean;
}

/**
 * Manages the persistent cache for scan and analysis results.
 *
 * Constructed once per CLI invocation. The caller:
 *   1. Calls `lookup()` with the profile + file metadata.
 *   2. If hit, uses the cached results directly.
 *   3. If miss, runs the full pipeline.
 *   4. Calls `write()` to persist the new results.
 */
export class CacheManager {
  private readonly cacheFilePath: string;
  private readonly repoPath: string;
  private readonly noCache: boolean;

  constructor(params: CacheManagerParams) {
    this.repoPath = params.repoPath;
    this.noCache = params.noCache;
    this.cacheFilePath = nodeJoin(params.cacheDir, CACHE_FILE_NAME);
  }

  /**
   * Look up a cached entry for the current repository.
   *
   * @param profile The repository profile (from v0.0.2 discovery).
   * @param fileMetadata Metadata for key root files.
   * @returns A {@link CacheLookupResult} indicating hit or miss.
   */
  public async lookup(
    fingerprintHash: string,
    fileMetadata: readonly FileMetadata[],
  ): Promise<CacheLookupResult> {
    if (this.noCache) {
      return { hit: false, reason: 'no-cache-file' };
    }

    const currentHash = computeStateHash({ fingerprintHash, fileMetadata });

    let fileContent: string;
    try {
      fileContent = await nodeReadFile(this.cacheFilePath, 'utf8');
    } catch {
      return { hit: false, reason: 'no-cache-file' };
    }

    let cacheFile: CacheFile;
    try {
      cacheFile = JSON.parse(fileContent) as CacheFile;
    } catch {
      return { hit: false, reason: 'no-cache-file' };
    }

    if (cacheFile === null || typeof cacheFile !== 'object') {
      return { hit: false, reason: 'no-cache-file' };
    }

    if (cacheFile.schemaVersion !== CACHE_SCHEMA_VERSION) {
      return { hit: false, reason: 'stale' };
    }

    if (cacheFile.entries === null || cacheFile.entries === undefined || typeof cacheFile.entries !== 'object') {
      return { hit: false, reason: 'no-cache-file' };
    }

    const entry = cacheFile.entries[this.repoPath];
    // Guard against null/non-object entries (e.g. from a corrupted cache
    // file or a buggy external tool). Without this guard, `entry.stateHash`
    // throws TypeError and crashes the entire pipeline.
    if (entry === undefined || entry === null || typeof entry !== 'object') {
      return { hit: false, reason: 'no-entry' };
    }

    if (!isCacheValid(entry.stateHash, currentHash)) {
      return { hit: false, reason: 'stale' };
    }

    return { hit: true, entry };
  }

  /**
   * Write a cache entry for the current repository.
   *
   * @param profile The repository profile.
   * @param fileMetadata Metadata for key root files.
   * @param scanResult The scan result to cache.
   * @param analysisResult The analysis result to cache.
   */
  public async write(
    fingerprintHash: string,
    fileMetadata: readonly FileMetadata[],
    scanResult: ScanResult,
    analysisResult: AnalysisResult,
  ): Promise<void> {
    if (this.noCache) {
      return;
    }

    const stateHash = computeStateHash({ fingerprintHash, fileMetadata });
    const entry: CacheEntry = {
      stateHash,
      scanResult,
      analysisResult,
      createdAt: new Date().toISOString(),
    };

    // Read the existing cache file (if any) so we don't clobber other
    // repositories' entries.
    let cacheFile: CacheFile;
    try {
      const content = await nodeReadFile(this.cacheFilePath, 'utf8');
      cacheFile = JSON.parse(content) as CacheFile;
      if (cacheFile.schemaVersion !== CACHE_SCHEMA_VERSION) {
        // Version mismatch — start fresh.
        cacheFile = { schemaVersion: CACHE_SCHEMA_VERSION, entries: {} };
      }
      // Validate entries shape — a corrupted file with entries: "string"
      // would silently spread garbage. Reset to empty if invalid.
      if (cacheFile.entries === null || typeof cacheFile.entries !== 'object' || Array.isArray(cacheFile.entries)) {
        cacheFile = { schemaVersion: CACHE_SCHEMA_VERSION, entries: {} };
      }
    } catch {
      cacheFile = { schemaVersion: CACHE_SCHEMA_VERSION, entries: {} };
    }

    // Update the entry for this repository.
    const entries = { ...cacheFile.entries, [this.repoPath]: entry };
    const updated: CacheFile = {
      schemaVersion: CACHE_SCHEMA_VERSION,
      entries,
    };

    // Ensure the cache directory exists.
    await nodeMkdir(nodeDirname(this.cacheFilePath), { recursive: true });

    // ATOMIC WRITE: write to a temp file in the same directory (same
    // filesystem — required for atomic rename), then rename to the
    // target. This prevents a truncated cache file if the process is
    // killed (SIGKILL, OOM, power loss) mid-write. `rename` is atomic
    // on both POSIX and Windows (Node 10+ uses MoveFileEx with
    // MOVEFILE_REPLACE_EXISTING).
    const tempPath = `${this.cacheFilePath}.tmp.${process.pid}`;
    await nodeWriteFile(tempPath, JSON.stringify(updated, null, 2), 'utf8');
    try {
      await nodeRename(tempPath, this.cacheFilePath);
    } catch {
      // If rename fails (e.g., cross-device), fall back to direct write.
      // Clean up the temp file first.
      try { await nodeRm(tempPath, { force: true }); } catch { /* ignore */ }
      await nodeWriteFile(this.cacheFilePath, JSON.stringify(updated, null, 2), 'utf8');
    }
  }

  /**
   * Clear the cache for this repository.
   *
   * Called when the user passes `--clear-cache`. We only delete the
   * cache.json file (not the entire directory) to avoid accidental data
   * loss if the cacheDir was misconfigured to point at a shared or
   * important directory.
   */
  public async clear(): Promise<void> {
    try {
      await nodeRm(this.cacheFilePath, { force: true });
    } catch {
      // Ignore errors — the file may not exist.
    }
  }

  /**
   * Returns the path to the cache file (for diagnostics).
   */
  public get cacheFilePath_(): string {
    return this.cacheFilePath;
  }
}

/**
 * Create a {@link CacheManager} with the default cache directory.
 *
 * @param repoPath The repository root path.
 * @param noCache Whether to bypass the cache.
 * @returns A new CacheManager instance.
 */
export function createCacheManager(
  repoPath: string,
  noCache: boolean = false,
): CacheManager {
  const cacheDir = nodeJoin(repoPath, DEFAULT_CACHE_DIR);
  return new CacheManager({ repoPath, cacheDir, noCache });
}
