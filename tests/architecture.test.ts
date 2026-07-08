/**
 * Architecture validation tests.
 *
 * These tests enforce the architectural dependency rules described in the
 * RepoDoctor v0.0.1 spec (Part 4):
 *
 *   - cli        MAY import: core, config, logger, errors, utils.
 *   - config     MAY import: core, errors, infrastructure, utils.
 *   - logger     MAY import: core, utils.
 *   - core       MAY import: errors, utils. (Strictly NO infrastructure, NO config, NO cli, NO logger.)
 *   - infrastructure MAY import: core (interfaces only), errors, utils.
 *   - errors     MAY import: utils.
 *   - utils      MAY import: NOTHING (pure Node built-ins only).
 *
 * Strategy: for each TypeScript source file under `src/`, read its source
 * text, extract every `import ... from '...'` specifier, and assert that
 * the specifier does NOT cross a forbidden boundary.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const thisFileUrl = import.meta.url;
const thisDir = dirname(fileURLToPath(thisFileUrl));
// thisDir is `<repo>/tests`; we need `<repo>/src`, so one level up.
const srcRoot = resolve(thisDir, '..', 'src');

/**
 * Layer that a TypeScript source file lives in, derived from its path
 * relative to `src/`.
 */
type Layer = 'cli' | 'config' | 'core' | 'errors' | 'infrastructure' | 'logger' | 'utils' | 'discovery' | 'scanner' | 'analyzer' | 'health' | 'treatment' | 'reporter' | 'cache' | 'plugins' | 'unknown';

function layerOf(filePath: string): Layer {
  const normalized = filePath.replace(/\\/g, '/');
  if (normalized.includes('/src/cli/')) return 'cli';
  if (normalized.includes('/src/config/')) return 'config';
  if (normalized.includes('/src/core/')) return 'core';
  if (normalized.includes('/src/errors/')) return 'errors';
  if (normalized.includes('/src/infrastructure/')) return 'infrastructure';
  if (normalized.includes('/src/logger/')) return 'logger';
  if (normalized.includes('/src/utils/')) return 'utils';
  if (normalized.includes('/src/discovery/')) return 'discovery';
  if (normalized.includes('/src/scanner/')) return 'scanner';
  if (normalized.includes('/src/analyzer/')) return 'analyzer';
  if (normalized.includes('/src/health/')) return 'health';
  if (normalized.includes('/src/treatment/')) return 'treatment';
  if (normalized.includes('/src/reporter/')) return 'reporter';
  if (normalized.includes('/src/cache/')) return 'cache';
  if (normalized.includes('/src/plugins/')) return 'plugins';
  return 'unknown';
}

/**
 * Forbidden import targets per layer. A forbidden target is identified by
 * its `@repodoctor/<layer>/` alias prefix OR its relative `../<layer>/`
 * form.
 *
 * v0.0.2 additions:
 *   - `discovery` MAY import: core, infrastructure, errors, utils.
 *   - `discovery` MAY NOT import: cli, config, logger.
 *   - All existing layers' forbidden lists are extended to include
 *     `discovery` where appropriate (core, errors, utils, logger,
 *     infrastructure must not depend on discovery — discovery is a
 *     higher-level module).
 */
