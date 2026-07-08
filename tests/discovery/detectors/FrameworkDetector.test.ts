/**
 * Unit tests for FrameworkDetector (v0.0.9 — multi-language).
 *
 * Coverage:
 *   - Node.js: Next.js, React, Express, NestJS.
 *   - Python: Django, FastAPI.
 *   - Go: Gin, Echo.
 *   - Rust: Actix, Axum.
 *   - null packageJson + no deps -> empty.
 *   - Multiple frameworks across ecosystems.
 */

import { describe, it, expect } from 'vitest';
import { detectFrameworks } from '@repodoctor/discovery/detectors/FrameworkDetector';
import type { PackageJsonData } from '@repodoctor/discovery/parsers/PackageJsonParser';

function makeParams(pkg: PackageJsonData | null, opts: { python?: string[]; go?: string[]; rust?: string[] } = {}) {
  return {
    packageJson: pkg,
    rootFiles: [],
    pythonDeps: opts.python ?? [],
    goDeps: opts.go ?? [],
    rustDeps: opts.rust ?? [],
  };
}

describe('FrameworkDetector — Node.js', () => {
  it('detects Next.js in dependencies with High confidence', () => {
    const pkg: PackageJsonData = { dependencies: { next: '14.0.0' } };
    const result = detectFrameworks(makeParams(pkg));
    expect(result).toContainEqual({ name: 'Next.js', confidence: 'High' });
  });

  it('detects React when both react and react-dom are in dependencies', () => {
    const pkg: PackageJsonData = { dependencies: { react: '18.0.0', 'react-dom': '18.0.0' } };
    const result = detectFrameworks(makeParams(pkg));
    expect(result).toContainEqual({ name: 'React', confidence: 'High' });
  });

  it('does not detect React when only react is present (missing react-dom)', () => {
    const pkg: PackageJsonData = { dependencies: { react: '18.0.0' } };
    const result = detectFrameworks(makeParams(pkg));
    expect(result.find((f) => f.name === 'React')).toBeUndefined();
  });

  it('detects Express in dependencies', () => {
    const pkg: PackageJsonData = { dependencies: { express: '4.18.0' } };
    const result = detectFrameworks(makeParams(pkg));
    expect(result).toContainEqual({ name: 'Express', confidence: 'High' });
  });

  it('detects NestJS via @nestjs/core', () => {
    const pkg: PackageJsonData = { dependencies: { '@nestjs/core': '10.0.0' } };
    const result = detectFrameworks(makeParams(pkg));
    expect(result).toContainEqual({ name: 'NestJS', confidence: 'High' });
  });

  it('detects framework in devDependencies only with Low confidence', () => {
    const pkg: PackageJsonData = { devDependencies: { next: '14.0.0' } };
    const result = detectFrameworks(makeParams(pkg));
    expect(result).toContainEqual({ name: 'Next.js', confidence: 'Low' });
  });

  it('returns High confidence when in dependencies, even if also in devDependencies', () => {
    const pkg: PackageJsonData = {
      dependencies: { next: '14.0.0' },
      devDependencies: { next: '14.0.0' },
    };
    const result = detectFrameworks(makeParams(pkg));
    expect(result).toContainEqual({ name: 'Next.js', confidence: 'High' });
    expect(result.filter((f) => f.name === 'Next.js')).toHaveLength(1);
  });

  it('does not detect framework when packages are split across deps and devDeps', () => {
    const pkg: PackageJsonData = {
      dependencies: { react: '18.0.0' },
      devDependencies: { 'react-dom': '18.0.0' },
    };
    const result = detectFrameworks(makeParams(pkg));
    expect(result.find((f) => f.name === 'React')).toBeUndefined();
  });

  it('returns empty array when no frameworks are present', () => {
    const pkg: PackageJsonData = { dependencies: { lodash: '4.0.0' } };
    const result = detectFrameworks(makeParams(pkg));
    expect(result).toEqual([]);
  });

  it('returns empty array when packageJson is null and no other deps', () => {
    const result = detectFrameworks(makeParams(null));
    expect(result).toEqual([]);
  });

  it('detects multiple Node.js frameworks in rule order', () => {
    const pkg: PackageJsonData = {
      dependencies: {
        next: '14.0.0',
        react: '18.0.0',
        'react-dom': '18.0.0',
        express: '4.18.0',
        '@nestjs/core': '10.0.0',
      },
    };
    const result = detectFrameworks(makeParams(pkg));
    expect(result.map((f) => f.name)).toEqual(['Next.js', 'React', 'NestJS', 'Express']);
  });

  it('returns empty array when dependencies and devDependencies are undefined', () => {
    const pkg: PackageJsonData = {};
    const result = detectFrameworks(makeParams(pkg));
    expect(result).toEqual([]);
  });
});

