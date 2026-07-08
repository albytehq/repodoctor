/**
 * Integration tests for the DiscoveryEngine.
 *
 * Coverage:
 *   - Standard TypeScript project with pnpm.
 *   - Empty directory -> type: Unknown.
 *   - Monorepo with workspaces.
 *   - Malformed package.json -> MalformedJsonError.
 *   - Framework detection end-to-end.
 *   - Fingerprint determinism across runs.
 *   - Root file cap at 50 entries.
 *   - ignoreRoot filtering.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DiscoveryEngine } from '@repodoctor/discovery/DiscoveryEngine';
import { MalformedJsonError } from '@repodoctor/errors/MalformedJsonError';
import { Repository } from '@repodoctor/core/domain/Repository';
import { InMemoryFileSystem, CapturingLogger } from '../helpers';

describe('DiscoveryEngine — integration', () => {
  let logger: CapturingLogger;

  beforeEach(() => {
    logger = new CapturingLogger();
  });

  it('discovers a standard TypeScript project with pnpm', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/package.json': JSON.stringify({
        name: 'my-app',
        type: 'module',
        dependencies: { next: '14.0.0', react: '18.0.0', 'react-dom': '18.0.0' },
        devDependencies: { typescript: '5.0.0' },
      }),
      '/repo/tsconfig.json': '{}',
      '/repo/pnpm-lock.yaml': '',
      '/repo/README.md': '# my-app',
      '/repo/.gitignore': 'node_modules',
    });
    const engine = new DiscoveryEngine({
      fileSystem: fs,
      repository: new Repository('/repo'),
      logger,
      ignoreRoot: [],
    });
    const result = await engine.run();

    expect(result.profile.name).toBe('my-app');
    expect(result.profile.type).toBe('NodeApplication');
    expect(result.profile.languages).toEqual(['TypeScript']);
    expect(result.profile.packageManager).toBe('Pnpm');
    expect(result.profile.isMonorepo).toBe(false);
    expect(result.profile.workspaces).toEqual([]);
    expect(result.profile.frameworks).toContainEqual({ name: 'Next.js', confidence: 'High' });
    expect(result.profile.frameworks).toContainEqual({ name: 'React', confidence: 'High' });

    const rootFileNames = result.profile.rootFiles.map((f) => f.name).sort();
    expect(rootFileNames).toContain('package.json');
    expect(rootFileNames).toContain('tsconfig.json');
    expect(rootFileNames).toContain('pnpm-lock.yaml');
    expect(rootFileNames).toContain('README.md');

    const configFiles = result.profile.configFiles;
    expect(configFiles.find((c) => c.name === 'tsconfig.json')?.exists).toBe(true);
    expect(configFiles.find((c) => c.name === 'lerna.json')?.exists).toBe(false);

    expect(result.fingerprint.hash).toMatch(/^[0-9a-f]{16}$/);
    expect(result.discoveredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('discovers an empty directory as Unknown', async () => {
    const fs = new InMemoryFileSystem({});
    const engine = new DiscoveryEngine({
      fileSystem: fs,
      repository: new Repository('/empty'),
      logger,
      ignoreRoot: [],
    });
    const result = await engine.run();

    expect(result.profile.name).toBe('empty');
    expect(result.profile.type).toBe('Unknown');
    expect(result.profile.languages).toEqual(['Unknown']);
    expect(result.profile.packageManager).toBe('Unknown');
    expect(result.profile.isMonorepo).toBe(false);
    expect(result.profile.frameworks).toEqual([]);
    expect(result.profile.rootFiles).toEqual([]);
  });

  it('discovers a monorepo with workspaces', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/package.json': JSON.stringify({
        name: 'my-monorepo',
        workspaces: ['packages/*', 'apps/*'],
      }),
      '/repo/package-lock.json': '',
    });
    const engine = new DiscoveryEngine({
      fileSystem: fs,
      repository: new Repository('/repo'),
      logger,
      ignoreRoot: [],
    });
    const result = await engine.run();

    expect(result.profile.type).toBe('NodeMonorepo');
    expect(result.profile.isMonorepo).toBe(true);
    expect(result.profile.workspaces).toEqual(['packages/*', 'apps/*']);
    expect(result.profile.packageManager).toBe('Npm');
  });

  it('discovers a monorepo via pnpm-workspace.yaml', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/package.json': JSON.stringify({ name: 'pnpm-mono' }),
      '/repo/pnpm-workspace.yaml': 'packages:\n  - "packages/*"',
      '/repo/pnpm-lock.yaml': '',
    });
    const engine = new DiscoveryEngine({
      fileSystem: fs,
      repository: new Repository('/repo'),
      logger,
      ignoreRoot: [],
    });
    const result = await engine.run();

    expect(result.profile.type).toBe('NodeMonorepo');
    expect(result.profile.isMonorepo).toBe(true);
    expect(result.profile.packageManager).toBe('Pnpm');
  });

  it('throws MalformedJsonError when package.json is invalid', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/package.json': '{ malformed json',
    });
    const engine = new DiscoveryEngine({
      fileSystem: fs,
      repository: new Repository('/repo'),
      logger,
      ignoreRoot: [],
    });
    await expect(engine.run()).rejects.toBeInstanceOf(MalformedJsonError);
  });

  it('detects JavaScript when package.json exists but tsconfig.json does not', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/package.json': JSON.stringify({ name: 'js-app' }),
    });
    const engine = new DiscoveryEngine({
      fileSystem: fs,
      repository: new Repository('/repo'),
      logger,
      ignoreRoot: [],
    });
    const result = await engine.run();
    expect(result.profile.languages).toEqual(['JavaScript']);
    expect(result.profile.type).toBe('NodeApplication');
  });

  it('detects packageManager field override', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/package.json': JSON.stringify({
        name: 'override-app',
        packageManager: 'yarn@3.2.1',
      }),
      '/repo/package-lock.json': '',
    });
    const engine = new DiscoveryEngine({
      fileSystem: fs,
      repository: new Repository('/repo'),
      logger,
      ignoreRoot: [],
    });
    const result = await engine.run();
    // packageManager field overrides lockfile
    expect(result.profile.packageManager).toBe('Yarn');
  });

  it('produces a deterministic fingerprint across multiple runs', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/package.json': JSON.stringify({ name: 'deterministic-app' }),
      '/repo/tsconfig.json': '{}',
    });
    const repo = new Repository('/repo');
    const engine1 = new DiscoveryEngine({ fileSystem: fs, repository: repo, logger, ignoreRoot: [] });
    const engine2 = new DiscoveryEngine({ fileSystem: fs, repository: repo, logger, ignoreRoot: [] });
    const result1 = await engine1.run();
    const result2 = await engine2.run();
    expect(result1.fingerprint.hash).toBe(result2.fingerprint.hash);
    expect(result1.fingerprint.basis).toEqual(result2.fingerprint.basis);
  });

  it('caps root files at 50 entries', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 60; i++) {
      const name = `file-${i.toString().padStart(2, '0')}.txt`;
      files[`/repo/${name}`] = 'x';
    }
    const fs = new InMemoryFileSystem(files);
    const engine = new DiscoveryEngine({
      fileSystem: fs,
      repository: new Repository('/repo'),
      logger,
      ignoreRoot: [],
    });
    const result = await engine.run();
    expect(result.profile.rootFiles.length).toBe(50);
  });

  it('filters out directories in the ignoreRoot list', async () => {
    // The InMemoryFileSystem.readDir derives directory entries from paths
    // that have subdirectories. We add a file under "node_modules" to
    // simulate a directory entry, then verify it's filtered.
    const fs = new InMemoryFileSystem({
      '/repo/package.json': JSON.stringify({ name: 'ignore-test' }),
      '/repo/node_modules/some-package/index.js': '',
    });
    const engine = new DiscoveryEngine({
      fileSystem: fs,
      repository: new Repository('/repo'),
      logger,
      ignoreRoot: ['node_modules'],
    });
    const result = await engine.run();
    // The "node_modules" directory entry should NOT appear in rootFiles
    // (it's a directory, not a file, so it's already filtered by isFile).
    // But we also verify that the ignoreRoot list is applied as a
    // secondary safeguard.
    const rootFileNames = result.profile.rootFiles.map((f) => f.name);
    expect(rootFileNames).not.toContain('node_modules');
  });

  it('falls back to folder name when package.json has no name field', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/package.json': JSON.stringify({ version: '1.0.0' }),
    });
    const engine = new DiscoveryEngine({
      fileSystem: fs,
      repository: new Repository('/repo'),
      logger,
      ignoreRoot: [],
    });
    const result = await engine.run();
    expect(result.profile.name).toBe('repo');
  });

  it('emits debug logs at each step', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/package.json': JSON.stringify({ name: 'debug-app' }),
    });
    const engine = new DiscoveryEngine({
      fileSystem: fs,
      repository: new Repository('/repo'),
      logger,
      ignoreRoot: [],
    });
    await engine.run();
    const debugMessages = logger.calls.filter((c) => c.level === 'debug').map((c) => c.message);
    expect(debugMessages).toContain('Discovery starting.');
    expect(debugMessages).toContain('Root directory read.');
    expect(debugMessages).toContain('Root files collected.');
    expect(debugMessages).toContain('package.json parsed.');
    expect(debugMessages).toContain('Detectors completed.');
    expect(debugMessages).toContain('Fingerprint generated.');
    expect(debugMessages).toContain('Discovery complete.');
  });

  it('filters out files whose names match the ignoreRoot list', async () => {
    // Add a file named "node_modules" (which is normally a directory name)
    // to verify the ignoreRoot safeguard works on file entries too.
    const fs = new InMemoryFileSystem({
      '/repo/package.json': JSON.stringify({ name: 'ignore-file-test' }),
      '/repo/node_modules': 'this is a file, not a directory',
      '/repo/README.md': '# readme',
    });
    const engine = new DiscoveryEngine({
      fileSystem: fs,
      repository: new Repository('/repo'),
      logger,
      ignoreRoot: ['node_modules'],
    });
    const result = await engine.run();
    const rootFileNames = result.profile.rootFiles.map((f) => f.name);
    expect(rootFileNames).not.toContain('node_modules');
    expect(rootFileNames).toContain('package.json');
    expect(rootFileNames).toContain('README.md');
  });

  it('handles a repository path with a trailing slash', async () => {
    // Exercises the `root.endsWith('/')` branch in joinPath.
    const fs = new InMemoryFileSystem({
      '/repo/package.json': JSON.stringify({ name: 'trailing-slash' }),
    });
    const engine = new DiscoveryEngine({
      fileSystem: fs,
      repository: new Repository('/repo/'),
      logger,
      ignoreRoot: [],
    });
    const result = await engine.run();
    expect(result.profile.name).toBe('trailing-slash');
    expect(result.profile.rootFiles.length).toBeGreaterThan(0);
    // The file path should NOT have a double slash.
    const pkgFile = result.profile.rootFiles.find((f) => f.name === 'package.json');
    expect(pkgFile?.path).toBe('/repo/package.json');
  });
});
