/**
 * Unit tests for the ConfigValidator.
 *
 * Coverage:
 *   - Empty input → defaults.
 *   - Valid logLevel / strict / organs.
 *   - Invalid logLevel / strict / organs.
 *   - Warnings for organs (v0.0.1 behavior).
 *   - Multiple errors collected before throwing.
 */

import { describe, it, expect } from 'vitest';
import { validateConfig } from '@repodoctor/config/ConfigValidator';
import { ConfigError } from '@repodoctor/errors/ConfigError';

describe('ConfigValidator', () => {
  it('returns defaults for an empty raw config', () => {
    const { config, warnings } = validateConfig({});
    expect(config.logLevel).toBe('info');
    expect(config.strict).toBe(false);
    expect(config.organs).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('accepts all valid log levels', () => {
    for (const level of ['debug', 'info', 'warn', 'error', 'silent'] as const) {
      const { config } = validateConfig({ logLevel: level });
      expect(config.logLevel).toBe(level);
    }
  });

  it('rejects an invalid logLevel string', () => {
    expect(() => validateConfig({ logLevel: 'verbose' })).toThrow(ConfigError);
  });

  it('rejects a non-string logLevel', () => {
    expect(() => validateConfig({ logLevel: 42 })).toThrow(ConfigError);
  });

  it('accepts strict: true', () => {
    const { config } = validateConfig({ strict: true });
    expect(config.strict).toBe(true);
  });

  it('rejects a non-boolean strict', () => {
    expect(() => validateConfig({ strict: 'yes' })).toThrow(ConfigError);
  });

  it('accepts an empty organs array without errors', () => {
    const { config, warnings } = validateConfig({ organs: [] });
    expect(config.organs).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('accepts a non-empty organs array but emits a v0.0.1 warning', () => {
    const { config, warnings } = validateConfig({ organs: ['dependencies'] });
    expect(config.organs).toEqual(['dependencies']);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain('v0.0.1');
  });

  it('rejects a non-array organs field', () => {
    expect(() => validateConfig({ organs: 'not-an-array' })).toThrow(ConfigError);
  });

  it('rejects an organs array containing non-strings', () => {
    expect(() => validateConfig({ organs: [1, 2, 3] })).toThrow(ConfigError);
  });

  it('rejects an organs array containing empty strings', () => {
    expect(() => validateConfig({ organs: [''] })).toThrow(ConfigError);
  });

  it('collects multiple errors before throwing', () => {
    try {
      validateConfig({ logLevel: 42, strict: 'yes', organs: 'no' });
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const configError = error as ConfigError;
      // The error's context carries the joined error list.
      const context = configError.context as { errors?: string } | undefined;
      expect(context?.errors).toBeDefined();
      const errors = context?.errors ?? '';
      expect(errors).toContain('logLevel');
      expect(errors).toContain('strict');
      expect(errors).toContain('organs');
    }
  });

  // --- v0.0.2 discovery config ---
  describe('discovery config (v0.0.2)', () => {
    it('returns default ignoreRoot when discovery is undefined', () => {
      const { config } = validateConfig({});
      expect(config.discovery.ignoreRoot).toEqual([
        'node_modules',
        '.git',
        'dist',
        'build',
        '.cache',
      ]);
    });

    it('returns default ignoreRoot when discovery.ignoreRoot is undefined', () => {
      const { config } = validateConfig({ discovery: {} });
      expect(config.discovery.ignoreRoot).toEqual([
        'node_modules',
        '.git',
        'dist',
        'build',
        '.cache',
      ]);
    });

    it('accepts a custom ignoreRoot array', () => {
      const { config } = validateConfig({
        discovery: { ignoreRoot: ['vendor', 'tmp'] },
      });
      expect(config.discovery.ignoreRoot).toEqual(['vendor', 'tmp']);
    });

    it('an empty ignoreRoot array replaces the defaults', () => {
      const { config } = validateConfig({ discovery: { ignoreRoot: [] } });
      expect(config.discovery.ignoreRoot).toEqual([]);
    });

    it('rejects a non-object discovery field', () => {
      expect(() => validateConfig({ discovery: 'not-an-object' })).toThrow(ConfigError);
    });

    it('rejects a null discovery field', () => {
      expect(() => validateConfig({ discovery: null })).toThrow(ConfigError);
    });

    it('rejects an array discovery field', () => {
      expect(() => validateConfig({ discovery: [] })).toThrow(ConfigError);
    });

    it('rejects a non-array ignoreRoot', () => {
      expect(() =>
        validateConfig({ discovery: { ignoreRoot: 'not-an-array' } }),
      ).toThrow(ConfigError);
    });

    it('rejects non-string entries in ignoreRoot', () => {
      expect(() =>
        validateConfig({ discovery: { ignoreRoot: [1, 2, 3] } }),
      ).toThrow(ConfigError);
    });

    it('rejects empty strings in ignoreRoot', () => {
      expect(() =>
        validateConfig({ discovery: { ignoreRoot: [''] } }),
      ).toThrow(ConfigError);
    });

    it('drops non-string entries but keeps valid ones, reporting errors', () => {
      try {
        validateConfig({ discovery: { ignoreRoot: ['valid', 42] } });
        throw new Error('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
        const ctx = (error as ConfigError).context as { errors?: string };
        expect(ctx.errors).toContain('ignoreRoot');
      }
    });
  });

  // --- v0.0.8 plugins config ---
  describe('plugins config (v0.0.8)', () => {
    it('returns empty array when plugins is undefined', () => {
      const { config } = validateConfig({});
      expect(config.plugins).toEqual([]);
    });

    it('accepts a valid plugins array', () => {
      const { config } = validateConfig({
        plugins: ['repodoctor-nextjs', './local-plugin.ts'],
      });
      expect(config.plugins).toEqual(['repodoctor-nextjs', './local-plugin.ts']);
    });

    it('accepts an empty plugins array', () => {
      const { config } = validateConfig({ plugins: [] });
      expect(config.plugins).toEqual([]);
    });

    it('rejects a non-array plugins field', () => {
      expect(() => validateConfig({ plugins: 'not-an-array' })).toThrow(ConfigError);
    });

    it('rejects non-string entries in plugins', () => {
      expect(() => validateConfig({ plugins: [1, 2, 3] })).toThrow(ConfigError);
    });

    it('rejects empty strings in plugins', () => {
      expect(() => validateConfig({ plugins: [''] })).toThrow(ConfigError);
    });

    it('drops non-string entries but keeps valid ones, reporting errors', () => {
      try {
        validateConfig({ plugins: ['valid', 42] });
        throw new Error('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
        const ctx = (error as ConfigError).context as { errors?: string };
        expect(ctx.errors).toContain('plugins');
      }
    });
  });
});
