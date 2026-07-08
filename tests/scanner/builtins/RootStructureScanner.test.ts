/**
 * Unit tests for RootStructureScanner.
 *
 * Coverage:
 *   - Emits FILE_EXISTS for each probed file.
 *   - Value is true when file exists, false when not.
 *   - Always runs (supports returns true).
 */

import { describe, it, expect } from 'vitest';
import { RootStructureScanner } from '@repodoctor/scanner/builtins/RootStructureScanner';
import type { RepositoryProfile } from '@repodoctor/core/domain/Discovery';
import { MockScannerFileSystem } from '../helpers';

const anyProfile: RepositoryProfile = {
  name: 'test',
  type: 'NodeApplication',
  languages: ['TypeScript'],
  packageManager: 'Npm',
  isMonorepo: false,
  workspaces: [],
  frameworks: [],
  rootFiles: [],
  configFiles: [],
};

describe('RootStructureScanner', () => {
  it('has the correct id and version', () => {
    const scanner = new RootStructureScanner();
    expect(scanner.id).toBe('root-structure-scanner');
    expect(scanner.version).toBe('1.0.0');
  });

  it('supports any profile', () => {
    const scanner = new RootStructureScanner();
    expect(scanner.supports(anyProfile)).toBe(true);
    expect(scanner.supports({ ...anyProfile, type: 'Unknown' })).toBe(true);
  });

  it('emits FILE_EXISTS for each probed file', async () => {
    const fs = new MockScannerFileSystem({
      '.gitignore': 'node_modules',
      'README.md': '# test',
      'LICENSE': 'MIT',
    });
    const scanner = new RootStructureScanner();
    const facts = await scanner.execute({
      fs,
      profile: anyProfile,
      workspace: { cwd: '/repo', isCI: false, isInteractive: true } as never,
    });

    expect(facts).toHaveLength(10); // 10 probed files (v0.0.9 expanded)
    const types = facts.map((f) => f.type);
    expect(types.every((t) => t === 'FILE_EXISTS')).toBe(true);

    const gitignore = facts.find((f) => f.target === '.gitignore');
    expect(gitignore?.value).toBe(true);

    const env = facts.find((f) => f.target === '.env');
    expect(env?.value).toBe(false);

    const envExample = facts.find((f) => f.target === '.env.example');
    expect(envExample?.value).toBe(false);

    const dockerfile = facts.find((f) => f.target === 'Dockerfile');
    expect(dockerfile?.value).toBe(false);

    const license = facts.find((f) => f.target === 'LICENSE');
    expect(license?.value).toBe(true);

    const readme = facts.find((f) => f.target === 'README.md');
    expect(readme?.value).toBe(true);
  });

  it('returns all false when no probed files exist', async () => {
    const fs = new MockScannerFileSystem({});
    const scanner = new RootStructureScanner();
    const facts = await scanner.execute({
      fs,
      profile: anyProfile,
      workspace: { cwd: '/repo', isCI: false, isInteractive: true } as never,
    });
    expect(facts).toHaveLength(10);
    expect(facts.every((f) => f.value === false)).toBe(true);
  });
});
