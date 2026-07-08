/**
 * Unit tests for all 4 built-in analyzers.
 *
 * Coverage:
 *   - EnvironmentAnalyzer: env-file-not-ignored, env-example-missing.
 *   - ManifestAnalyzer: lockfile-missing, script-missing-build.
 *   - DocumentationAnalyzer: readme-too-short, license-missing.
 *   - StructureAnalyzer: gitignore-missing.
 */

import { describe, it, expect } from 'vitest';
import { EnvironmentAnalyzer } from '@repodoctor/analyzer/builtins/EnvironmentAnalyzer';
import { ManifestAnalyzer } from '@repodoctor/analyzer/builtins/ManifestAnalyzer';
import { DocumentationAnalyzer } from '@repodoctor/analyzer/builtins/DocumentationAnalyzer';
import { StructureAnalyzer } from '@repodoctor/analyzer/builtins/StructureAnalyzer';
import type { RepositoryProfile } from '@repodoctor/core/domain/Discovery';
import type { AnalyzerContext } from '@repodoctor/analyzer/IAnalyzer';
import { MockFactStore, makeFact } from '../helpers';

function makeProfile(type: RepositoryProfile['type'] = 'NodeApplication'): RepositoryProfile {
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

function makeContext(facts: ReturnType<typeof makeFact>[]): AnalyzerContext {
  return {
    profile: makeProfile(),
    factStore: new MockFactStore(facts),
  };
}

// ---------------------------------------------------------------------------
// EnvironmentAnalyzer
// ---------------------------------------------------------------------------

describe('EnvironmentAnalyzer', () => {
  it('has the correct id and version', () => {
    const a = new EnvironmentAnalyzer();
    expect(a.id).toBe('environment-analyzer');
    expect(a.version).toBe('1.0.0');
  });

  it('always supports', () => {
    const a = new EnvironmentAnalyzer();
    expect(a.supports(makeProfile('NodeApplication'))).toBe(true);
    expect(a.supports(makeProfile('Unknown'))).toBe(true);
  });

  it('emits env-file-not-ignored when .env exists but .gitignore does not contain .env', async () => {
    const ctx = makeContext([
      makeFact('FILE_EXISTS', '.env', true),
      makeFact('GITIGNORE_ENTRIES', '.gitignore', ['node_modules', 'dist']),
    ]);
    const findings = await new EnvironmentAnalyzer().execute(ctx);
    const f = findings.find((x) => x.ruleId === 'env-file-not-ignored');
    expect(f).toBeDefined();
    expect(f?.target).toBe('.env');
  });

  it('does NOT emit env-file-not-ignored when .gitignore contains .env', async () => {
    const ctx = makeContext([
      makeFact('FILE_EXISTS', '.env', true),
      makeFact('GITIGNORE_ENTRIES', '.gitignore', ['node_modules', '.env']),
    ]);
    const findings = await new EnvironmentAnalyzer().execute(ctx);
    expect(findings.find((x) => x.ruleId === 'env-file-not-ignored')).toBeUndefined();
  });

  it('does NOT emit env-file-not-ignored when .env does not exist', async () => {
    const ctx = makeContext([
      makeFact('FILE_EXISTS', '.env', false),
      makeFact('GITIGNORE_ENTRIES', '.gitignore', ['node_modules']),
    ]);
    const findings = await new EnvironmentAnalyzer().execute(ctx);
    expect(findings.find((x) => x.ruleId === 'env-file-not-ignored')).toBeUndefined();
  });

  it('emits env-file-not-ignored when .env exists but no GITIGNORE_ENTRIES fact', async () => {
    const ctx = makeContext([makeFact('FILE_EXISTS', '.env', true)]);
    const findings = await new EnvironmentAnalyzer().execute(ctx);
    expect(findings.find((x) => x.ruleId === 'env-file-not-ignored')).toBeDefined();
  });

  it('emits env-example-missing when .env exists but .env.example does not', async () => {
    const ctx = makeContext([
      makeFact('FILE_EXISTS', '.env', true),
      makeFact('FILE_EXISTS', '.env.example', false),
    ]);
    const findings = await new EnvironmentAnalyzer().execute(ctx);
    const f = findings.find((x) => x.ruleId === 'env-example-missing');
    expect(f).toBeDefined();
    expect(f?.target).toBe('.env.example');
  });

  it('does NOT emit env-example-missing when both .env and .env.example exist', async () => {
    const ctx = makeContext([
      makeFact('FILE_EXISTS', '.env', true),
      makeFact('FILE_EXISTS', '.env.example', true),
    ]);
    const findings = await new EnvironmentAnalyzer().execute(ctx);
    expect(findings.find((x) => x.ruleId === 'env-example-missing')).toBeUndefined();
  });

  it('does NOT emit env-example-missing when .env does not exist', async () => {
    const ctx = makeContext([
      makeFact('FILE_EXISTS', '.env', false),
      makeFact('FILE_EXISTS', '.env.example', false),
    ]);
    const findings = await new EnvironmentAnalyzer().execute(ctx);
    expect(findings.find((x) => x.ruleId === 'env-example-missing')).toBeUndefined();
  });

  it('emits both findings when .env exists, not ignored, and no .env.example', async () => {
    const ctx = makeContext([
      makeFact('FILE_EXISTS', '.env', true),
      makeFact('FILE_EXISTS', '.env.example', false),
      makeFact('GITIGNORE_ENTRIES', '.gitignore', ['node_modules']),
    ]);
    const findings = await new EnvironmentAnalyzer().execute(ctx);
    expect(findings).toHaveLength(2);
  });

  it('emits no findings when .env does not exist', async () => {
    const ctx = makeContext([]);
    const findings = await new EnvironmentAnalyzer().execute(ctx);
    expect(findings).toEqual([]);
  });

  it('matches .env in .gitignore via substring (e.g. "*.env")', async () => {
    const ctx = makeContext([
      makeFact('FILE_EXISTS', '.env', true),
      makeFact('GITIGNORE_ENTRIES', '.gitignore', ['*.env']),
    ]);
    const findings = await new EnvironmentAnalyzer().execute(ctx);
    expect(findings.find((x) => x.ruleId === 'env-file-not-ignored')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// ManifestAnalyzer
// ---------------------------------------------------------------------------

describe('ManifestAnalyzer', () => {
  it('has the correct id', () => {
    expect(new ManifestAnalyzer().id).toBe('manifest-analyzer');
  });

  it('supports NodeApplication', () => {
    expect(new ManifestAnalyzer().supports(makeProfile('NodeApplication'))).toBe(true);
  });

  it('supports NodeMonorepo', () => {
    expect(new ManifestAnalyzer().supports(makeProfile('NodeMonorepo'))).toBe(true);
  });

  it('does not support Unknown', () => {
    expect(new ManifestAnalyzer().supports(makeProfile('Unknown'))).toBe(false);
  });

  it('emits lockfile-missing when deps exist but lockfile is false', async () => {
    const ctx = makeContext([
      makeFact('DEPENDENCY_DECLARED', 'package.json', ['react', 'express']),
      makeFact('PACKAGE_MANAGER_LOCKFILE_EXISTS', 'package.json', false),
    ]);
    const findings = await new ManifestAnalyzer().execute(ctx);
    const f = findings.find((x) => x.ruleId === 'lockfile-missing');
    expect(f).toBeDefined();
    expect(f?.metadata).toEqual({ dependencyCount: 2 });
  });

  it('does NOT emit lockfile-missing when lockfile exists', async () => {
    const ctx = makeContext([
      makeFact('DEPENDENCY_DECLARED', 'package.json', ['react']),
      makeFact('PACKAGE_MANAGER_LOCKFILE_EXISTS', 'package.json', true),
    ]);
    const findings = await new ManifestAnalyzer().execute(ctx);
    expect(findings.find((x) => x.ruleId === 'lockfile-missing')).toBeUndefined();
  });

  it('does NOT emit lockfile-missing when no dependencies', async () => {
    const ctx = makeContext([
      makeFact('DEPENDENCY_DECLARED', 'package.json', []),
      makeFact('PACKAGE_MANAGER_LOCKFILE_EXISTS', 'package.json', false),
    ]);
    const findings = await new ManifestAnalyzer().execute(ctx);
    expect(findings.find((x) => x.ruleId === 'lockfile-missing')).toBeUndefined();
  });

  it('does NOT emit lockfile-missing when no DEPENDENCY_DECLARED fact', async () => {
    const ctx = makeContext([
      makeFact('PACKAGE_MANAGER_LOCKFILE_EXISTS', 'package.json', false),
    ]);
    const findings = await new ManifestAnalyzer().execute(ctx);
    expect(findings.find((x) => x.ruleId === 'lockfile-missing')).toBeUndefined();
  });

  it('emits script-missing-build when build is not in scripts', async () => {
    const ctx = makeContext([
      makeFact('SCRIPT_DEFINED', 'package.json', ['test', 'dev']),
    ]);
    const findings = await new ManifestAnalyzer().execute(ctx);
    expect(findings.find((x) => x.ruleId === 'script-missing-build')).toBeDefined();
  });

  it('does NOT emit script-missing-build when build is in scripts', async () => {
    const ctx = makeContext([
      makeFact('SCRIPT_DEFINED', 'package.json', ['build', 'test']),
    ]);
    const findings = await new ManifestAnalyzer().execute(ctx);
    expect(findings.find((x) => x.ruleId === 'script-missing-build')).toBeUndefined();
  });

  it('does NOT emit script-missing-build when no SCRIPT_DEFINED fact', async () => {
    const ctx = makeContext([]);
    const findings = await new ManifestAnalyzer().execute(ctx);
    expect(findings.find((x) => x.ruleId === 'script-missing-build')).toBeUndefined();
  });

  it('emits both findings when both rules trigger', async () => {
    const ctx = makeContext([
      makeFact('DEPENDENCY_DECLARED', 'package.json', ['react']),
      makeFact('PACKAGE_MANAGER_LOCKFILE_EXISTS', 'package.json', false),
      makeFact('SCRIPT_DEFINED', 'package.json', ['test']),
    ]);
    const findings = await new ManifestAnalyzer().execute(ctx);
    expect(findings).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// DocumentationAnalyzer
// ---------------------------------------------------------------------------

describe('DocumentationAnalyzer', () => {
  it('has the correct id', () => {
    expect(new DocumentationAnalyzer().id).toBe('documentation-analyzer');
  });

  it('always supports', () => {
    expect(new DocumentationAnalyzer().supports(makeProfile('Unknown'))).toBe(true);
  });

  it('emits readme-too-short when README.md is < 100 bytes', async () => {
    const ctx = makeContext([
      makeFact('FILE_SIZE_BYTES', 'README.md', 50),
    ]);
    const findings = await new DocumentationAnalyzer().execute(ctx);
    const f = findings.find((x) => x.ruleId === 'readme-too-short');
    expect(f).toBeDefined();
    expect(f?.metadata).toEqual({ size: 50, minimum: 100 });
  });

  it('does NOT emit readme-too-short when README.md is >= 100 bytes', async () => {
    const ctx = makeContext([
      makeFact('FILE_SIZE_BYTES', 'README.md', 200),
    ]);
    const findings = await new DocumentationAnalyzer().execute(ctx);
    expect(findings.find((x) => x.ruleId === 'readme-too-short')).toBeUndefined();
  });

  it('does NOT emit readme-too-short when no FILE_SIZE_BYTES fact for README.md', async () => {
    const ctx = makeContext([]);
    const findings = await new DocumentationAnalyzer().execute(ctx);
    expect(findings.find((x) => x.ruleId === 'readme-too-short')).toBeUndefined();
  });

  it('emits license-missing when LICENSE does not exist', async () => {
    const ctx = makeContext([
      makeFact('FILE_EXISTS', 'LICENSE', false),
    ]);
    const findings = await new DocumentationAnalyzer().execute(ctx);
    expect(findings.find((x) => x.ruleId === 'license-missing')).toBeDefined();
  });

  it('does NOT emit license-missing when LICENSE exists', async () => {
    const ctx = makeContext([
      makeFact('FILE_EXISTS', 'LICENSE', true),
    ]);
    const findings = await new DocumentationAnalyzer().execute(ctx);
    expect(findings.find((x) => x.ruleId === 'license-missing')).toBeUndefined();
  });

  it('does NOT emit license-missing when no FILE_EXISTS fact for LICENSE', async () => {
    const ctx = makeContext([]);
    const findings = await new DocumentationAnalyzer().execute(ctx);
    expect(findings.find((x) => x.ruleId === 'license-missing')).toBeUndefined();
  });

  it('emits both findings when both rules trigger', async () => {
    const ctx = makeContext([
      makeFact('FILE_SIZE_BYTES', 'README.md', 10),
      makeFact('FILE_EXISTS', 'LICENSE', false),
    ]);
    const findings = await new DocumentationAnalyzer().execute(ctx);
    expect(findings).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// StructureAnalyzer
// ---------------------------------------------------------------------------

describe('StructureAnalyzer', () => {
  it('has the correct id', () => {
    expect(new StructureAnalyzer().id).toBe('structure-analyzer');
  });

  it('always supports', () => {
    expect(new StructureAnalyzer().supports(makeProfile('Unknown'))).toBe(true);
  });

  it('emits gitignore-missing when .gitignore does not exist', async () => {
    const ctx = makeContext([
      makeFact('FILE_EXISTS', '.gitignore', false),
    ]);
    const findings = await new StructureAnalyzer().execute(ctx);
    const f = findings.find((x) => x.ruleId === 'gitignore-missing');
    expect(f).toBeDefined();
    expect(f?.target).toBe('.gitignore');
  });

  it('does NOT emit gitignore-missing when .gitignore exists', async () => {
    const ctx = makeContext([
      makeFact('FILE_EXISTS', '.gitignore', true),
    ]);
    const findings = await new StructureAnalyzer().execute(ctx);
    expect(findings.find((x) => x.ruleId === 'gitignore-missing')).toBeUndefined();
  });

  it('does NOT emit gitignore-missing when no FILE_EXISTS fact for .gitignore', async () => {
    const ctx = makeContext([]);
    const findings = await new StructureAnalyzer().execute(ctx);
    expect(findings.find((x) => x.ruleId === 'gitignore-missing')).toBeUndefined();
  });

  it('emits no findings when .gitignore exists', async () => {
    const ctx = makeContext([
      makeFact('FILE_EXISTS', '.gitignore', true),
    ]);
    const findings = await new StructureAnalyzer().execute(ctx);
    expect(findings).toEqual([]);
  });
});