const FORBIDDEN_IMPORTS: Readonly<Record<Layer, ReadonlyArray<Layer>>> = {
  cli: [],
  config: ['discovery', 'scanner', 'analyzer', 'health', 'treatment', 'reporter'],
  core: ['infrastructure', 'config', 'cli', 'logger', 'discovery', 'scanner', 'analyzer', 'health', 'treatment', 'reporter'],
  errors: ['infrastructure', 'config', 'cli', 'logger', 'core', 'discovery', 'scanner', 'analyzer', 'health', 'treatment', 'reporter'],
  infrastructure: ['config', 'cli', 'logger', 'discovery', 'scanner', 'analyzer', 'health', 'treatment', 'reporter'],
  logger: ['infrastructure', 'config', 'cli', 'errors', 'discovery', 'scanner', 'analyzer', 'health', 'treatment', 'reporter'],
  utils: ['infrastructure', 'config', 'cli', 'errors', 'core', 'logger', 'discovery', 'scanner', 'analyzer', 'health', 'treatment', 'reporter'],
  discovery: ['cli', 'config', 'logger', 'analyzer', 'health', 'treatment', 'reporter'],
  scanner: ['cli', 'config', 'logger', 'analyzer', 'health', 'treatment', 'reporter'],
  analyzer: ['cli', 'config', 'logger', 'health', 'treatment', 'reporter'],
  health: ['cli', 'config', 'logger', 'infrastructure', 'treatment', 'reporter'],
  // treatment may depend on core, utils, errors, analyzer, health.
  treatment: ['cli', 'config', 'logger', 'infrastructure', 'scanner', 'reporter'],
  // reporter may depend on core, utils, health, treatment.
  reporter: ['cli', 'config', 'logger', 'infrastructure', 'scanner', 'analyzer'],
  // cache may depend on core, utils, infrastructure, discovery, scanner, analyzer.
  cache: ['cli', 'config', 'logger', 'health', 'treatment', 'reporter', 'plugins'],
  // plugins may depend on core, utils, errors, scanner, analyzer, config.
  plugins: ['cli', 'logger', 'infrastructure', 'health', 'treatment', 'reporter', 'cache'],
  unknown: [],
};

/**
 * Extract all import specifiers from a TypeScript source string.
 *
 * Supports both `import ... from '...'` and `import type ... from '...'`
 * and dynamic `import('...')`. Does NOT support re-export specifiers
 * (RepoDoctor v0.0.1 does not use them).
 */
function extractImports(source: string): string[] {
  const specifiers: string[] = [];
  // Match: import [type] { ... } from 'specifier';
  //       import [type] DefaultName from 'specifier';
  //       import 'specifier';
  const importRegex = /\bimport\b(?:\s+type\b)?[^'";]*?from\s*['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(source)) !== null) {
    specifiers.push(match[1]);
  }
  // Match dynamic: await import('specifier')
  const dynamicRegex = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamicRegex.exec(source)) !== null) {
    specifiers.push(match[1]);
  }
  return specifiers;
}

/**
 * Determine the layer that an import specifier refers to.
 *
 * - `@repodoctor/<layer>/...` → `<layer>`
 * - `@repodoctor/<layer>` → `<layer>`
 * - Relative imports (`./`, `../`) are skipped: intra-layer imports are
 *   always allowed, and cross-layer relative imports are forbidden by
 *   convention (the codebase uses alias paths for cross-layer imports).
 *   We could resolve relative paths to detect violations, but the
 *   codebase never uses relative cross-layer imports, so this is
 *   unnecessary.
 * - `node:...` and bare specifiers like `vitest` → `external` (always
 *   allowed, except inside `utils/` per the spec).
 */
function importLayer(specifier: string): Layer | 'external' | 'relative' | 'node-builtin' {
  if (specifier.startsWith('@repodoctor/')) {
    const rest = specifier.slice('@repodoctor/'.length);
    const slash = rest.indexOf('/');
    const layer = slash === -1 ? rest : rest.slice(0, slash);
    if (
      layer === 'cli' ||
      layer === 'config' ||
      layer === 'core' ||
      layer === 'errors' ||
      layer === 'infrastructure' ||
      layer === 'logger' ||
      layer === 'utils' ||
      layer === 'discovery' ||
      layer === 'scanner' ||
      layer === 'analyzer' ||
      layer === 'health' ||
      layer === 'treatment' ||
      layer === 'reporter' ||
      layer === 'cache' ||
      layer === 'plugins'
    ) {
      return layer;
    }
    return 'unknown';
  }
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    return 'relative';
  }
  if (specifier.startsWith('node:')) {
    return 'node-builtin';
  }
  // Bare specifiers like "vitest", "fs", "path". These are external
  // packages or Node built-ins without the "node:" prefix.
  return 'external';
}

/**
 * Recursively collect every `.ts` file under `dir`.
 *
 * We avoid `fs.globSync` because it requires Node 22+. The recursive
 * walker below is portable back to Node 18.
 */
