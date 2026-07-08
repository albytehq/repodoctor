/**
 * Unit tests for MonorepoDetector.
 *
 * Coverage:
 *   - package.json workspaces array.
 *   - pnpm-workspace.yaml presence.
 *   - lerna.json presence.
 *   - None -> not a monorepo.
 *   - Empty workspaces array -> not a monorepo.
 */

import { describe, it, expect } from 'vitest';
import { detectMonorepo } from '@repodoctor/discovery/detectors/MonorepoDetector';
import type { DiscoveredFile } from '@repodoctor/core/domain/Discovery';
import type { PackageJsonData } from '@repodoctor/discovery/parsers/PackageJsonParser';

function makeFile(name: string): DiscoveredFile {
  return { name, path: `/repo/${name}`, size: 100 };
}

describe('MonorepoDetector', () => {
  it('detects monorepo via package.json workspaces array', () => {
    const pkg: PackageJsonData = { workspaces: ['packages/*', 'apps/*'] };
    const result = detectMonorepo([makeFile('package.json')], pkg);
    expect(result.isMonorepo).toBe(true);
    expect(result.workspaces).toEqual(['packages/*', 'apps/*']);
    expect(result.source).toBe('package-json-workspaces');
  });

  it('detects monorepo via workspaces { packages: [...] } form', () => {
    const pkg: PackageJsonData = {
      workspaces: { packages: ['packages/a', 'packages/b'] },
    };
    const result = detectMonorepo([makeFile('package.json')], pkg);
    expect(result.isMonorepo).toBe(true);
    expect(result.workspaces).toEqual(['packages/a', 'packages/b']);
  });

  it('does not detect monorepo when workspaces array is empty', () => {
    const pkg: PackageJsonData = { workspaces: [] };
    const result = detectMonorepo([makeFile('package.json')], pkg);
    expect(result.isMonorepo).toBe(false);
    expect(result.source).toBe('none');
  });

  it('detects monorepo via pnpm-workspace.yaml', () => {
    const result = detectMonorepo(
      [makeFile('package.json'), makeFile('pnpm-workspace.yaml')],
      {},
    );
    expect(result.isMonorepo).toBe(true);
    expect(result.source).toBe('pnpm-workspace');
    expect(result.workspaces).toEqual([]);
  });

  it('detects monorepo via lerna.json', () => {
    const result = detectMonorepo(
      [makeFile('package.json'), makeFile('lerna.json')],
      {},
    );
    expect(result.isMonorepo).toBe(true);
    expect(result.source).toBe('lerna-json');
  });

  it('returns not-a-monorepo when none of the signals are present', () => {
    const result = detectMonorepo([makeFile('package.json')], {});
    expect(result.isMonorepo).toBe(false);
    expect(result.workspaces).toEqual([]);
    expect(result.source).toBe('none');
  });

  it('returns not-a-monorepo when package.json is null', () => {
    const result = detectMonorepo([], null);
    expect(result.isMonorepo).toBe(false);
    expect(result.source).toBe('none');
  });

  it('package.json workspaces takes priority over pnpm-workspace.yaml', () => {
    const pkg: PackageJsonData = { workspaces: ['packages/*'] };
    const result = detectMonorepo(
      [makeFile('package.json'), makeFile('pnpm-workspace.yaml')],
      pkg,
    );
    expect(result.source).toBe('package-json-workspaces');
    expect(result.workspaces).toEqual(['packages/*']);
  });

  it('treats workspaces as empty when it is an object with no packages key', () => {
    // Exercises the `return []` fallback in extractWorkspaces.
    const pkg: PackageJsonData = {
      workspaces: {} as { readonly packages?: readonly string[] },
    };
    const result = detectMonorepo([makeFile('package.json')], pkg);
    expect(result.isMonorepo).toBe(false);
    expect(result.source).toBe('none');
  });
});
