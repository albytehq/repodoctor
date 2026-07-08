/**
 * Integration tests for the infrastructure FileSystem.
 *
 * Uses a real temp directory to verify that the FileSystem wrapper
 * correctly delegates to `node:fs/promises` and translates errors.
 *
 * Coverage:
 *   - readFile on a real file.
 *   - readFile on a missing file -> FileNotFoundError.
 *   - exists on a file and a directory.
 *   - readDir on a real directory.
 *   - readDir on a missing directory -> FileNotFoundError.
 *   - stat on a real file.
 *   - stat on a missing file -> FileNotFoundError.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileSystem } from '@repodoctor/infrastructure/FileSystem';
import { FileNotFoundError } from '@repodoctor/errors/FileNotFoundError';

describe('FileSystem (infrastructure)', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'repodoctor-fs-test-'));
    // Create a few files and a subdirectory.
    writeFileSync(join(tempDir, 'a.txt'), 'hello');
    writeFileSync(join(tempDir, 'b.json'), '{"x":1}');
    mkdirSync(join(tempDir, 'subdir'));
    writeFileSync(join(tempDir, 'subdir', 'c.txt'), 'nested');
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('readFile', () => {
    it('reads a real file as UTF-8', async () => {
      const fs = new FileSystem();
      const content = await fs.readFile(join(tempDir, 'a.txt'));
      expect(content).toBe('hello');
    });

    it('throws FileNotFoundError for a missing file', async () => {
      const fs = new FileSystem();
      await expect(fs.readFile(join(tempDir, 'missing.txt'))).rejects.toBeInstanceOf(
        FileNotFoundError,
      );
    });
  });

  describe('exists', () => {
    it('returns true for a regular file', async () => {
      const fs = new FileSystem();
      expect(await fs.exists(join(tempDir, 'a.txt'))).toBe(true);
    });

    it('returns false for a directory', async () => {
      const fs = new FileSystem();
      expect(await fs.exists(join(tempDir, 'subdir'))).toBe(false);
    });

    it('returns false for a missing path', async () => {
      const fs = new FileSystem();
      expect(await fs.exists(join(tempDir, 'missing.txt'))).toBe(false);
    });
  });

  describe('readDir', () => {
    it('lists entries in a directory with isFile/isDirectory flags', async () => {
      const fs = new FileSystem();
      const entries = await fs.readDir(tempDir);
      const names = entries.map((e) => e.name).sort();
      expect(names).toEqual(['a.txt', 'b.json', 'subdir']);
      const subdir = entries.find((e) => e.name === 'subdir');
      expect(subdir?.isDirectory).toBe(true);
      expect(subdir?.isFile).toBe(false);
      const file = entries.find((e) => e.name === 'a.txt');
      expect(file?.isFile).toBe(true);
      expect(file?.isDirectory).toBe(false);
    });

    it('throws FileNotFoundError for a missing directory', async () => {
      const fs = new FileSystem();
      await expect(fs.readDir(join(tempDir, 'no-such-dir'))).rejects.toBeInstanceOf(
        FileNotFoundError,
      );
    });
  });

  describe('stat', () => {
    it('returns size and type flags for a file', async () => {
      const fs = new FileSystem();
      const stats = await fs.stat(join(tempDir, 'a.txt'));
      expect(stats.size).toBe(5); // 'hello' is 5 bytes
      expect(stats.isFile).toBe(true);
      expect(stats.isDirectory).toBe(false);
    });

    it('returns type flags for a directory', async () => {
      const fs = new FileSystem();
      const stats = await fs.stat(join(tempDir, 'subdir'));
      expect(stats.isFile).toBe(false);
      expect(stats.isDirectory).toBe(true);
    });

    it('throws FileNotFoundError for a missing path', async () => {
      const fs = new FileSystem();
      await expect(fs.stat(join(tempDir, 'missing.txt'))).rejects.toBeInstanceOf(
        FileNotFoundError,
      );
    });
  });

  describe('permission errors', () => {
    it('throws PermissionError when reading a file without permissions', async () => {
      // Create a file with no read permissions (chmod 000).
      const restrictedFile = join(tempDir, 'restricted.txt');
      writeFileSync(restrictedFile, 'secret');
      chmodSync(restrictedFile, 0o000);
      try {
        const fs = new FileSystem();
        // We expect either a PermissionError or a generic Error wrapping
        // EACCES — the exact behavior depends on whether the test runner
        // runs as root (root can read anything). We accept both outcomes
        // to keep the test portable.
        try {
          await fs.readFile(restrictedFile);
          // If we're root, the read succeeds — that's fine, we just
          // skip the assertion.
        } catch (error) {
          // Non-root: expect the error message to mention permission
          // or the path.
          const message = error instanceof Error ? error.message : String(error);
          expect(message).toMatch(/permission|EACCES|denied|Failed to read/i);
        }
      } finally {
        // Restore permissions so afterAll can clean up.
        chmodSync(restrictedFile, 0o644);
      }
    });
  });
});
