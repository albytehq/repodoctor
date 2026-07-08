/**
 * Unit tests for DocumentationScanner, GitScanner, EnvironmentScanner.
 */

import { describe, it, expect } from 'vitest';
import { DocumentationScanner } from '@repodoctor/scanner/builtins/DocumentationScanner';
import { GitScanner } from '@repodoctor/scanner/builtins/GitScanner';
import { EnvironmentScanner } from '@repodoctor/scanner/builtins/EnvironmentScanner';
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

const anyProfile: RepositoryProfile = makeProfile('NodeApplication');

const fakeWorkspace = { cwd: '/repo', isCI: false, isInteractive: true } as never;

describe('DocumentationScanner', () => {
  it('has the correct id', () => {
    const scanner = new DocumentationScanner();
    expect(scanner.id).toBe('documentation-scanner');
  });

  it('always supports', () => {
    const scanner = new DocumentationScanner();
    expect(scanner.supports(anyProfile)).toBe(true);
  });

  it('emits FILE_SIZE_BYTES for README.md when it exists', async () => {
    const fs = new MockScannerFileSystem({ 'README.md': '# Hello World' });
    const scanner = new DocumentationScanner();
    const facts = await scanner.execute({ fs, profile: anyProfile, workspace: fakeWorkspace });

    const sizeFact = facts.find((f) => f.type === 'FILE_SIZE_BYTES' && f.target === 'README.md');
    expect(sizeFact).toBeDefined();
    expect(sizeFact?.value).toBe(13); // '# Hello World' is 13 bytes
  });

  it('does not emit FILE_SIZE_BYTES when README.md is missing', async () => {
    const fs = new MockScannerFileSystem({});
    const scanner = new DocumentationScanner();
    const facts = await scanner.execute({ fs, profile: anyProfile, workspace: fakeWorkspace });

    expect(facts.find((f) => f.type === 'FILE_SIZE_BYTES')).toBeUndefined();
  });

  it('emits FILE_EXISTS for CONTRIBUTING.md', async () => {
    const fs = new MockScannerFileSystem({ 'CONTRIBUTING.md': '# Contributing' });
    const scanner = new DocumentationScanner();
    const facts = await scanner.execute({ fs, profile: anyProfile, workspace: fakeWorkspace });

    const contribFact = facts.find((f) => f.target === 'CONTRIBUTING.md');
    expect(contribFact?.value).toBe(true);
  });

  it('emits FILE_EXISTS false for CONTRIBUTING.md when missing', async () => {
    const fs = new MockScannerFileSystem({});
    const scanner = new DocumentationScanner();
    const facts = await scanner.execute({ fs, profile: anyProfile, workspace: fakeWorkspace });

    const contribFact = facts.find((f) => f.target === 'CONTRIBUTING.md');
    expect(contribFact?.value).toBe(false);
  });
});

describe('GitScanner', () => {
  it('has the correct id', () => {
    const scanner = new GitScanner();
    expect(scanner.id).toBe('git-scanner');
  });

  it('always supports', () => {
    const scanner = new GitScanner();
    expect(scanner.supports(anyProfile)).toBe(true);
  });

  it('parses .gitignore entries, ignoring comments and blank lines', async () => {
    const fs = new MockScannerFileSystem({
      '.gitignore': '# comment\nnode_modules\n\ndist\n  # indented comment\n*.log',
    });
    const scanner = new GitScanner();
    const facts = await scanner.execute({ fs, profile: anyProfile, workspace: fakeWorkspace });

    const gitignoreFact = facts.find((f) => f.type === 'GITIGNORE_ENTRIES');
    expect(gitignoreFact).toBeDefined();
    expect(gitignoreFact?.value).toEqual(['node_modules', 'dist', '*.log']);
  });

  it('returns empty when .gitignore does not exist', async () => {
    const fs = new MockScannerFileSystem({});
    const scanner = new GitScanner();
    const facts = await scanner.execute({ fs, profile: anyProfile, workspace: fakeWorkspace });
    expect(facts).toEqual([]);
  });

  it('returns empty when .gitignore has only comments', async () => {
    const fs = new MockScannerFileSystem({
      '.gitignore': '# just comments\n# nothing else',
    });
    const scanner = new GitScanner();
    const facts = await scanner.execute({ fs, profile: anyProfile, workspace: fakeWorkspace });
    expect(facts).toEqual([]);
  });
});

