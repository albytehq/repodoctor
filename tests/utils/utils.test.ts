/**
 * Unit tests for the utility modules.
 *
 * Coverage:
 *   - environment.ts: isCI, isInteractive, isDebug.
 *   - platform.ts: getPlatformInfo, isLinux/isMacos/isWindows.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isCI, isInteractive, isDebug } from '@repodoctor/utils/environment';
import {
  getPlatformInfo,
  isLinux,
  isMacos,
  isWindows,
  _resetPlatformCacheForTests,
} from '@repodoctor/utils/platform';

describe('utils/environment — isCI', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Strip every CI-related env var before each test.
    for (const key of ['CI', 'GITHUB_ACTIONS', 'GITLAB_CI', 'CIRCLECI', 'JENKINS_URL', 'BUILDKITE', 'DRONE']) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    // Restore the original env.
    process.env = { ...originalEnv };
  });

  it('returns false when no CI env vars are set', () => {
    expect(isCI()).toBe(false);
  });

  it('returns true when CI=true', () => {
    process.env.CI = 'true';
    expect(isCI()).toBe(true);
  });

  it('returns true when GITHUB_ACTIONS=true', () => {
    process.env.GITHUB_ACTIONS = 'true';
    expect(isCI()).toBe(true);
  });

  it('returns true when GITLAB_CI is set to any truthy value', () => {
    process.env.GITLAB_CI = 'gitlab';
    expect(isCI()).toBe(true);
  });

  it('returns false when CI=false', () => {
    process.env.CI = 'false';
    expect(isCI()).toBe(false);
  });

  it('returns false when CI=0', () => {
    process.env.CI = '0';
    expect(isCI()).toBe(false);
  });
});

describe('utils/environment — isInteractive', () => {
  it('returns a boolean without throwing', () => {
    const result = isInteractive();
    expect(typeof result).toBe('boolean');
  });
});

describe('utils/environment — isDebug', () => {
  const originalArgv = process.argv;
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.argv = originalArgv;
    process.env = { ...originalEnv };
    delete process.env.DEBUG;
  });

  it('returns false when neither --debug nor DEBUG is set', () => {
    process.argv = ['node', 'repodoctor'];
    delete process.env.DEBUG;
    expect(isDebug()).toBe(false);
  });

  it('returns true when --debug is in argv', () => {
    process.argv = ['node', 'repodoctor', '--debug'];
    expect(isDebug()).toBe(true);
  });

  it('returns true when DEBUG env var is set', () => {
    process.argv = ['node', 'repodoctor'];
    process.env.DEBUG = '1';
    expect(isDebug()).toBe(true);
  });

  it('returns false when DEBUG=false', () => {
    process.argv = ['node', 'repodoctor'];
    process.env.DEBUG = 'false';
    expect(isDebug()).toBe(false);
  });
});

describe('utils/platform', () => {
  beforeEach(() => {
    _resetPlatformCacheForTests();
  });

  it('getPlatformInfo returns an object with the expected shape', () => {
    const info = getPlatformInfo();
    expect(info).toHaveProperty('platform');
    expect(info).toHaveProperty('arch');
    expect(info).toHaveProperty('release');
    expect(info).toHaveProperty('nodeVersion');
    expect(['linux', 'darwin', 'win32', 'other']).toContain(info.platform);
    expect(['x64', 'arm64', 'other']).toContain(info.arch);
    expect(info.nodeVersion).toMatch(/^v\d+\.\d+\.\d+/);
  });

  it('caches the platform snapshot (same reference on second call)', () => {
    const a = getPlatformInfo();
    const b = getPlatformInfo();
    expect(a).toBe(b);
  });

  it('isLinux / isMacos / isWindows are mutually consistent with platform', () => {
    const info = getPlatformInfo();
    expect(isLinux()).toBe(info.platform === 'linux');
    expect(isMacos()).toBe(info.platform === 'darwin');
    expect(isWindows()).toBe(info.platform === 'win32');
  });

  it('exactly one of isLinux / isMacos / isWindows is true OR platform is "other"', () => {
    const trues = [isLinux(), isMacos(), isWindows()].filter(Boolean).length;
    const info = getPlatformInfo();
    if (info.platform === 'other') {
      // Could be 0 (no platform matches); we only assert <= 1.
      expect(trues).toBeLessThanOrEqual(1);
    } else {
      expect(trues).toBe(1);
    }
  });

  it('_resetPlatformCacheForTests invalidates the cache', () => {
    const a = getPlatformInfo();
    _resetPlatformCacheForTests();
    const b = getPlatformInfo();
    // After reset, a new object is returned (different reference).
    expect(a).not.toBe(b);
    // But the values are the same.
    expect(a.platform).toBe(b.platform);
    expect(a.arch).toBe(b.arch);
  });

  it('normalizes unknown platform strings to "other"', async () => {
    // Mock `node:os` to return an unknown platform and arch. This
    // exercises the `return 'other'` branches in normalizePlatform and
    // normalizeArch.
    vi.resetModules();
    vi.doMock('node:os', () => ({
      platform: () => 'freebsd',
      arch: () => 'mips',
      release: () => 'mocked-release',
    }));
    _resetPlatformCacheForTests();
    const { getPlatformInfo: mockedGetPlatformInfo, isLinux: mockedIsLinux, isMacos: mockedIsMacos, isWindows: mockedIsWindows } =
      await import('@repodoctor/utils/platform');
    const info = mockedGetPlatformInfo();
    expect(info.platform).toBe('other');
    expect(info.arch).toBe('other');
    expect(info.release).toBe('mocked-release');
    expect(mockedIsLinux()).toBe(false);
    expect(mockedIsMacos()).toBe(false);
    expect(mockedIsWindows()).toBe(false);
    vi.doUnmock('node:os');
    vi.resetModules();
  });

  it('normalizes win32/darwin/linux platforms correctly', async () => {
    for (const p of ['win32', 'darwin', 'linux'] as const) {
      vi.resetModules();
      vi.doMock('node:os', () => ({
        platform: () => p,
        arch: () => 'x64',
        release: () => 'r',
      }));
      _resetPlatformCacheForTests();
      const { getPlatformInfo: mockedGetPlatformInfo, isLinux: l, isMacos: m, isWindows: w } =
        await import('@repodoctor/utils/platform');
      const info = mockedGetPlatformInfo();
      expect(info.platform).toBe(p);
      expect(l()).toBe(p === 'linux');
      expect(m()).toBe(p === 'darwin');
      expect(w()).toBe(p === 'win32');
      vi.doUnmock('node:os');
    }
    vi.resetModules();
  });
});
