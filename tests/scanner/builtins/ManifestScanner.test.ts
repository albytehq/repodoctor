/**
 * Unit tests for ManifestScanner.
 *
 * Coverage:
 *   - Supports NodeApplication and NodeMonorepo, not Unknown.
 *   - Emits DEPENDENCY_DECLARED with dep names.
 *   - Emits SCRIPT_DEFINED with script names.
 *   - Emits PACKAGE_MANAGER_LOCKFILE_EXISTS.
 *   - Returns empty when package.json is missing.
 *   - Returns empty when package.json is malformed.
 */

import { describe, it, expect } from 'vitest';
import { ManifestScanner } from '@repodoctor/scanner/builtins/ManifestScanner';
import type { RepositoryProfile } from '@repodoctor/core/domain/Discovery';
import { MockScannerFileSystem } from '../helpers';

function makeProfile(type: RepositoryProfile['type']): RepositoryProfile {
  return {
    name: 'test',
    type,
    languages: ['TypeScript'],
    packageManager: 'Npm',
    isMonorepo: false,
    workspaces: [],
    frameworks: [],
    rootFiles: [],
    configFiles: [],
  };
}

describe('ManifestScanner', () => {
  it('has the correct id and version', () => {
    const scanner = new ManifestScanner();
    expect(scanner.id).toBe('manifest-scanner');
    expect(scanner.version).toBe('1.0.0');
  });

  it('supports NodeApplication', () => {
    const scanner = new ManifestScanner();
    expect(scanner.supports(makeProfile('NodeApplication'))).toBe(true);
  });

  it('supports NodeMonorepo', () => {
    const scanner = new ManifestScanner();
    expect(scanner.supports(makeProfile('NodeMonorepo'))).toBe(true);
  });

  it('does not support Unknown', () => {
    const scanner = new ManifestScanner();
    expect(scanner.supports(makeProfile('Unknown'))).toBe(false);
  });

  it('emits DEPENDENCY_DECLARED with dep names', async () => {
    const fs = new MockScannerFileSystem({
      'package.json': JSON.stringify({
        dependencies: { react: '18.0.0', express: '4.0.0' },
        devDependencies: { typescript: '5.0.0' },
        scripts: { build: 'tsc', test: 'vitest' },
      }),
    });
    const scanner = new ManifestScanner();
    const facts = await scanner.execute({
      fs,
      profile: makeProfile('NodeApplication'),
      workspace: { cwd: '/repo', isCI: false, isInteractive: true } as never,
    });

    const depFact = facts.find((f) => f.type === 'DEPENDENCY_DECLARED');
    expect(depFact).toBeDefined();
    expect(depFact?.target).toBe('package.json');
    expect(depFact?.value).toEqual(['react', 'express']);
  });

  it('emits SCRIPT_DEFINED with script names', async () => {
    const fs = new MockScannerFileSystem({
      'package.json': JSON.stringify({
        dependencies: {},
        scripts: { build: 'tsc', test: 'vitest', dev: 'tsx' },
      }),
    });
    const scanner = new ManifestScanner();
    const facts = await scanner.execute({
      fs,
      profile: makeProfile('NodeApplication'),
      workspace: { cwd: '/repo', isCI: false, isInteractive: true } as never,
    });

    const scriptFact = facts.find((f) => f.type === 'SCRIPT_DEFINED');
    expect(scriptFact).toBeDefined();
    expect(scriptFact?.value).toEqual(['build', 'test', 'dev']);
  });

  it('emits PACKAGE_MANAGER_LOCKFILE_EXISTS true when lockfile exists', async () => {
    const fs = new MockScannerFileSystem({
      'package.json': JSON.stringify({ dependencies: {}, scripts: {} }),
      'pnpm-lock.yaml': '',
    });
    const scanner = new ManifestScanner();
    const facts = await scanner.execute({
      fs,
      profile: makeProfile('NodeApplication'),
      workspace: { cwd: '/repo', isCI: false, isInteractive: true } as never,
    });

    const lockfileFact = facts.find((f) => f.type === 'PACKAGE_MANAGER_LOCKFILE_EXISTS');
    expect(lockfileFact?.value).toBe(true);
  });

  it('emits PACKAGE_MANAGER_LOCKFILE_EXISTS false when no lockfile', async () => {
    const fs = new MockScannerFileSystem({
      'package.json': JSON.stringify({ dependencies: {}, scripts: {} }),
    });
    const scanner = new ManifestScanner();
    const facts = await scanner.execute({
      fs,
      profile: makeProfile('NodeApplication'),
      workspace: { cwd: '/repo', isCI: false, isInteractive: true } as never,
    });

    const lockfileFact = facts.find((f) => f.type === 'PACKAGE_MANAGER_LOCKFILE_EXISTS');
    expect(lockfileFact?.value).toBe(false);
  });

  it('returns empty when package.json is missing', async () => {
    const fs = new MockScannerFileSystem({});
    const scanner = new ManifestScanner();
    const facts = await scanner.execute({
      fs,
      profile: makeProfile('NodeApplication'),
      workspace: { cwd: '/repo', isCI: false, isInteractive: true } as never,
    });
    expect(facts).toEqual([]);
  });

  it('returns empty when package.json is malformed', async () => {
    const fs = new MockScannerFileSystem({
      'package.json': '{ malformed',
    });
    const scanner = new ManifestScanner();
    const facts = await scanner.execute({
      fs,
      profile: makeProfile('NodeApplication'),
      workspace: { cwd: '/repo', isCI: false, isInteractive: true } as never,
    });
    expect(facts).toEqual([]);
  });

  it('does not emit DEPENDENCY_DECLARED when deps is empty', async () => {
    const fs = new MockScannerFileSystem({
      'package.json': JSON.stringify({ dependencies: {}, scripts: {} }),
    });
    const scanner = new ManifestScanner();
    const facts = await scanner.execute({
      fs,
      profile: makeProfile('NodeApplication'),
      workspace: { cwd: '/repo', isCI: false, isInteractive: true } as never,
    });
    expect(facts.find((f) => f.type === 'DEPENDENCY_DECLARED')).toBeUndefined();
  });

  it('filters out non-string dependency values', async () => {
    const fs = new MockScannerFileSystem({
      'package.json': JSON.stringify({
        dependencies: { good: '1.0.0', bad: 42, alsoBad: null },
      }),
    });
    const scanner = new ManifestScanner();
    const facts = await scanner.execute({
      fs,
      profile: makeProfile('NodeApplication'),
      workspace: { cwd: '/repo', isCI: false, isInteractive: true } as never,
    });
    const depFact = facts.find((f) => f.type === 'DEPENDENCY_DECLARED');
    expect(depFact?.value).toEqual(['good']);
  });
});
