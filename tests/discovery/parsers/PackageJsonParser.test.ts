/**
 * Unit tests for PackageJsonParser.
 *
 * Coverage:
 *   - Valid JSON with all fields.
 *   - Valid JSON with missing fields.
 *   - Malformed JSON -> MalformedJsonError.
 *   - Missing file -> null (not an error).
 *   - Top-level non-object -> MalformedJsonError.
 *   - Non-string fields are silently dropped.
 *   - workspaces as array and as { packages: [...] }.
 */

import { describe, it, expect } from 'vitest';
import { parsePackageJson } from '@repodoctor/discovery/parsers/PackageJsonParser';
import { MalformedJsonError } from '@repodoctor/errors/MalformedJsonError';
import type { DirEntry, FileStats, IFileSystem } from '@repodoctor/core/IFileSystem';
import { InMemoryFileSystem } from '../../helpers';

describe('PackageJsonParser', () => {
  it('parses a valid package.json with all fields', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/package.json': JSON.stringify({
        name: 'my-app',
        type: 'module',
        packageManager: 'pnpm@8.6.0',
        workspaces: ['packages/*'],
        dependencies: { next: '14.0.0', react: '18.0.0' },
        devDependencies: { typescript: '5.0.0' },
      }),
    });
    const data = await parsePackageJson(fs, '/repo/package.json');
    expect(data).not.toBeNull();
    expect(data?.name).toBe('my-app');
    expect(data?.type).toBe('module');
    expect(data?.packageManager).toBe('pnpm@8.6.0');
    expect(data?.workspaces).toEqual(['packages/*']);
    expect(data?.dependencies).toEqual({ next: '14.0.0', react: '18.0.0' });
    expect(data?.devDependencies).toEqual({ typescript: '5.0.0' });
  });

  it('parses a package.json with missing fields', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/package.json': JSON.stringify({ name: 'minimal' }),
    });
    const data = await parsePackageJson(fs, '/repo/package.json');
    expect(data?.name).toBe('minimal');
    expect(data?.type).toBeUndefined();
    expect(data?.packageManager).toBeUndefined();
    expect(data?.workspaces).toBeUndefined();
    expect(data?.dependencies).toBeUndefined();
    expect(data?.devDependencies).toBeUndefined();
  });

  it('returns null when package.json does not exist', async () => {
    const fs = new InMemoryFileSystem({});
    const data = await parsePackageJson(fs, '/repo/package.json');
    expect(data).toBeNull();
  });

  it('throws MalformedJsonError when JSON is invalid', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/package.json': '{ this is not valid json',
    });
    await expect(parsePackageJson(fs, '/repo/package.json')).rejects.toBeInstanceOf(
      MalformedJsonError,
    );
  });

  it('throws MalformedJsonError when top-level value is an array', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/package.json': JSON.stringify([1, 2, 3]),
    });
    await expect(parsePackageJson(fs, '/repo/package.json')).rejects.toBeInstanceOf(
      MalformedJsonError,
    );
  });

  it('throws MalformedJsonError when top-level value is null', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/package.json': 'null',
    });
    await expect(parsePackageJson(fs, '/repo/package.json')).rejects.toBeInstanceOf(
      MalformedJsonError,
    );
  });

  it('throws MalformedJsonError when top-level value is a number', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/package.json': '42',
    });
    await expect(parsePackageJson(fs, '/repo/package.json')).rejects.toBeInstanceOf(
      MalformedJsonError,
    );
  });

  it('silently drops non-string name field', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/package.json': JSON.stringify({ name: 42 }),
    });
    const data = await parsePackageJson(fs, '/repo/package.json');
    expect(data?.name).toBeUndefined();
  });

  it('normalizes workspaces from { packages: [...] } form', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/package.json': JSON.stringify({
        workspaces: { packages: ['packages/a', 'packages/b'] },
      }),
    });
    const data = await parsePackageJson(fs, '/repo/package.json');
    expect(data?.workspaces).toEqual(['packages/a', 'packages/b']);
  });

  it('drops non-string entries from workspaces array', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/package.json': JSON.stringify({
        workspaces: ['valid', 42, null, 'also-valid'],
      }),
    });
    const data = await parsePackageJson(fs, '/repo/package.json');
    expect(data?.workspaces).toEqual(['valid', 'also-valid']);
  });

  it('drops non-string values from dependencies', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/package.json': JSON.stringify({
        dependencies: { good: '1.0.0', bad: 42, alsoBad: null },
      }),
    });
    const data = await parsePackageJson(fs, '/repo/package.json');
    expect(data?.dependencies).toEqual({ good: '1.0.0' });
  });

  it('drops non-object dependencies', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/package.json': JSON.stringify({
        dependencies: 'not-an-object',
      }),
    });
    const data = await parsePackageJson(fs, '/repo/package.json');
    expect(data?.dependencies).toBeUndefined();
  });

  it('sets the path on the MalformedJsonError', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/package.json': '{ bad',
    });
    try {
      await parsePackageJson(fs, '/repo/package.json');
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(MalformedJsonError);
      expect((error as MalformedJsonError).path).toBe('/repo/package.json');
    }
  });

  it('rethrows non-FileNotFoundError errors from readFile', async () => {
    // Use a custom IFileSystem that throws a generic Error (not
    // FileNotFoundError) on readFile. This exercises the `throw error`
    // branch in parsePackageJson.
    const fs = new (class ThrowingFs implements IFileSystem {
      public readFile(_path: string): Promise<string> {
        return Promise.reject(new Error('EACCES: permission denied'));
      }
      public exists(_path: string): Promise<boolean> {
        return Promise.resolve(true);
      }
      public readDir(_path: string): Promise<readonly DirEntry[]> {
        return Promise.resolve([]);
      }
      public stat(_path: string): Promise<FileStats> {
        return Promise.reject(new Error('EACCES'));
      }
    })();
    await expect(parsePackageJson(fs, '/repo/package.json')).rejects.toThrow(
      'EACCES: permission denied',
    );
  });
});
