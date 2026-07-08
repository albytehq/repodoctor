/**
 * Unit tests for PackageManagerDetector.
 *
 * Coverage:
 *   - packageManager field overrides lockfile detection.
 *   - Lockfile priority: pnpm > yarn > bun > npm.
 *   - No lockfile + package.json -> Unknown.
 *   - No package.json -> Unknown.
 *   - Invalid packageManager field -> fall through to lockfile.
 */

import { describe, it, expect } from 'vitest';
import { detectPackageManager } from '@repodoctor/discovery/detectors/PackageManagerDetector';
import type { DiscoveredFile } from '@repodoctor/core/domain/Discovery';
import type { PackageJsonData } from '@repodoctor/discovery/parsers/PackageJsonParser';

function makeFile(name: string): DiscoveredFile {
  return { name, path: `/repo/${name}`, size: 100 };
}

describe('PackageManagerDetector', () => {
  describe('packageManager field override', () => {
    it('returns Yarn when packageManager field is yarn@3.2.1', () => {
      const pkg: PackageJsonData = { packageManager: 'yarn@3.2.1' };
      const result = detectPackageManager([makeFile('package-lock.json')], pkg);
      expect(result.packageManager).toBe('Yarn');
      expect(result.source).toBe('packageManager-field');
    });

    it('returns Pnpm when packageManager field is pnpm@8', () => {
      const pkg: PackageJsonData = { packageManager: 'pnpm@8.6.0' };
      const result = detectPackageManager([], pkg);
      expect(result.packageManager).toBe('Pnpm');
      expect(result.source).toBe('packageManager-field');
    });

    it('returns Npm when packageManager field is npm@10', () => {
      const pkg: PackageJsonData = { packageManager: 'npm@10.0.0' };
      const result = detectPackageManager([], pkg);
      expect(result.packageManager).toBe('Npm');
    });

    it('returns Bun when packageManager field is bun@1', () => {
      const pkg: PackageJsonData = { packageManager: 'bun@1.0.0' };
      const result = detectPackageManager([], pkg);
      expect(result.packageManager).toBe('Bun');
    });

    it('falls through to lockfile when packageManager is unknown', () => {
      const pkg: PackageJsonData = { packageManager: 'foo@1.0.0' };
      const result = detectPackageManager([makeFile('yarn.lock')], pkg);
      expect(result.packageManager).toBe('Yarn');
      expect(result.source).toBe('lockfile');
    });

    it('handles packageManager field without @version suffix', () => {
      // Exercises the `atIndex === -1` branch in parsePackageManagerField.
      const pkg: PackageJsonData = { packageManager: 'yarn' };
      const result = detectPackageManager([], pkg);
      expect(result.packageManager).toBe('Yarn');
      expect(result.source).toBe('packageManager-field');
    });

    it('handles packageManager field with only @ (empty version)', () => {
      const pkg: PackageJsonData = { packageManager: 'pnpm@' };
      const result = detectPackageManager([], pkg);
      expect(result.packageManager).toBe('Pnpm');
    });
  });

  describe('lockfile detection', () => {
    it('returns Pnpm when pnpm-lock.yaml exists', () => {
      const result = detectPackageManager([makeFile('pnpm-lock.yaml')], {});
      expect(result.packageManager).toBe('Pnpm');
      expect(result.source).toBe('lockfile');
    });

    it('returns Yarn when yarn.lock exists', () => {
      const result = detectPackageManager([makeFile('yarn.lock')], {});
      expect(result.packageManager).toBe('Yarn');
    });

    it('returns Bun when bun.lockb exists', () => {
      const result = detectPackageManager([makeFile('bun.lockb')], {});
      expect(result.packageManager).toBe('Bun');
    });

    it('returns Npm when package-lock.json exists', () => {
      const result = detectPackageManager([makeFile('package-lock.json')], {});
      expect(result.packageManager).toBe('Npm');
    });

    it('pnpm-lock.yaml takes priority over yarn.lock', () => {
      const result = detectPackageManager(
        [makeFile('pnpm-lock.yaml'), makeFile('yarn.lock')],
        {},
      );
      expect(result.packageManager).toBe('Pnpm');
    });

    it('yarn.lock takes priority over package-lock.json', () => {
      const result = detectPackageManager(
        [makeFile('yarn.lock'), makeFile('package-lock.json')],
        {},
      );
      expect(result.packageManager).toBe('Yarn');
    });
  });

  describe('no lockfile', () => {
    it('returns Unknown when package.json exists but no lockfile', () => {
      const result = detectPackageManager([makeFile('package.json')], {});
      expect(result.packageManager).toBe('Unknown');
      expect(result.source).toBe('no-lockfile');
    });

    it('returns Unknown when no package.json and no lockfile', () => {
      const result = detectPackageManager([], null);
      expect(result.packageManager).toBe('Unknown');
      expect(result.source).toBe('no-package-json');
    });
  });

  // --- v0.0.9: Python, Go, Rust ---
  describe('non-Node ecosystems (v0.0.9)', () => {
    it('returns Poetry when poetry.lock exists', () => {
      const result = detectPackageManager([makeFile('poetry.lock')], null);
      expect(result.packageManager).toBe('Poetry');
    });

    it('returns Pip when requirements.txt exists', () => {
      const result = detectPackageManager([makeFile('requirements.txt')], null);
      expect(result.packageManager).toBe('Pip');
    });

    it('returns Pip when pyproject.toml exists', () => {
      const result = detectPackageManager([makeFile('pyproject.toml')], null);
      expect(result.packageManager).toBe('Pip');
    });

    it('returns GoModules when go.mod exists', () => {
      const result = detectPackageManager([makeFile('go.mod')], null);
      expect(result.packageManager).toBe('GoModules');
    });

    it('returns Cargo when Cargo.toml exists', () => {
      const result = detectPackageManager([makeFile('Cargo.toml')], null);
      expect(result.packageManager).toBe('Cargo');
    });

    it('prefers poetry.lock over requirements.txt', () => {
      const result = detectPackageManager([makeFile('poetry.lock'), makeFile('requirements.txt')], null);
      expect(result.packageManager).toBe('Poetry');
    });
  });
});