describe('EnvironmentScanner', () => {
  it('has the correct id', () => {
    const scanner = new EnvironmentScanner();
    expect(scanner.id).toBe('environment-scanner');
  });

  it('always supports', () => {
    const scanner = new EnvironmentScanner();
    expect(scanner.supports(anyProfile)).toBe(true);
  });

  it('extracts env variable keys from .env, never values', async () => {
    const fs = new MockScannerFileSystem({
      '.env': 'PORT=3000\nDB_URL=postgres://localhost\ndebug=true',
    });
    const scanner = new EnvironmentScanner();
    const facts = await scanner.execute({ fs, profile: anyProfile, workspace: fakeWorkspace });

    const envFact = facts.find((f) => f.type === 'ENV_VARIABLE_DEFINED');
    expect(envFact).toBeDefined();
    expect(envFact?.value).toEqual(['PORT', 'DB_URL', 'debug']);
    // Ensure values are NOT in the fact.
    const json = JSON.stringify(envFact?.value);
    expect(json).not.toContain('3000');
    expect(json).not.toContain('postgres');
  });

  it('handles export prefix', async () => {
    const fs = new MockScannerFileSystem({
      '.env': 'export PORT=3000\nexport API_KEY=secret',
    });
    const scanner = new EnvironmentScanner();
    const facts = await scanner.execute({ fs, profile: anyProfile, workspace: fakeWorkspace });

    const envFact = facts.find((f) => f.type === 'ENV_VARIABLE_DEFINED');
    expect(envFact?.value).toEqual(['PORT', 'API_KEY']);
  });

  it('ignores comments and lines without =', async () => {
    const fs = new MockScannerFileSystem({
      '.env': '# comment\nNOT_AN_ASSIGNMENT\nPORT=3000',
    });
    const scanner = new EnvironmentScanner();
    const facts = await scanner.execute({ fs, profile: anyProfile, workspace: fakeWorkspace });

    const envFact = facts.find((f) => f.type === 'ENV_VARIABLE_DEFINED');
    expect(envFact?.value).toEqual(['PORT']);
  });

  it('deduplicates keys across .env and .env.example', async () => {
    const fs = new MockScannerFileSystem({
      '.env': 'PORT=3000\nDB_URL=secret',
      '.env.example': 'PORT=3000\nAPI_KEY=example',
    });
    const scanner = new EnvironmentScanner();
    const facts = await scanner.execute({ fs, profile: anyProfile, workspace: fakeWorkspace });

    const envFact = facts.find((f) => f.type === 'ENV_VARIABLE_DEFINED');
    expect(envFact?.value).toEqual(['PORT', 'DB_URL', 'API_KEY']);
  });

  it('returns empty when no env files exist', async () => {
    const fs = new MockScannerFileSystem({});
    const scanner = new EnvironmentScanner();
    const facts = await scanner.execute({ fs, profile: anyProfile, workspace: fakeWorkspace });
    expect(facts).toEqual([]);
  });

  it('returns empty when .env file exists but readFile throws', async () => {
    // Use a MockScannerFileSystem that returns true for fileExists
    // but throws for readFile.
    const fs = new MockScannerFileSystem({ '.env': 'PORT=3000' });
    // Override readFile to throw.
    fs.readFile = (_path: string): Promise<string> => Promise.reject(new Error('read error'));
    const scanner = new EnvironmentScanner();
    const facts = await scanner.execute({ fs, profile: anyProfile, workspace: fakeWorkspace });
    expect(facts).toEqual([]);
  });

  it('returns empty when .env has only comments and blank lines', async () => {
    const fs = new MockScannerFileSystem({
      '.env': '# comment\n\n# another comment\n',
    });
    const scanner = new EnvironmentScanner();
    const facts = await scanner.execute({ fs, profile: anyProfile, workspace: fakeWorkspace });
    expect(facts).toEqual([]);
  });

  it('skips lines without = sign', async () => {
    const fs = new MockScannerFileSystem({
      '.env': 'PORT=3000\nNOT_ASSIGNMENT\nAPI_KEY=secret',
    });
    const scanner = new EnvironmentScanner();
    const facts = await scanner.execute({ fs, profile: anyProfile, workspace: fakeWorkspace });
    const envFact = facts.find((f) => f.type === 'ENV_VARIABLE_DEFINED');
    expect(envFact?.value).toEqual(['PORT', 'API_KEY']);
  });

  it('skips lines with empty key', async () => {
    const fs = new MockScannerFileSystem({
      '.env': '=3000\nPORT=4000',
    });
    const scanner = new EnvironmentScanner();
    const facts = await scanner.execute({ fs, profile: anyProfile, workspace: fakeWorkspace });
    const envFact = facts.find((f) => f.type === 'ENV_VARIABLE_DEFINED');
    expect(envFact?.value).toEqual(['PORT']);
  });
});

