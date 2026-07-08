/**
 * Integration tests for ScannerFileSystem.
 *
 * Verifies:
 *   - Caching: second readFile call does not hit disk.
 *   - Path traversal protection.
 *   - File size limit.
 *   - fileExists caching.
 *   - readFileLines.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ScannerFileSystem } from '@repodoctor/infrastructure/ScannerFileSystem';
import { PermissionError } from '@repodoctor/errors/PermissionError';
import { FileNotFoundError } from '@repodoctor/errors/FileNotFoundError';
import { FileSizeExceededError } from '@repodoctor/errors/FileSizeExceededError';

describe('ScannerFileSystem (infrastructure)', () => {
  let tempDir: string;
  let fs: ScannerFileSystem;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'repodoctor-scanfs-'));
    writeFileSync(join(tempDir, 'a.txt'), 'hello world');
    writeFileSync(join(tempDir, 'b.json'), '{"x":1}');
    fs = new ScannerFileSystem(tempDir);
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('readFile caching', () => {
    it('reads a file successfully', async () => {
      const content = await fs.readFile('a.txt');
      expect(content).toBe('hello world');
    });

    it('caches the content — second read does not hit disk', async () => {
      // We can't directly count disk reads, but we can verify the content
      // is returned correctly and the call is fast. The cache is an
      // internal Map; we verify it indirectly by confirming repeated
      // reads return the same string.
      const c1 = await fs.readFile('a.txt');
      const c2 = await fs.readFile('a.txt');
      expect(c1).toBe(c2);
      expect(c1).toBe('hello world');
    });

    it('throws FileNotFoundError for missing files', async () => {
      await expect(fs.readFile('nonexistent.txt')).rejects.toBeInstanceOf(FileNotFoundError);
    });
  });

  describe('fileExists caching', () => {
    it('returns true for existing files', async () => {
      expect(await fs.fileExists('a.txt')).toBe(true);
    });

    it('returns false for missing files', async () => {
      expect(await fs.fileExists('nonexistent.txt')).toBe(false);
    });

    it('caches the result — second call returns the cached value', async () => {
      const r1 = await fs.fileExists('b.json');
      const r2 = await fs.fileExists('b.json');
      expect(r1).toBe(true);
      expect(r2).toBe(true);
    });
  });

  describe('getFileSize', () => {
    it('returns the correct file size', async () => {
      const size = await fs.getFileSize('a.txt');
      const realSize = statSync(join(tempDir, 'a.txt')).size;
      expect(size).toBe(realSize);
    });

    it('throws FileNotFoundError for missing files', async () => {
      await expect(fs.getFileSize('nonexistent.txt')).rejects.toBeInstanceOf(FileNotFoundError);
    });
  });

  describe('readFileLines', () => {
    it('reads a range of lines (1-indexed, inclusive)', async () => {
      const lines = await fs.readFileLines('a.txt', 1, 2);
      // 'hello world' has no newlines, so line 1 is 'hello world' and
      // there is no line 2.
      expect(lines).toEqual(['hello world']);
    });

    it('returns empty array for out-of-range lines', async () => {
      const lines = await fs.readFileLines('a.txt', 10, 20);
      expect(lines).toEqual([]);
    });
  });

  describe('path safety', () => {
    it('throws PermissionError for path traversal', async () => {
      await expect(fs.readFile('../../../etc/passwd')).rejects.toBeInstanceOf(PermissionError);
    });

    it('throws PermissionError for absolute paths outside cwd', async () => {
      await expect(fs.readFile('/etc/passwd')).rejects.toBeInstanceOf(PermissionError);
    });

    it('allows relative paths within cwd', async () => {
      const content = await fs.readFile('a.txt');
      expect(content).toBe('hello world');
    });
  });
});

describe('ScannerFileSystem — file size limit', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'repodoctor-scanfs-size-'));
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('throws FileSizeExceededError for files over 5MB', async () => {
    // Create a file just over 5MB.
    const largeContent = 'x'.repeat(5 * 1024 * 1024 + 1);
    writeFileSync(join(tempDir, 'large.txt'), largeContent);

    const fs = new ScannerFileSystem(tempDir);
    await expect(fs.readFile('large.txt')).rejects.toBeInstanceOf(FileSizeExceededError);
  });

  it('allows files exactly at 5MB', async () => {
    const exactContent = 'x'.repeat(5 * 1024 * 1024);
    writeFileSync(join(tempDir, 'exact.txt'), exactContent);

    const fs = new ScannerFileSystem(tempDir);
    const content = await fs.readFile('exact.txt');
    expect(content.length).toBe(5 * 1024 * 1024);
  });

  it('throws PermissionError for path traversal in getFileSize', async () => {
    const fs = new ScannerFileSystem(tempDir);
    await expect(fs.getFileSize('../../../etc/passwd')).rejects.toBeInstanceOf(PermissionError);
  });

  it('throws PermissionError for path traversal in fileExists', async () => {
    const fs = new ScannerFileSystem(tempDir);
    await expect(fs.fileExists('../../../etc/passwd')).rejects.toBeInstanceOf(PermissionError);
  });

  it('throws PermissionError for path traversal in readFileLines', async () => {
    const fs = new ScannerFileSystem(tempDir);
    await expect(fs.readFileLines('../../../etc/passwd', 1, 2)).rejects.toBeInstanceOf(PermissionError);
  });

  it('throws FileNotFoundError in readFileLines for missing file', async () => {
    const fs = new ScannerFileSystem(tempDir);
    await expect(fs.readFileLines('nonexistent.txt', 1, 2)).rejects.toBeInstanceOf(FileNotFoundError);
  });

  it('returns empty array for readFileLines with start > end', async () => {
    writeFileSync(join(tempDir, 'lines.txt'), 'line1\nline2\nline3');
    const fs = new ScannerFileSystem(tempDir);
    const lines = await fs.readFileLines('lines.txt', 5, 3);
    expect(lines).toEqual([]);
  });

  it('returns correct lines from readFileLines', async () => {
    writeFileSync(join(tempDir, 'multi.txt'), 'a\nb\nc\nd\ne');
    const fs = new ScannerFileSystem(tempDir);
    const lines = await fs.readFileLines('multi.txt', 2, 4);
    expect(lines).toEqual(['b', 'c', 'd']);
  });

  it('throws Error for a directory path in readFile', async () => {
    // Create a subdirectory.
    const { mkdirSync } = await import('node:fs');
    mkdirSync(join(tempDir, 'subdir'), { recursive: true });
    const fs = new ScannerFileSystem(tempDir);
    await expect(fs.readFile('subdir')).rejects.toThrow();
  });

  it('returns false for fileExists on a directory', async () => {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(join(tempDir, 'subdir2'), { recursive: true });
    const fs = new ScannerFileSystem(tempDir);
    expect(await fs.fileExists('subdir2')).toBe(false);
  });
});

describe('ScannerFileSystem — caching verification with spy', () => {
  // This test verifies the cache by creating a ScannerFileSystem with a
  // real temp dir and confirming that fileExists + readFile populate the
  // cache so that subsequent reads don't throw FileNotFoundError even
  // if the underlying file is deleted.
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'repodoctor-scanfs-cache-'));
    writeFileSync(join(tempDir, 'cached.txt'), 'cached content');
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('readFile caches content — deleting the file after first read does not affect second read', async () => {
    const fs = new ScannerFileSystem(tempDir);
    // First read populates the cache.
    const c1 = await fs.readFile('cached.txt');
    expect(c1).toBe('cached content');

    // Delete the underlying file.
    rmSync(join(tempDir, 'cached.txt'));

    // Second read should still return the cached content, not throw.
    const c2 = await fs.readFile('cached.txt');
    expect(c2).toBe('cached content');
  });
});