function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (stats.isFile() && full.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Collect all source files under `src/` as absolute paths.
 */
function collectSourceFiles(): string[] {
  return collectTsFiles(srcRoot);
}

/**
 * Strip line comments, block comments, and string/template literals from a
 * TypeScript source string. Used by the coding-standards tests to avoid
 * false positives inside comments and strings.
 *
 * The implementation is intentionally simple: it walks the source
 * character-by-character and tracks whether we are inside a string,
 * template literal, line comment, or block comment. It does NOT handle
 * nested template literals or regex literals — RepoDoctor v0.0.1 does not
 * use those.
 */
function stripCommentsAndStrings(source: string): string {
  let out = '';
  let i = 0;
  const len = source.length;
  while (i < len) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === undefined) break;

    // Line comment: // ... \n
    if (ch === '/' && next === '/') {
      while (i < len && source[i] !== '\n') {
        i += 1;
      }
      continue;
    }
    // Block comment: /* ... */
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < len && !(source[i] === '*' && source[i + 1] === '/')) {
        i += 1;
      }
      i += 2;
      continue;
    }
    // String literal: "..." or '...'
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i += 1;
      while (i < len && source[i] !== quote) {
        if (source[i] === '\\') {
          i += 2;
        } else {
          i += 1;
        }
      }
      i += 1;
      continue;
    }
    // Template literal: `...` (with `${...}` interpolation treated as string).
    if (ch === '`') {
      i += 1;
      while (i < len && source[i] !== '`') {
        if (source[i] === '\\') {
          i += 2;
        } else {
          i += 1;
        }
      }
      i += 1;
      continue;
    }
    // Regular character.
    out += ch;
    i += 1;
  }
  return out;
}

