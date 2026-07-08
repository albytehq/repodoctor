/**
 * Integration tests for CacheManager.
 *
 * Uses a real temp directory to verify cache read/write/clear behavior.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CacheManager,
  createCacheManager,
} from '@repodoctor/cache/CacheManager';
import type { ScanResult } from '@repodoctor/core/domain/Scan';
import type { AnalysisResult } from '@repodoctor/core/domain/Analysis';
import type { FileMetadata } from '@repodoctor/cache/types';

function makeScanResult(): ScanResult {
  return {
    schemaVersion: 1,
    patient: 'test-repo',
    scanCompletedAt: '2024-01-01T00:00:00.000Z',
    facts: [
      {
        id: 'fact1',
        scannerIds: ['test-scanner'],
        type: 'FILE_EXISTS',
        target: '.gitignore',
        value: true,
        observedAt: '2024-01-01T00:00:00.000Z',
      },
    ],
  };
}

function makeAnalysisResult(): AnalysisResult {
  return {
    schemaVersion: 1,
    patient: 'test-repo',
    analysisCompletedAt: '2024-01-01T00:00:00.000Z',
    findings: [
      {
        id: 'finding1',
        analyzerIds: ['structure-analyzer'],
        ruleId: 'gitignore-missing',
        target: '.gitignore',
        message: 'No .gitignore file was found.',
      },
    ],
  };
}

const META: FileMetadata[] = [
  { name: 'package.json', mtimeMs: 1000, size: 500 },
  { name: '.gitignore', mtimeMs: 2000, size: 50 },
];

describe('CacheManager — integration', () => {
  let tempDir: string;
  let cacheDir: string;
  let repoPath: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'repodoctor-cache-test-'));
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    cacheDir = join(tempDir, `cache-${Date.now()}`);
    repoPath = '/test/repo';
  });

  describe('lookup (no cache file)', () => {
    it('returns miss when cache file does not exist', async () => {
      const manager = new CacheManager({ repoPath, cacheDir, noCache: false });
      const result = await manager.lookup('fingerprint123', META);
      expect(result.hit).toBe(false);
      if (!result.hit) {
        expect(result.reason).toBe('no-cache-file');
      }
    });
  });

  describe('write + lookup', () => {
    it('writes and reads back cache entries', async () => {
      const manager = new CacheManager({ repoPath, cacheDir, noCache: false });
      const scanResult = makeScanResult();
      const analysisResult = makeAnalysisResult();

      await manager.write('fingerprint123', META, scanResult, analysisResult);

      const lookup = await manager.lookup('fingerprint123', META);
      expect(lookup.hit).toBe(true);
      if (lookup.hit) {
        expect(lookup.entry.scanResult.patient).toBe('test-repo');
        expect(lookup.entry.analysisResult.findings).toHaveLength(1);
        expect(lookup.entry.stateHash).toBeDefined();
        expect(lookup.entry.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      }
    });

    it('returns stale when fingerprint changes', async () => {
      const manager = new CacheManager({ repoPath, cacheDir, noCache: false });
      await manager.write('fingerprint123', META, makeScanResult(), makeAnalysisResult());

      const lookup = await manager.lookup('different-fingerprint', META);
      expect(lookup.hit).toBe(false);
      if (!lookup.hit) {
        expect(lookup.reason).toBe('stale');
      }
    });

    it('returns stale when file mtime changes', async () => {
      const manager = new CacheManager({ repoPath, cacheDir, noCache: false });
      await manager.write('fingerprint123', META, makeScanResult(), makeAnalysisResult());

      const changedMeta: FileMetadata[] = [
        { name: 'package.json', mtimeMs: 9999, size: 500 },
        { name: '.gitignore', mtimeMs: 2000, size: 50 },
      ];
      const lookup = await manager.lookup('fingerprint123', changedMeta);
      expect(lookup.hit).toBe(false);
      if (!lookup.hit) {
        expect(lookup.reason).toBe('stale');
      }
    });

    it('returns no-entry when repo path differs', async () => {
      const manager1 = new CacheManager({ repoPath: '/repo-A', cacheDir, noCache: false });
      await manager1.write('fp', META, makeScanResult(), makeAnalysisResult());

      const manager2 = new CacheManager({ repoPath: '/repo-B', cacheDir, noCache: false });
      const lookup = await manager2.lookup('fp', META);
      expect(lookup.hit).toBe(false);
      if (!lookup.hit) {
        expect(lookup.reason).toBe('no-entry');
      }
    });
  });

  describe('--no-cache', () => {
    it('lookup returns miss when noCache is true', async () => {
      const manager = new CacheManager({ repoPath, cacheDir, noCache: true });
      const result = await manager.lookup('fingerprint123', META);
      expect(result.hit).toBe(false);
    });

    it('write does not create a cache file when noCache is true', async () => {
      const manager = new CacheManager({ repoPath, cacheDir, noCache: true });
      await manager.write('fingerprint123', META, makeScanResult(), makeAnalysisResult());
      expect(existsSync(join(cacheDir, 'cache.json'))).toBe(false);
    });
  });

  describe('clear', () => {
    it('deletes the cache file (but not the directory, to avoid data loss if cacheDir is misconfigured)', async () => {
      const manager = new CacheManager({ repoPath, cacheDir, noCache: false });
      await manager.write('fp', META, makeScanResult(), makeAnalysisResult());
      expect(existsSync(join(cacheDir, 'cache.json'))).toBe(true);

      await manager.clear();
      // The cache FILE should be gone...
      expect(existsSync(join(cacheDir, 'cache.json'))).toBe(false);
      // ...but the directory is intentionally left alone so that a
      // misconfigured cacheDir pointing at a shared/important directory
      // doesn't cause data loss.
      expect(existsSync(cacheDir)).toBe(true);
    });

    it('does not throw when cache directory does not exist', async () => {
      const manager = new CacheManager({ repoPath, cacheDir: join(tempDir, 'nonexistent'), noCache: false });
      await expect(manager.clear()).resolves.toBeUndefined();
    });
  });

  describe('createCacheManager', () => {
    it('creates a CacheManager with default cache directory', () => {
      const manager = createCacheManager('/test/repo', false);
      expect(manager.cacheFilePath_).toContain('cache');
      expect(manager.cacheFilePath_).toContain('repodoctor');
      expect(manager.cacheFilePath_).toContain('cache.json');
    });

    it('creates a CacheManager with noCache=true', () => {
      const manager = createCacheManager('/test/repo', true);
      expect(manager.cacheFilePath_).toBeDefined();
    });
  });

  describe('schema version mismatch', () => {
    it('returns stale when cache file has wrong schema version', async () => {
      const manager = new CacheManager({ repoPath, cacheDir, noCache: false });
      await manager.write('fp', META, makeScanResult(), makeAnalysisResult());

      // Corrupt the cache file by changing the schema version.
      const { readFile, writeFile } = await import('node:fs/promises');
      const content = await readFile(join(cacheDir, 'cache.json'), 'utf8');
      const parsed = JSON.parse(content) as { schemaVersion: number };
      parsed.schemaVersion = 999;
      await writeFile(join(cacheDir, 'cache.json'), JSON.stringify(parsed), 'utf8');

      const lookup = await manager.lookup('fp', META);
      expect(lookup.hit).toBe(false);
      if (!lookup.hit) {
        expect(lookup.reason).toBe('stale');
      }
    });
  });

  describe('corrupted cache file', () => {
    it('returns no-cache-file when JSON is invalid', async () => {
      const { writeFile, mkdir } = await import('node:fs/promises');
      await mkdir(cacheDir, { recursive: true });
      await writeFile(join(cacheDir, 'cache.json'), '{ invalid json', 'utf8');

      const manager = new CacheManager({ repoPath, cacheDir, noCache: false });
      const lookup = await manager.lookup('fp', META);
      expect(lookup.hit).toBe(false);
      if (!lookup.hit) {
        expect(lookup.reason).toBe('no-cache-file');
      }
    });

    it('write overwrites an existing cache file with wrong schema version', async () => {
      const { writeFile, mkdir } = await import('node:fs/promises');
      await mkdir(cacheDir, { recursive: true });
      // Write a cache file with wrong schema version.
      await writeFile(
        join(cacheDir, 'cache.json'),
        JSON.stringify({ schemaVersion: 999, entries: {} }),
        'utf8',
      );

      const manager = new CacheManager({ repoPath, cacheDir, noCache: false });
      await manager.write('fp', META, makeScanResult(), makeAnalysisResult());

      // Now lookup should succeed (the write replaced the file).
      const lookup = await manager.lookup('fp', META);
      expect(lookup.hit).toBe(true);
    });

    it('clear catches errors without throwing when rm fails', async () => {
      // Use a path that will cause rm to throw (e.g., a path with a null byte
      // or a path whose parent is a file, not a directory).
      const manager = new CacheManager({
        repoPath,
        cacheDir: '/dev/null/impossible/cache/path',
        noCache: false,
      });
      // This should not throw even though the path is invalid.
      await expect(manager.clear()).resolves.toBeUndefined();
    });
  });
});
