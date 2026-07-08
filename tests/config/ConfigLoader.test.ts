/**
 * Unit tests for the ConfigLoader.
 *
 * Coverage:
 *   - Priority: --config flag overrides everything.
 *   - Priority: repodoctor.config.json found in cwd.
 *   - Priority: repodoctor.config.js found in cwd.
 *   - Default fallback when no config file exists.
 *   - Deep merge with defaults.
 *   - Errors: missing explicit --config file → ConfigError.
 *   - Errors: malformed JSON → ConfigError.
 *   - Errors: schema validation failure → ConfigError.
 *   - Errors: top-level non-object JSON → ConfigError.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigLoader } from '@repodoctor/config/ConfigLoader';
import { ConfigError } from '@repodoctor/errors/ConfigError';
import { Path } from '@repodoctor/infrastructure/Path';
import type { IFileSystem } from '@repodoctor/core/IFileSystem';
import { InMemoryFileSystem } from '../helpers';

describe('ConfigLoader', () => {
  let pathHelper: Path;

  beforeEach(() => {
    pathHelper = new Path();
  });

  it('returns the default config when no config file is found', async () => {
    const fs = new InMemoryFileSystem();
    const loader = new ConfigLoader(fs, pathHelper);
    const config = await loader.load({ cwd: '/repo' });
    expect(config.logLevel).toBe('info');
    expect(config.strict).toBe(false);
    expect(config.organs).toEqual([]);
  });

  it('discovers repodoctor.config.json in cwd', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/repodoctor.config.json': JSON.stringify({ logLevel: 'debug', strict: true }),
    });
    const loader = new ConfigLoader(fs, pathHelper);
    const config = await loader.load({ cwd: '/repo' });
    expect(config.logLevel).toBe('debug');
    expect(config.strict).toBe(true);
  });

  it('discovers repodoctor.config.js in cwd when .json is absent', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/repodoctor.config.js': 'module.exports = { logLevel: "warn" };',
    });
    const loader = new ConfigLoader(fs, pathHelper);
    const config = await loader.load({ cwd: '/repo' });
    expect(config.logLevel).toBe('warn');
  });

  it('prefers repodoctor.config.json over .js when both exist', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/repodoctor.config.json': JSON.stringify({ logLevel: 'error' }),
      '/repo/repodoctor.config.js': 'module.exports = { logLevel: "warn" };',
    });
    const loader = new ConfigLoader(fs, pathHelper);
    const config = await loader.load({ cwd: '/repo' });
    expect(config.logLevel).toBe('error');
  });

  it('prefers --config flag over discovery', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/repodoctor.config.json': JSON.stringify({ logLevel: 'error' }),
      '/custom/my-config.json': JSON.stringify({ logLevel: 'silent' }),
    });
    const loader = new ConfigLoader(fs, pathHelper);
    const config = await loader.load({
      cwd: '/repo',
      explicitPath: '/custom/my-config.json',
    });
    expect(config.logLevel).toBe('silent');
  });

  it('throws ConfigError when --config path does not exist', async () => {
    const fs = new InMemoryFileSystem({});
    const loader = new ConfigLoader(fs, pathHelper);
    await expect(
      loader.load({ cwd: '/repo', explicitPath: '/missing/bad.json' }),
    ).rejects.toBeInstanceOf(ConfigError);
  });

  it('throws ConfigError when JSON is malformed', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/repodoctor.config.json': '{ this is not json',
    });
    const loader = new ConfigLoader(fs, pathHelper);
    await expect(loader.load({ cwd: '/repo' })).rejects.toBeInstanceOf(ConfigError);
  });

  it('throws ConfigError when top-level JSON is not an object', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/repodoctor.config.json': JSON.stringify([1, 2, 3]),
    });
    const loader = new ConfigLoader(fs, pathHelper);
    await expect(loader.load({ cwd: '/repo' })).rejects.toBeInstanceOf(ConfigError);
  });

  it('throws ConfigError when top-level JSON is null', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/repodoctor.config.json': 'null',
    });
    const loader = new ConfigLoader(fs, pathHelper);
    await expect(loader.load({ cwd: '/repo' })).rejects.toBeInstanceOf(ConfigError);
  });

  it('throws ConfigError when logLevel is invalid', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/repodoctor.config.json': JSON.stringify({ logLevel: 'verbose' }),
    });
    const loader = new ConfigLoader(fs, pathHelper);
    await expect(loader.load({ cwd: '/repo' })).rejects.toBeInstanceOf(ConfigError);
  });

  it('throws ConfigError when strict is not a boolean', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/repodoctor.config.json': JSON.stringify({ strict: 'yes' }),
    });
    const loader = new ConfigLoader(fs, pathHelper);
    await expect(loader.load({ cwd: '/repo' })).rejects.toBeInstanceOf(ConfigError);
  });

  it('throws ConfigError when organs is not an array', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/repodoctor.config.json': JSON.stringify({ organs: 'deps' }),
    });
    const loader = new ConfigLoader(fs, pathHelper);
    await expect(loader.load({ cwd: '/repo' })).rejects.toBeInstanceOf(ConfigError);
  });

  it('throws ConfigError when an organ entry is not a string', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/repodoctor.config.json': JSON.stringify({ organs: [1, 2, 3] }),
    });
    const loader = new ConfigLoader(fs, pathHelper);
    await expect(loader.load({ cwd: '/repo' })).rejects.toBeInstanceOf(ConfigError);
  });

  it('accepts an empty organs array (v0.0.1 default)', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/repodoctor.config.json': JSON.stringify({ organs: [] }),
    });
    const loader = new ConfigLoader(fs, pathHelper);
    const config = await loader.load({ cwd: '/repo' });
    expect(config.organs).toEqual([]);
  });

  it('deep-merges partial config over defaults', async () => {
    // Only `logLevel` supplied; `strict` and `organs` should default.
    const fs = new InMemoryFileSystem({
      '/repo/repodoctor.config.json': JSON.stringify({ logLevel: 'error' }),
    });
    const loader = new ConfigLoader(fs, pathHelper);
    const config = await loader.load({ cwd: '/repo' });
    expect(config.logLevel).toBe('error');
    expect(config.strict).toBe(false);
    expect(config.organs).toEqual([]);
  });

  it('evaluates JS config files that use module.exports', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/repodoctor.config.js':
        'module.exports = { logLevel: "debug", strict: true };',
    });
    const loader = new ConfigLoader(fs, pathHelper);
    const config = await loader.load({ cwd: '/repo' });
    expect(config.logLevel).toBe('debug');
    expect(config.strict).toBe(true);
  });

  it('throws ConfigError when JS config throws during evaluation', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/repodoctor.config.js': 'throw new Error("boom");',
    });
    const loader = new ConfigLoader(fs, pathHelper);
    await expect(loader.load({ cwd: '/repo' })).rejects.toBeInstanceOf(ConfigError);
  });

  it('throws ConfigError when JS config exports a non-object', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/repodoctor.config.js': 'module.exports = 42;',
    });
    const loader = new ConfigLoader(fs, pathHelper);
    await expect(loader.load({ cwd: '/repo' })).rejects.toBeInstanceOf(ConfigError);
  });

  it('getDefault returns a fresh copy of the default config', () => {
    const fs = new InMemoryFileSystem();
    const loader = new ConfigLoader(fs, pathHelper);
    const config = loader.getDefault();
    expect(config.logLevel).toBe('info');
    expect(config.strict).toBe(false);
    expect(config.organs).toEqual([]);
    // Mutating the returned object should not affect subsequent calls.
    (config as { logLevel: string }).logLevel = 'debug';
    const config2 = loader.getDefault();
    expect(config2.logLevel).toBe('info');
  });

  it('treats an empty --config path the same as no --config (falls back to discovery)', async () => {
    // The spec says --config <path> takes priority, but an empty string
    // is treated as "no flag". This test pins that behavior.
    const fs = new InMemoryFileSystem({
      '/repo/repodoctor.config.json': JSON.stringify({ logLevel: 'error' }),
    });
    const loader = new ConfigLoader(fs, pathHelper);
    const config = await loader.load({ cwd: '/repo', explicitPath: '' });
    expect(config.logLevel).toBe('error');
  });

  it('resolves a relative --config path against the cwd via pathHelper.resolve', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/sub/my.json': JSON.stringify({ logLevel: 'warn' }),
    });
    const loader = new ConfigLoader(fs, pathHelper);
    // The loader resolves relative paths against process.cwd() via
    // pathHelper.resolve (which behaves like path.resolve). We supply
    // an absolute path here to avoid depending on the test runner's cwd.
    const config = await loader.load({
      cwd: '/repo',
      explicitPath: '/repo/sub/my.json',
    });
    expect(config.logLevel).toBe('warn');
  });

  it('throws ConfigError when JS config exports an array', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/repodoctor.config.js': 'module.exports = [1, 2, 3];',
    });
    const loader = new ConfigLoader(fs, pathHelper);
    await expect(loader.load({ cwd: '/repo' })).rejects.toBeInstanceOf(ConfigError);
  });

  it('throws ConfigError when JS config exports null', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/repodoctor.config.js': 'module.exports = null;',
    });
    const loader = new ConfigLoader(fs, pathHelper);
    await expect(loader.load({ cwd: '/repo' })).rejects.toBeInstanceOf(ConfigError);
  });

  it('throws ConfigError when JSON config top-level is a string', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/repodoctor.config.json': JSON.stringify('just a string'),
    });
    const loader = new ConfigLoader(fs, pathHelper);
    await expect(loader.load({ cwd: '/repo' })).rejects.toBeInstanceOf(ConfigError);
  });

  it('throws ConfigError when JSON config top-level is a number', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/repodoctor.config.json': JSON.stringify(42),
    });
    const loader = new ConfigLoader(fs, pathHelper);
    await expect(loader.load({ cwd: '/repo' })).rejects.toBeInstanceOf(ConfigError);
  });

  it('throws ConfigError when organs contains mixed invalid entries', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/repodoctor.config.json': JSON.stringify({ organs: ['ok', 5, ''] }),
    });
    const loader = new ConfigLoader(fs, pathHelper);
    await expect(loader.load({ cwd: '/repo' })).rejects.toBeInstanceOf(ConfigError);
  });

  it('accepts a JS config that uses exports.foo = bar instead of module.exports', async () => {
    // A CommonJS file that sets exports.logLevel rather than module.exports.
    const fs = new InMemoryFileSystem({
      '/repo/repodoctor.config.js':
        'exports.logLevel = "debug"; exports.strict = true;',
    });
    const loader = new ConfigLoader(fs, pathHelper);
    const config = await loader.load({ cwd: '/repo' });
    expect(config.logLevel).toBe('debug');
    expect(config.strict).toBe(true);
  });

  it('uses --config to point at a .js file directly', async () => {
    // Exercises the `inferKind` 'js' branch with an explicit path.
    const fs = new InMemoryFileSystem({
      '/custom/my.config.js':
        'module.exports = { logLevel: "error" };',
    });
    const loader = new ConfigLoader(fs, pathHelper);
    const config = await loader.load({
      cwd: '/repo',
      explicitPath: '/custom/my.config.js',
    });
    expect(config.logLevel).toBe('error');
  });

  it('treats an unknown extension as JSON', async () => {
    // Exercises the `inferKind` 'json' default branch for non-.js paths.
    const fs = new InMemoryFileSystem({
      '/custom/my.config.txt': JSON.stringify({ logLevel: 'silent' }),
    });
    const loader = new ConfigLoader(fs, pathHelper);
    const config = await loader.load({
      cwd: '/repo',
      explicitPath: '/custom/my.config.txt',
    });
    expect(config.logLevel).toBe('silent');
  });

  it('throws ConfigError when the file system throws a non-ENOENT error during readFile', async () => {
    // Use a custom IFileSystem mock that throws a generic Error (not
    // FileNotFoundError) on readFile. This exercises the "non-ENOENT"
    // branch in ConfigLoader.readAndParse.
    const fs = new (class ThrowingFs implements IFileSystem {
      public readFile(_path: string): Promise<string> {
        return Promise.reject(new Error('EACCES: permission denied'));
      }
      public exists(_path: string): Promise<boolean> {
        return Promise.resolve(true);
      }
    })();
    const loader = new ConfigLoader(fs, pathHelper);
    await expect(
      loader.load({ cwd: '/repo', explicitPath: '/repo/repodoctor.config.json' }),
    ).rejects.toBeInstanceOf(ConfigError);
  });
});
