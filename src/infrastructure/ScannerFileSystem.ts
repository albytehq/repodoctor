/**
 * Scanner file system implementation.
 *
 * Wraps `fs/promises` with four layers of protection:
 *   1. Path safety — all paths resolved relative to `cwd`; traversal outside
 *      `cwd` throws {@link PermissionError}.
 *   2. File size limit — reads exceeding 5MB throw {@link FileSizeExceededError}.
 *   3. Content/existence/size caching — repeated reads hit memory, not disk.
 *   4. FS read concurrency queue — prevents exceeding the OS ulimit by
 *      capping concurrent `readFile`/`stat` calls.
 *
 * Architectural role: infrastructure — may import from core (interfaces
 * only), errors, utils.
 */

import { readFile as nodeReadFile, stat as nodeStat } from 'node:fs/promises';
import { resolve as nodeResolve, sep as nodeSep } from 'node:path';
import type { Stats } from 'node:fs';
import type { IScannerFileSystem } from '@repodoctor/core/IScannerFileSystem';
import { FileNotFoundError } from '@repodoctor/errors/FileNotFoundError';
import { PermissionError } from '@repodoctor/errors/PermissionError';
import { FileSizeExceededError, MAX_SCANNER_FILE_SIZE_BYTES } from '@repodoctor/errors/FileSizeExceededError';

/**
 * Maximum number of concurrent FS operations. Kept well under the typical
 * macOS ulimit (256) and Linux ulimit (1024) to leave headroom for the
 * rest of the process.
 */
const MAX_CONCURRENT_FS_OPS = 64;

/**
 * Maximum number of file contents cached in memory (LRU limit).
 * Per the v0.0.7 spec: 50 files.
 */
const MAX_CACHED_FILES = 50;

/**
 * Maximum total size of cached file contents in bytes.
 * Per the v0.0.7 spec: 20MB.
 */
const MAX_CACHE_SIZE_BYTES = 20 * 1024 * 1024;

/**
 * Simple semaphore for limiting concurrent async operations.
 */
class Semaphore {
  private available: number;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly max: number) {
    this.available = max;
  }

  public async acquire(): Promise<void> {
    if (this.available > 0) {
      this.available -= 1;
      return;
    }
    await new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  public release(): void {
    if (this.waiters.length > 0) {
      const next = this.waiters.shift();
      if (next !== undefined) {
        next();
        return;
      }
    }
    this.available += 1;
    if (this.available > this.max) {
      this.available = this.max;
    }
  }
}

/**
 * Cache entry for a file's content. `undefined` means "not cached" or
 * "file does not exist" (tracked separately by the exists cache).
 */
interface CacheEntry {
  readonly content: string;
  readonly size: number;
}

/**
 * LRU (Least Recently Used) cache for file contents.
 *
 * Evicts the least recently accessed entry when the number of entries
 * exceeds {@link maxEntries} or the total size exceeds
 * {@link maxBytes}. The `get()` method marks an entry as recently used
 * by moving it to the end of the underlying Map (which preserves
 * insertion order in JavaScript).
 */
class LRUCache<K, V extends { readonly size: number }> {
  private readonly map: Map<K, V> = new Map();
  private totalBytes = 0;

  constructor(
    private readonly maxEntries: number,
    private readonly maxBytes: number,
  ) {}

  /**
   * Get a value from the cache, marking it as recently used.
   */
  public get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value === undefined) {
      return undefined;
    }
    // Move to end (most recently used).
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  /**
   * Set a value in the cache, evicting LRU entries if limits are
   * exceeded.
   */
  public set(key: K, value: V): void {
    // If the key already exists, remove the old entry first (to
    // update the size accounting).
    const existing = this.map.get(key);
    if (existing !== undefined) {
      this.totalBytes -= existing.size;
      this.map.delete(key);
    }

    // Add the new entry.
    this.map.set(key, value);
    this.totalBytes += value.size;

    // Evict LRU entries until we're within both limits.
    this.evict();
  }

  /**
   * Check if a key exists in the cache (without marking it as recently
   * used).
   */
  public has(key: K): boolean {
    return this.map.has(key);
  }

  /**
   * Returns the number of entries in the cache.
   */
  public get size(): number {
    return this.map.size;
  }

  /**
   * Returns the total bytes currently cached.
   */
  public get bytes(): number {
    return this.totalBytes;
  }

  /**
   * Evict the least recently used entries until we're within both
   * the entry count and byte limits.
   */
  private evict(): void {
    while (
      (this.map.size > this.maxEntries || this.totalBytes > this.maxBytes) &&
      this.map.size > 0
    ) {
      // The first entry in the Map is the least recently used.
      const iter = this.map.keys();
      const firstKey = iter.next().value as K | undefined;
      if (firstKey === undefined) break;
      const value = this.map.get(firstKey);
      if (value !== undefined) {
        this.totalBytes -= value.size;
      }
      this.map.delete(firstKey);
    }
  }
}