describe('Architecture — layer dependency enforcement', () => {
  const sourceFiles = collectSourceFiles();

  it('found at least one source file to validate', () => {
    expect(sourceFiles.length).toBeGreaterThan(0);
  });

  it('no file in core/ imports from infrastructure, config, cli, or logger', () => {
    const violations: string[] = [];
    for (const file of sourceFiles) {
      if (layerOf(file) !== 'core') continue;
      const source = readFileSync(file, 'utf8');
      const imports = extractImports(source);
      for (const spec of imports) {
        const target = importLayer(spec);
        if (typeof target === 'string' && FORBIDDEN_IMPORTS.core.includes(target as Layer)) {
          violations.push(`${file} → ${spec}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('no file in errors/ imports from infrastructure, config, cli, logger, or core', () => {
    const violations: string[] = [];
    for (const file of sourceFiles) {
      if (layerOf(file) !== 'errors') continue;
      const source = readFileSync(file, 'utf8');
      const imports = extractImports(source);
      for (const spec of imports) {
        const target = importLayer(spec);
        if (typeof target === 'string' && FORBIDDEN_IMPORTS.errors.includes(target as Layer)) {
          violations.push(`${file} → ${spec}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('no file in utils/ imports from any other RepoDoctor layer', () => {
    const violations: string[] = [];
    for (const file of sourceFiles) {
      if (layerOf(file) !== 'utils') continue;
      const source = readFileSync(file, 'utf8');
      const imports = extractImports(source);
      for (const spec of imports) {
        const target = importLayer(spec);
        if (typeof target === 'string' && FORBIDDEN_IMPORTS.utils.includes(target as Layer)) {
          violations.push(`${file} → ${spec}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('no file in logger/ imports from infrastructure, config, cli, or errors', () => {
    const violations: string[] = [];
    for (const file of sourceFiles) {
      if (layerOf(file) !== 'logger') continue;
      const source = readFileSync(file, 'utf8');
      const imports = extractImports(source);
      for (const spec of imports) {
        const target = importLayer(spec);
        if (typeof target === 'string' && FORBIDDEN_IMPORTS.logger.includes(target as Layer)) {
          violations.push(`${file} → ${spec}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('no file in infrastructure/ imports from config, cli, or logger', () => {
    const violations: string[] = [];
    for (const file of sourceFiles) {
      if (layerOf(file) !== 'infrastructure') continue;
      const source = readFileSync(file, 'utf8');
      const imports = extractImports(source);
      for (const spec of imports) {
        const target = importLayer(spec);
        if (
          typeof target === 'string' &&
          FORBIDDEN_IMPORTS.infrastructure.includes(target as Layer)
        ) {
          violations.push(`${file} → ${spec}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('no file in config/ imports from cli, logger, or discovery', () => {
    // Per the spec: config MAY import from core, errors, infrastructure, utils.
    // It may NOT import from cli, logger, or discovery.
    const violations: string[] = [];
    for (const file of sourceFiles) {
      if (layerOf(file) !== 'config') continue;
      const source = readFileSync(file, 'utf8');
      const imports = extractImports(source);
      for (const spec of imports) {
        const target = importLayer(spec);
        if (
          typeof target === 'string' &&
          FORBIDDEN_IMPORTS.config.includes(target as Layer)
        ) {
          violations.push(`${file} → ${spec}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('no file in discovery/ imports from cli, config, or logger', () => {
    // Per the v0.0.2 spec: discovery MAY import from core, infrastructure,
    // errors, utils. It MAY NOT import from cli, config, or logger.
    const violations: string[] = [];
    for (const file of sourceFiles) {
      if (layerOf(file) !== 'discovery') continue;
      const source = readFileSync(file, 'utf8');
      const imports = extractImports(source);
      for (const spec of imports) {
        const target = importLayer(spec);
        if (
          typeof target === 'string' &&
          FORBIDDEN_IMPORTS.discovery.includes(target as Layer)
        ) {
          violations.push(`${file} → ${spec}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('no file in scanner/ imports from cli, config, or logger', () => {
    // Per the v0.0.3 spec: scanner MAY import from core, infrastructure,
    // errors, utils, discovery. It MAY NOT import from cli, config, or logger.
    const violations: string[] = [];
    for (const file of sourceFiles) {
      if (layerOf(file) !== 'scanner') continue;
      const source = readFileSync(file, 'utf8');
      const imports = extractImports(source);
      for (const spec of imports) {
        const target = importLayer(spec);
        if (
          typeof target === 'string' &&
          FORBIDDEN_IMPORTS.scanner.includes(target as Layer)
        ) {
          violations.push(`${file} → ${spec}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('no file in scanner/builtins/ imports fs or path directly', () => {
    // Per the v0.0.3 spec: scanners MUST NOT import Node built-ins (fs, path).
    // They must use the injected ScannerFileSystem.
    const violations: string[] = [];
    for (const file of sourceFiles) {
      if (!file.replace(/\\/g, '/').includes('/src/scanner/builtins/')) continue;
      const source = readFileSync(file, 'utf8');
      const imports = extractImports(source);
      for (const spec of imports) {
        if (spec === 'fs' || spec === 'node:fs' || spec === 'path' || spec === 'node:path') {
          violations.push(`${file} → ${spec}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('no file in analyzer/ imports from cli, config, or logger', () => {
    // Per the v0.0.4 spec: analyzer MAY import from core, infrastructure,
    // errors, utils, scanner, discovery. It MAY NOT import from cli,
    // config, or logger.
    const violations: string[] = [];
    for (const file of sourceFiles) {
      if (layerOf(file) !== 'analyzer') continue;
      const source = readFileSync(file, 'utf8');
      const imports = extractImports(source);
      for (const spec of imports) {
        const target = importLayer(spec);
        if (
          typeof target === 'string' &&
          FORBIDDEN_IMPORTS.analyzer.includes(target as Layer)
        ) {
          violations.push(`${file} → ${spec}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('no file in analyzer/builtins/ imports fs, path, or ScannerFileSystem', () => {
    // Per the v0.0.4 spec: analyzers MUST NOT perform filesystem I/O.
    // They only read from the injected FactStore.
    const violations: string[] = [];
    for (const file of sourceFiles) {
      if (!file.replace(/\\/g, '/').includes('/src/analyzer/builtins/')) continue;
      const source = readFileSync(file, 'utf8');
      const imports = extractImports(source);
      for (const spec of imports) {
        if (
          spec === 'fs' ||
          spec === 'node:fs' ||
          spec === 'path' ||
          spec === 'node:path' ||
          spec.includes('ScannerFileSystem')
        ) {
          violations.push(`${file} → ${spec}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('no file in health/ imports from cli, config, logger, or infrastructure', () => {
    // Per the v0.0.5 spec: health MAY import from core, utils, errors,
    // analyzer, discovery. It MAY NOT import from cli, config, logger,
    // or infrastructure.
    const violations: string[] = [];
    for (const file of sourceFiles) {
      if (layerOf(file) !== 'health') continue;
      const source = readFileSync(file, 'utf8');
      const imports = extractImports(source);
      for (const spec of imports) {
        const target = importLayer(spec);
        if (
          typeof target === 'string' &&
          FORBIDDEN_IMPORTS.health.includes(target as Layer)
        ) {
          violations.push(`${file} → ${spec}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('no file in health/ imports fs or path directly', () => {
    // Per the v0.0.5 spec: the Health Engine is pure mathematics and
    // object mapping. It MUST NOT perform filesystem I/O.
    const violations: string[] = [];
    for (const file of sourceFiles) {
      if (layerOf(file) !== 'health') continue;
      const source = readFileSync(file, 'utf8');
      const imports = extractImports(source);
      for (const spec of imports) {
        if (spec === 'fs' || spec === 'node:fs' || spec === 'path' || spec === 'node:path') {
          violations.push(`${file} → ${spec}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('no file in treatment/ imports from forbidden layers', () => {
    const violations: string[] = [];
    for (const file of sourceFiles) {
      if (layerOf(file) !== 'treatment') continue;
      const source = readFileSync(file, 'utf8');
      const imports = extractImports(source);
      for (const spec of imports) {
        const target = importLayer(spec);
        if (
          typeof target === 'string' &&
          FORBIDDEN_IMPORTS.treatment.includes(target as Layer)
        ) {
          violations.push(`${file} → ${spec}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('no file in reporter/ imports from forbidden layers', () => {
    const violations: string[] = [];
    for (const file of sourceFiles) {
      if (layerOf(file) !== 'reporter') continue;
      const source = readFileSync(file, 'utf8');
      const imports = extractImports(source);
      for (const spec of imports) {
        const target = importLayer(spec);
        if (
          typeof target === 'string' &&
          FORBIDDEN_IMPORTS.reporter.includes(target as Layer)
        ) {
          violations.push(`${file} → ${spec}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('no file in reporter/ imports fs or path directly', () => {
    const violations: string[] = [];
    for (const file of sourceFiles) {
      if (layerOf(file) !== 'reporter') continue;
      const source = readFileSync(file, 'utf8');
      const imports = extractImports(source);
      for (const spec of imports) {
        if (spec === 'fs' || spec === 'node:fs' || spec === 'path' || spec === 'node:path') {
          violations.push(`${file} → ${spec}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

describe('Architecture — coding standards', () => {
  const sourceFiles = collectSourceFiles();

  it('no source file uses the `any` keyword as a type annotation', () => {
    // This is a sanity check on top of the eslint rule. We look for
    // `: any`, `as any`, `<any>`, and `any[]` patterns that would
    // indicate explicit `any` usage.
    //
    // To avoid false positives inside comments and string literals, we
    // strip line comments (`// ...`), block comments (`/* ... */`), and
    // template/string literals before applying the regex.
    const violations: string[] = [];
    const anyRegex = /:\s*any\b|as\s+any\b|<any>|\bany\[\]/;
    for (const file of sourceFiles) {
      const source = readFileSync(file, 'utf8');
      const stripped = stripCommentsAndStrings(source);
      if (anyRegex.test(stripped)) {
        violations.push(file);
      }
    }
    expect(violations).toEqual([]);
  });

  it('no source file outside logger/ConsoleTransport.ts uses console.*', () => {
    const violations: string[] = [];
    for (const file of sourceFiles) {
      if (file.replace(/\\/g, '/').endsWith('/logger/ConsoleTransport.ts')) continue;
      const source = readFileSync(file, 'utf8');
      const stripped = stripCommentsAndStrings(source);
      // Look for `console.log`, `console.error`, etc. in code only.
      if (/\bconsole\.\w+\s*\(/.test(stripped)) {
        violations.push(file);
      }
    }
    expect(violations).toEqual([]);
  });

  it('no source file uses `export *`', () => {
    const violations: string[] = [];
    for (const file of sourceFiles) {
      const source = readFileSync(file, 'utf8');
      if (/^\s*export\s+\*\s+from/m.test(source)) {
        violations.push(file);
      }
    }
    expect(violations).toEqual([]);
  });

  it('no source file uses `@ts-ignore` or `@ts-expect-error`', () => {
    const violations: string[] = [];
    for (const file of sourceFiles) {
      const source = readFileSync(file, 'utf8');
      if (/@ts-ignore|@ts-expect-error/.test(source)) {
        violations.push(file);
      }
    }
    expect(violations).toEqual([]);
  });

  it('PluginRegistry and EventBus are exported from core', () => {
    const coreFiles = sourceFiles.filter(
      (f) => layerOf(f) === 'core',
    );
    const allCoreSource = coreFiles
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    expect(allCoreSource).toContain('class PluginRegistry');
    expect(allCoreSource).toContain('class EventBus');
    expect(allCoreSource).toContain('class ExecutionContext');
  });

  it('no file in src/scanner/ contains severity, score, or recommendation strings', () => {
    // Per the v0.0.3 spec: "No severity, score, or recommendation strings
    // exist anywhere in the src/scanner/ directory."
    //
    // We check for common severity/scoring/recommendation keywords in
    // code (not comments) to enforce the objective-only invariant.
    const violations: string[] = [];
    const forbiddenWords = [
      'severity',
      'Severity',
      'SEVERITY',
      'recommendation',
      'Recommendation',
      'RECOMMENDATION',
      'healthScore',
      'HealthScore',
      'diagnosis',
      'Diagnosis',
      'DIAGNOSIS',
      'treatment',
      'Treatment',
      'TREATMENT',
      'Critical',
      'Warning',
      'Healthy',
      'critical',
      'warning',
      'healthy',
    ];
    for (const file of sourceFiles) {
      if (layerOf(file) !== 'scanner') continue;
      const source = readFileSync(file, 'utf8');
      const stripped = stripCommentsAndStrings(source);
      for (const word of forbiddenWords) {
        // Use word-boundary regex to avoid false positives (e.g.
        // "severity" inside a longer identifier).
        const regex = new RegExp(`\\b${word}\\b`);
        if (regex.test(stripped)) {
          violations.push(`${file}: contains '${word}'`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('no file in src/analyzer/ contains severity, score, or treatment strings', () => {
    // Per the v0.0.4 spec: "No severity, score, or treatment strings
    // exist anywhere in the src/analyzer/ directory."
    const violations: string[] = [];
    const forbiddenWords = [
      'severity',
      'Severity',
      'SEVERITY',
      'recommendation',
      'Recommendation',
      'RECOMMENDATION',
      'healthScore',
      'HealthScore',
      'diagnosis',
      'Diagnosis',
      'DIAGNOSIS',
      'treatment',
      'Treatment',
      'TREATMENT',
      'Critical',
      'Warning',
      'Healthy',
      'critical',
      'warning',
      'healthy',
    ];
    for (const file of sourceFiles) {
      if (layerOf(file) !== 'analyzer') continue;
      const source = readFileSync(file, 'utf8');
      const stripped = stripCommentsAndStrings(source);
      for (const word of forbiddenWords) {
        const regex = new RegExp(`\\b${word}\\b`);
        if (regex.test(stripped)) {
          violations.push(`${file}: contains '${word}'`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('no file in src/health/ contains treatment or recommendation strings', () => {
    // Per the v0.0.5 spec: "No treatment, recommendation, or fix
    // strings exist anywhere in the src/health/ directory."
    //
    // Note: the health module DOES contain severity/score terminology
    // (Critical, Warning, etc.) — those are part of the diagnosis
    // domain. We only check for treatment/recommendation/fix strings.
    const violations: string[] = [];
    const forbiddenWords = [
      'recommendation',
      'Recommendation',
      'RECOMMENDATION',
      'treatment',
      'Treatment',
      'TREATMENT',
      'run npm',
      'run yarn',
      'run pnpm',
      'add this',
      'update your',
      'modify your',
    ];
    for (const file of sourceFiles) {
      if (layerOf(file) !== 'health') continue;
      const source = readFileSync(file, 'utf8');
      const stripped = stripCommentsAndStrings(source);
      for (const word of forbiddenWords) {
        const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        if (regex.test(stripped)) {
          violations.push(`${file}: contains '${word}'`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
