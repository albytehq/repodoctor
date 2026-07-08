/**
 * Unit tests for AnalyzerRegistry.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AnalyzerRegistry } from '@repodoctor/analyzer/AnalyzerRegistry';
import type { IAnalyzer, AnalyzerContext } from '@repodoctor/analyzer/IAnalyzer';
import type { RepositoryProfile } from '@repodoctor/core/domain/Discovery';
import type { RawFinding } from '@repodoctor/core/domain/Analysis';

function makeAnalyzer(id: string, supportsFn: (p: RepositoryProfile) => boolean): IAnalyzer {
  return {
    id,
    version: '1.0.0',
    supports: supportsFn,
    execute(_context: AnalyzerContext): Promise<RawFinding[]> {
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

describe('AnalyzerRegistry', () => {
  let registry: AnalyzerRegistry;

  beforeEach(() => {
    registry = new AnalyzerRegistry();
  });

  it('starts empty', () => {
    expect(registry.size).toBe(0);
    expect(registry.getAll()).toEqual([]);
  });

  it('registers and retrieves an analyzer', () => {
    const analyzer = makeAnalyzer('a-analyzer', () => true);
    registry.register(analyzer);
    expect(registry.size).toBe(1);
    expect(registry.getAll()).toEqual([analyzer]);
  });

  it('returns analyzers in alphabetical order by ID', () => {
    registry.register(makeAnalyzer('z-analyzer', () => true));
    registry.register(makeAnalyzer('a-analyzer', () => true));
    registry.register(makeAnalyzer('m-analyzer', () => true));
    const ids = registry.getAll().map((a) => a.id);
    expect(ids).toEqual(['a-analyzer', 'm-analyzer', 'z-analyzer']);
  });

  it('throws on duplicate registration', () => {
    registry.register(makeAnalyzer('a-analyzer', () => true));
    expect(() => registry.register(makeAnalyzer('a-analyzer', () => true))).toThrow(
      /already registered/,
    );
  });

  it('throws on empty ID', () => {
    expect(() => registry.register(makeAnalyzer('', () => true))).toThrow(/must not be empty/);
  });

  it('getCompatibleAnalyzers filters by supports()', () => {
    registry.register(makeAnalyzer('always', () => true));
    registry.register(makeAnalyzer('never', () => false));
    registry.register(makeAnalyzer('node-only', (p) => p.type === 'NodeApplication'));
    const compatible = registry.getCompatibleAnalyzers(anyProfile);
    const ids = compatible.map((a) => a.id);
    expect(ids).toEqual(['always', 'node-only']);
  });

  it('getCompatibleAnalyzers returns empty when no analyzers match', () => {
    registry.register(makeAnalyzer('never', () => false));
    expect(registry.getCompatibleAnalyzers(anyProfile)).toEqual([]);
  });
});