/**
 * Concrete implementation of {@link IScannerFileSystem}.
 *
 * Constructed with the workspace `cwd`. All paths passed to methods are
 * resolved relative to `cwd` and checked for traversal escape.
 */
export class ScannerFileSystem implements IScannerFileSystem {
  private readonly contentCache: LRUCache<string, CacheEntry> = new LRUCache(MAX_CACHED_FILES, MAX_CACHE_SIZE_BYTES);
  private readonly existsCache: Map<string, boolean> = new Map();
  private readonly semaphore = new Semaphore(MAX_CONCURRENT_FS_OPS);

  constructor(private readonly cwd: string) {}

  public async readFile(path: string): Promise<string> {
    const resolved = this.resolveSafe(path);

    // Check cache first.
    const cached = this.contentCache.get(resolved);
    if (cached !== undefined) {
      return cached.content;
    }

    // Acquire semaphore before hitting disk.
    await this.semaphore.acquire();
    try {
      // Check size before reading.
      let stats: Stats;
      try {
        stats = await nodeStat(resolved);
      } catch (error) {
        if (isNotFound(error)) {
          throw new FileNotFoundError(resolved, { cause: error });
        }
        throw error;
      }

      if (!stats.isFile()) {
        throw new Error(`Path is not a regular file: ${resolved}`);
      }

      if (stats.size > MAX_SCANNER_FILE_SIZE_BYTES) {
        throw new FileSizeExceededError(resolved, stats.size);
      }

      const content = await nodeReadFile(resolved, { encoding: 'utf8', flag: 'r' });

      // Cache the result (LRU will evict if limits are exceeded).
      this.contentCache.set(resolved, { content, size: stats.size });
      // Also update the exists cache.
      this.existsCache.set(resolved, true);

      return content;
    } finally {
      this.semaphore.release();
    }
  }

  public async readFileLines(path: string, start: number, end: number): Promise<string[]> {
    // For line reading, we read the whole file (it's already size-limited)
    // and split into lines. This is simpler than streaming and sufficient
    // for v0.0.3's needs.
    const content = await this.readFile(path);
    // Normalize CRLF/CR to LF, then split. Also strip a trailing empty
    // string element caused by files ending with a newline (otherwise
    // line-number-based lookups are off-by-one on most files).
    const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const allLines = normalized.split('\n');
    if (allLines.length > 0 && allLines[allLines.length - 1] === '') {
      allLines.pop();
    }

    // 1-indexed, inclusive range.
    const startIdx = Math.max(0, start - 1);
    const endIdx = Math.min(allLines.length, end);
    if (startIdx >= endIdx) {
      return [];
    }
    return allLines.slice(startIdx, endIdx);
  }

  public async fileExists(path: string): Promise<boolean> {
    const resolved = this.resolveSafe(path);

    // Check cache.
    const cachedExists = this.existsCache.get(resolved);
    if (cachedExists !== undefined) {
      return cachedExists;
    }

    // If we already have the content cached, the file exists.
    if (this.contentCache.has(resolved)) {
      return true;
    }

    await this.semaphore.acquire();
    try {
      let stats: Stats;
      try {
        stats = await nodeStat(resolved);
      } catch (error) {
        if (isNotFound(error)) {
          this.existsCache.set(resolved, false);
          return false;
        }
        throw error;
      }
      const exists = stats.isFile();
      this.existsCache.set(resolved, exists);
      return exists;
    } finally {
      this.semaphore.release();
    }
  }

  public async getFileSize(path: string): Promise<number> {
    const resolved = this.resolveSafe(path);

    // Check content cache.
    const cached = this.contentCache.get(resolved);
    if (cached !== undefined) {
      return cached.size;
    }

    await this.semaphore.acquire();
    try {
      let stats: Stats;
      try {
        stats = await nodeStat(resolved);
      } catch (error) {
        if (isNotFound(error)) {
          throw new FileNotFoundError(resolved, { cause: error });
        }
        throw error;
      }
      if (!stats.isFile()) {
        throw new Error(`Path is not a regular file: ${resolved}`);
      }
      return stats.size;
    } finally {
      this.semaphore.release();
    }
  }

  /**
   * Resolve a path relative to `cwd` and reject traversal escape.
   *
   * @throws {PermissionError} when the resolved path is outside `cwd`.
   */
  private resolveSafe(p: string): string {
    const resolved = nodeResolve(this.cwd, p);
    // Ensure the resolved path is within cwd.
    const cwdWithSep = this.cwd.endsWith(nodeSep) ? this.cwd : this.cwd + nodeSep;
    if (resolved !== this.cwd && !resolved.startsWith(cwdWithSep)) {
      throw new PermissionError(resolved, {
        context: { cwd: this.cwd, attemptedPath: p },
      });
    }
    return resolved;
  }
}

/**
 * Type guard for Node `ENOENT` errors.
 */
function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  );
}
