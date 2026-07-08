/**
 * Unit tests for ScannerRegistry.
 *
 * Coverage:
 *   - Register and getAll.
 *   - Duplicate registration throws.
 *   - Empty ID throws.
 *   - getCompatibleScanners filters by supports().
 *   - Alphabetical ordering.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ScannerRegistry } from '@repodoctor/scanner/ScannerRegistry';
import type { IScanner, ScannerContext } from '@repodoctor/scanner/IScanner';
import type { RepositoryProfile } from '@repodoctor/core/domain/Discovery';
import type { RawFact } from '@repodoctor/core/domain/Scan';

function makeScanner(id: string, supportsFn: (p: RepositoryProfile) => boolean): IScanner {
  return {
    id,
    version: '1.0.0',
    supports: supportsFn,
    execute(_context: ScannerContext): Promise<RawFact[]> {
      return Promise.resolve([]);
    },
  };
}

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

describe('ScannerRegistry', () => {
  let registry: ScannerRegistry;

  beforeEach(() => {
    registry = new ScannerRegistry();
  });

  it('starts empty', () => {
    expect(registry.size).toBe(0);
    expect(registry.getAll()).toEqual([]);
  });

  it('registers and retrieves a scanner', () => {
    const scanner = makeScanner('a-scanner', () => true);
    registry.register(scanner);
    expect(registry.size).toBe(1);
    expect(registry.getAll()).toEqual([scanner]);
  });

  it('returns scanners in alphabetical order by ID', () => {
    registry.register(makeScanner('z-scanner', () => true));
    registry.register(makeScanner('a-scanner', () => true));
    registry.register(makeScanner('m-scanner', () => true));
    const ids = registry.getAll().map((s) => s.id);
    expect(ids).toEqual(['a-scanner', 'm-scanner', 'z-scanner']);
  });

  it('throws on duplicate registration', () => {
    registry.register(makeScanner('a-scanner', () => true));
    expect(() => registry.register(makeScanner('a-scanner', () => true))).toThrow(
      /already registered/,
    );
  });

  it('throws on empty ID', () => {
    expect(() => registry.register(makeScanner('', () => true))).toThrow(/must not be empty/);
  });

  it('getCompatibleScanners filters by supports()', () => {
    registry.register(makeScanner('always', () => true));
    registry.register(makeScanner('never', () => false));
    registry.register(makeScanner('node-only', (p) => p.type === 'NodeApplication'));
    const compatible = registry.getCompatibleScanners(anyProfile);
    const ids = compatible.map((s) => s.id);
    expect(ids).toEqual(['always', 'node-only']);
  });

  it('getCompatibleScanners returns empty when no scanners match', () => {
    registry.register(makeScanner('never', () => false));
    expect(registry.getCompatibleScanners(anyProfile)).toEqual([]);
  });

  it('getCompatibleScanners preserves alphabetical order', () => {
    registry.register(makeScanner('z-always', () => true));
    registry.register(makeScanner('a-always', () => true));
    registry.register(makeScanner('never', () => false));
    const compatible = registry.getCompatibleScanners(anyProfile);
    const ids = compatible.map((s) => s.id);
    expect(ids).toEqual(['a-always', 'z-always']);
  });
});
