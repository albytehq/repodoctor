/**
 * Unit tests for LanguageDetector.
 *
 * Coverage:
 *   - tsconfig.json present -> TypeScript.
 *   - package.json present, no tsconfig -> JavaScript.
 *   - Both present -> TypeScript only.
 *   - Neither present -> Unknown.
 *   - ESM detection via type: module.
 */

import { describe, it, expect } from 'vitest';
import { detectLanguage } from '@repodoctor/discovery/detectors/LanguageDetector';
import type { DiscoveredFile } from '@repodoctor/core/domain/Discovery';

function makeFile(name: string): DiscoveredFile {
  return { name, path: `/repo/${name}`, size: 100 };
}

describe('LanguageDetector', () => {
  it('returns TypeScript when tsconfig.json exists', () => {
    const result = detectLanguage([makeFile('tsconfig.json')], {});
    expect(result.languages).toEqual(['TypeScript']);
    expect(result.isEsm).toBe(false);
  });

  it('returns JavaScript when package.json exists but tsconfig.json does not', () => {
    const result = detectLanguage([makeFile('package.json')], {});
    expect(result.languages).toEqual(['JavaScript']);
  });

  it('returns TypeScript only when both tsconfig.json and package.json exist', () => {
    const result = detectLanguage(
      [makeFile('tsconfig.json'), makeFile('package.json')],
      {},
    );
    expect(result.languages).toEqual(['TypeScript']);
    expect(result.languages).not.toContain('JavaScript');
  });

  it('returns Unknown when neither tsconfig.json nor package.json exist', () => {
    const result = detectLanguage([makeFile('README.md')], null);
    expect(result.languages).toEqual(['Unknown']);
  });

  it('returns Unknown when no files at all', () => {
    const result = detectLanguage([], null);
    expect(result.languages).toEqual(['Unknown']);
  });

  it('detects ESM when package.json has type: module', () => {
    const result = detectLanguage(
      [makeFile('tsconfig.json')],
      { type: 'module' },
    );
    expect(result.isEsm).toBe(true);
  });

  it('does not detect ESM when package.json has type: commonjs', () => {
    const result = detectLanguage(
      [makeFile('tsconfig.json')],
      { type: 'commonjs' },
    );
    expect(result.isEsm).toBe(false);
  });

  it('does not detect ESM when package.json is null', () => {
    const result = detectLanguage([makeFile('tsconfig.json')], null);
    expect(result.isEsm).toBe(false);
  });

  // --- v0.0.9: Python, Go, Rust ---
  it('detects Python when requirements.txt exists', () => {
    const result = detectLanguage([makeFile('requirements.txt')], null);
    expect(result.languages).toContain('Python');
  });

  it('detects Python when pyproject.toml exists', () => {
    const result = detectLanguage([makeFile('pyproject.toml')], null);
    expect(result.languages).toContain('Python');
  });

  it('detects Go when go.mod exists', () => {
    const result = detectLanguage([makeFile('go.mod')], null);
    expect(result.languages).toContain('Go');
  });

  it('detects Rust when Cargo.toml exists', () => {
    const result = detectLanguage([makeFile('Cargo.toml')], null);
    expect(result.languages).toContain('Rust');
  });

  it('detects multiple languages when multiple manifests exist', () => {
    const result = detectLanguage(
      [makeFile('package.json'), makeFile('requirements.txt'), makeFile('go.mod')],
      {},
    );
    expect(result.languages).toContain('JavaScript');
    expect(result.languages).toContain('Python');
    expect(result.languages).toContain('Go');
  });
});
