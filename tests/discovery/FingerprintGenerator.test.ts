/**
 * Unit tests for FingerprintGenerator.
 *
 * Coverage:
 *   - Determinism: same input -> same hash.
 *   - Different input -> different hash.
 *   - Hash is 16 hex characters.
 *   - Basis array is correct and sorted.
 *   - Root file names are sorted in the basis.
 */

import { describe, it, expect } from 'vitest';
import { generateFingerprint } from '@repodoctor/discovery/FingerprintGenerator';
import type { RepositoryProfile } from '@repodoctor/core/domain/Discovery';

function makeProfile(overrides: Partial<RepositoryProfile> = {}): RepositoryProfile {
  return {
    name: 'test-repo',
    type: 'NodeApplication',
    languages: ['TypeScript'],
    packageManager: 'Npm',
    isMonorepo: false,
    workspaces: [],
    frameworks: [],
    rootFiles: [],
    configFiles: [],
    ...overrides,
  };
}

describe('FingerprintGenerator', () => {
  it('produces a 16-character hex hash', () => {
    const fp = generateFingerprint(makeProfile());
    expect(fp.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is deterministic — same input yields the same hash', () => {
    const profile = makeProfile({
      rootFiles: [
        { name: 'package.json', path: '/r/package.json', size: 100 },
        { name: 'tsconfig.json', path: '/r/tsconfig.json', size: 200 },
      ],
    });
    const fp1 = generateFingerprint(profile);
    const fp2 = generateFingerprint(profile);
    expect(fp1.hash).toBe(fp2.hash);
  });

  it('produces different hashes for different repository names', () => {
    const fp1 = generateFingerprint(makeProfile({ name: 'repo-a' }));
    const fp2 = generateFingerprint(makeProfile({ name: 'repo-b' }));
    expect(fp1.hash).not.toBe(fp2.hash);
  });

  it('produces different hashes for different package managers', () => {
    const fp1 = generateFingerprint(makeProfile({ packageManager: 'Npm' }));
    const fp2 = generateFingerprint(makeProfile({ packageManager: 'Pnpm' }));
    expect(fp1.hash).not.toBe(fp2.hash);
  });

  it('produces different hashes for different monorepo flags', () => {
    const fp1 = generateFingerprint(makeProfile({ isMonorepo: false }));
    const fp2 = generateFingerprint(makeProfile({ isMonorepo: true }));
    expect(fp1.hash).not.toBe(fp2.hash);
  });

  it('sorts root file names in the basis', () => {
    const profile = makeProfile({
      rootFiles: [
        { name: 'z-last.txt', path: '/r/z-last.txt', size: 1 },
        { name: 'a-first.txt', path: '/r/a-first.txt', size: 1 },
        { name: 'm-middle.txt', path: '/r/m-middle.txt', size: 1 },
      ],
    });
    const fp = generateFingerprint(profile);
    // Basis is [name, ...sortedRootFileNames, packageManager, isMonorepo]
    expect(fp.basis).toEqual([
      'test-repo',
      'a-first.txt',
      'm-middle.txt',
      'z-last.txt',
      'Npm',
      'false',
    ]);
  });

  it('is unaffected by root file order — same files in different order yield the same hash', () => {
    const profile1 = makeProfile({
      rootFiles: [
        { name: 'b.txt', path: '/r/b.txt', size: 1 },
        { name: 'a.txt', path: '/r/a.txt', size: 1 },
      ],
    });
    const profile2 = makeProfile({
      rootFiles: [
        { name: 'a.txt', path: '/r/a.txt', size: 1 },
        { name: 'b.txt', path: '/r/b.txt', size: 1 },
      ],
    });
    expect(generateFingerprint(profile1).hash).toBe(generateFingerprint(profile2).hash);
  });

  it('is unaffected by file sizes — only names matter for the basis', () => {
    const profile1 = makeProfile({
      rootFiles: [{ name: 'a.txt', path: '/r/a.txt', size: 100 }],
    });
    const profile2 = makeProfile({
      rootFiles: [{ name: 'a.txt', path: '/r/a.txt', size: 999 }],
    });
    expect(generateFingerprint(profile1).hash).toBe(generateFingerprint(profile2).hash);
  });

  it('includes the empty root-files case correctly in the basis', () => {
    const fp = generateFingerprint(makeProfile());
    expect(fp.basis).toEqual(['test-repo', 'Npm', 'false']);
  });
});
