/**
 * Unit tests for the Discovery domain types.
 *
 * Verifies that the types are properly exported and that the enum-like
 * union types accept the expected values. These tests are mostly
 * compile-time — the runtime assertions are minimal.
 */

import { describe, it, expect } from 'vitest';
import type {
  RepositoryType,
  PackageManager,
  Language,
  DiscoveredFile,
  DiscoveredConfig,
  FrameworkGuess,
  FrameworkConfidence,
  RepositoryProfile,
  RepositoryFingerprint,
  DiscoveryResult,
} from '@repodoctor/core/domain/Discovery';

describe('Discovery domain types', () => {
  it('RepositoryType accepts all three values', () => {
    const a: RepositoryType = 'NodeApplication';
    const b: RepositoryType = 'NodeMonorepo';
    const c: RepositoryType = 'Unknown';
    expect([a, b, c]).toEqual(['NodeApplication', 'NodeMonorepo', 'Unknown']);
  });

  it('PackageManager accepts all five values', () => {
    const values: PackageManager[] = ['Npm', 'Yarn', 'Pnpm', 'Bun', 'Unknown'];
    expect(values).toHaveLength(5);
  });

  it('Language accepts all three values', () => {
    const values: Language[] = ['TypeScript', 'JavaScript', 'Unknown'];
    expect(values).toHaveLength(3);
  });

  it('FrameworkConfidence accepts High and Low', () => {
    const h: FrameworkConfidence = 'High';
    const l: FrameworkConfidence = 'Low';
    expect([h, l]).toEqual(['High', 'Low']);
  });

  it('DiscoveredFile has the correct shape', () => {
    const f: DiscoveredFile = { name: 'package.json', path: '/r/package.json', size: 1024 };
    expect(f.name).toBe('package.json');
    expect(f.path).toBe('/r/package.json');
    expect(f.size).toBe(1024);
  });

  it('DiscoveredConfig has the correct shape', () => {
    const c: DiscoveredConfig = { name: 'tsconfig.json', exists: true };
    expect(c.name).toBe('tsconfig.json');
    expect(c.exists).toBe(true);
  });

  it('FrameworkGuess has the correct shape', () => {
    const g: FrameworkGuess = { name: 'Next.js', confidence: 'High' };
    expect(g.name).toBe('Next.js');
    expect(g.confidence).toBe('High');
  });

  it('RepositoryProfile has the correct shape', () => {
    const p: RepositoryProfile = {
      name: 'my-app',
      type: 'NodeApplication',
      languages: ['TypeScript'],
      packageManager: 'Pnpm',
      isMonorepo: false,
      workspaces: [],
      frameworks: [],
      rootFiles: [],
      configFiles: [],
    };
    expect(p.name).toBe('my-app');
    expect(p.type).toBe('NodeApplication');
  });

  it('RepositoryFingerprint has the correct shape', () => {
    const fp: RepositoryFingerprint = {
      hash: 'a1b2c3d4e5f6g7h8',
      basis: ['my-app', 'package.json', 'Pnpm', 'false'],
    };
    expect(fp.hash).toHaveLength(16);
    expect(fp.basis).toHaveLength(4);
  });

  it('DiscoveryResult has the correct shape', () => {
    const r: DiscoveryResult = {
      profile: {
        name: 'my-app',
        type: 'NodeApplication',
        languages: ['TypeScript'],
        packageManager: 'Pnpm',
        isMonorepo: false,
        workspaces: [],
        frameworks: [],
        rootFiles: [],
        configFiles: [],
      },
      fingerprint: { hash: 'abcdef0123456789', basis: [] },
      discoveredAt: '2023-10-27T14:30:00.000Z',
    };
    expect(r.profile.name).toBe('my-app');
    expect(r.fingerprint.hash).toBe('abcdef0123456789');
    expect(r.discoveredAt).toContain('2023');
  });
});