describe('GitScanner — error paths', () => {
  it('returns empty when .gitignore exists but readFile throws', async () => {
    const fs = new MockScannerFileSystem({ '.gitignore': 'node_modules' });
    fs.readFile = (_path: string): Promise<string> => Promise.reject(new Error('read error'));
    const scanner = new GitScanner();
    const facts = await scanner.execute({ fs, profile: anyProfile, workspace: fakeWorkspace });
    expect(facts).toEqual([]);
  });
});

describe('DocumentationScanner — error paths', () => {
  it('does not emit FILE_SIZE_BYTES when README.md exists but getFileSize throws', async () => {
    const fs = new MockScannerFileSystem({ 'README.md': '# readme' });
    fs.getFileSize = (_path: string): Promise<number> => Promise.reject(new Error('stat error'));
    const scanner = new DocumentationScanner();
    const facts = await scanner.execute({ fs, profile: anyProfile, workspace: fakeWorkspace });
    expect(facts.find((f) => f.type === 'FILE_SIZE_BYTES')).toBeUndefined();
  });
});

describe('ManifestScanner — error paths', () => {
  it('returns empty when package.json exists but readFile throws', async () => {
    const fs = new MockScannerFileSystem({
      'package.json': '{"name":"test"}',
    });
    fs.readFile = (_path: string): Promise<string> => Promise.reject(new Error('read error'));
    const scanner = new ManifestScanner();
    const facts = await scanner.execute({ fs, profile: makeProfile('NodeApplication'), workspace: fakeWorkspace });
    expect(facts).toEqual([]);
  });

  it('returns empty when package.json top-level is an array', async () => {
    const fs = new MockScannerFileSystem({
      'package.json': '[1, 2, 3]',
    });
    const scanner = new ManifestScanner();
    const facts = await scanner.execute({ fs, profile: makeProfile('NodeApplication'), workspace: fakeWorkspace });
    expect(facts).toEqual([]);
  });

  it('returns empty when package.json top-level is null', async () => {
    const fs = new MockScannerFileSystem({
      'package.json': 'null',
    });
    const scanner = new ManifestScanner();
    const facts = await scanner.execute({ fs, profile: makeProfile('NodeApplication'), workspace: fakeWorkspace });
    expect(facts).toEqual([]);
  });

  it('does not emit SCRIPT_DEFINED when scripts is empty', async () => {
    const fs = new MockScannerFileSystem({
      'package.json': JSON.stringify({ dependencies: { express: '4.0.0' }, scripts: {} }),
    });
    const scanner = new ManifestScanner();
    const facts = await scanner.execute({ fs, profile: makeProfile('NodeApplication'), workspace: fakeWorkspace });
    expect(facts.find((f) => f.type === 'SCRIPT_DEFINED')).toBeUndefined();
  });
});