describe('FrameworkDetector — Python (v0.0.9)', () => {
  it('detects Django in Python deps', () => {
    const result = detectFrameworks(makeParams(null, { python: ['django', 'requests'] }));
    expect(result).toContainEqual({ name: 'Django', confidence: 'High' });
  });

  it('detects FastAPI in Python deps', () => {
    const result = detectFrameworks(makeParams(null, { python: ['fastapi', 'uvicorn'] }));
    expect(result).toContainEqual({ name: 'FastAPI', confidence: 'High' });
  });

  it('does not detect Python frameworks when not present', () => {
    const result = detectFrameworks(makeParams(null, { python: ['requests'] }));
    expect(result.find((f) => f.name === 'Django')).toBeUndefined();
    expect(result.find((f) => f.name === 'FastAPI')).toBeUndefined();
  });
});

describe('FrameworkDetector — Go (v0.0.9)', () => {
  it('detects Gin in Go deps', () => {
    const result = detectFrameworks(makeParams(null, { go: ['github.com/gin-gonic/gin'] }));
    expect(result).toContainEqual({ name: 'Gin', confidence: 'High' });
  });

  it('detects Echo in Go deps', () => {
    const result = detectFrameworks(makeParams(null, { go: ['github.com/labstack/echo'] }));
    expect(result).toContainEqual({ name: 'Echo', confidence: 'High' });
  });

  it('does not detect Go frameworks when not present', () => {
    const result = detectFrameworks(makeParams(null, { go: ['github.com/other/pkg'] }));
    expect(result.find((f) => f.name === 'Gin')).toBeUndefined();
  });
});

describe('FrameworkDetector — Rust (v0.0.9)', () => {
  it('detects Actix in Rust deps', () => {
    const result = detectFrameworks(makeParams(null, { rust: ['actix-web', 'tokio'] }));
    expect(result).toContainEqual({ name: 'Actix', confidence: 'High' });
  });

  it('detects Axum in Rust deps', () => {
    const result = detectFrameworks(makeParams(null, { rust: ['axum', 'tokio'] }));
    expect(result).toContainEqual({ name: 'Axum', confidence: 'High' });
  });

  it('does not detect Rust frameworks when not present', () => {
    const result = detectFrameworks(makeParams(null, { rust: ['serde'] }));
    expect(result.find((f) => f.name === 'Actix')).toBeUndefined();
  });
});

describe('FrameworkDetector — multi-ecosystem', () => {
  it('detects frameworks from multiple ecosystems simultaneously', () => {
    const pkg: PackageJsonData = { dependencies: { next: '14.0.0' } };
    const result = detectFrameworks(makeParams(pkg, {
      python: ['django'],
      go: ['github.com/gin-gonic/gin'],
      rust: ['actix-web'],
    }));
    const names = result.map((f) => f.name);
    expect(names).toContain('Next.js');
    expect(names).toContain('Django');
    expect(names).toContain('Gin');
    expect(names).toContain('Actix');
  });
});
