/**
 * Unit tests for FactValidator.
 *
 * Coverage:
 *   - Valid facts pass (string, number, boolean, array values).
 *   - Invalid type (empty, lowercase, non-string).
 *   - Invalid target (empty, non-string).
 *   - Invalid value (undefined, null).
 *   - Array with undefined/null elements.
 */

import { describe, it, expect } from 'vitest';
import { validateFact } from '@repodoctor/scanner/FactValidator';
import type { RawFact } from '@repodoctor/core/domain/Scan';

describe('FactValidator', () => {
  describe('valid facts', () => {
    it('accepts a fact with a boolean value', () => {
      const fact: RawFact = { type: 'FILE_EXISTS', target: '.gitignore', value: true };
      const result = validateFact(fact);
      expect(result.valid).toBe(true);
    });

    it('accepts a fact with a number value', () => {
      const fact: RawFact = { type: 'FILE_SIZE_BYTES', target: 'README.md', value: 40 };
      const result = validateFact(fact);
      expect(result.valid).toBe(true);
    });

    it('accepts a fact with a string value', () => {
      const fact: RawFact = { type: 'REPO_NAME', target: 'package.json', value: 'my-app' };
      const result = validateFact(fact);
      expect(result.valid).toBe(true);
    });

    it('accepts a fact with an array value', () => {
      const fact: RawFact = {
        type: 'DEPENDENCY_DECLARED',
        target: 'package.json',
        value: ['react', 'express'],
      };
      const result = validateFact(fact);
      expect(result.valid).toBe(true);
    });

    it('accepts a fact with an empty array value', () => {
      const fact: RawFact = { type: 'EMPTY_LIST', target: 'x', value: [] };
      const result = validateFact(fact);
      expect(result.valid).toBe(true);
    });

    it('accepts a fact with an object value', () => {
      const fact: RawFact = { type: 'CONFIG_DATA', target: 'x', value: { a: 1 } };
      const result = validateFact(fact);
      expect(result.valid).toBe(true);
    });

    it('accepts a fact with underscore in type', () => {
      const fact: RawFact = { type: 'FILE_EXISTS', target: 'x', value: true };
      const result = validateFact(fact);
      expect(result.valid).toBe(true);
    });
  });

  describe('invalid type', () => {
    it('rejects an empty type', () => {
      const result = validateFact({ type: '', target: 'x', value: true });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.field).toBe('type');
    });

    it('rejects a non-string type', () => {
      const result = validateFact({ type: 123 as unknown as string, target: 'x', value: true });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.field).toBe('type');
    });

    it('rejects a lowercase type', () => {
      const result = validateFact({ type: 'file_exists', target: 'x', value: true });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.field).toBe('type');
    });

    it('rejects a type with numbers', () => {
      const result = validateFact({ type: 'FILE_EXISTS2', target: 'x', value: true });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.field).toBe('type');
    });

    it('rejects a type with spaces', () => {
      const result = validateFact({ type: 'FILE EXISTS', target: 'x', value: true });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.field).toBe('type');
    });
  });

  describe('invalid target', () => {
    it('rejects an empty target', () => {
      const result = validateFact({ type: 'FILE_EXISTS', target: '', value: true });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.field).toBe('target');
    });

    it('rejects a non-string target', () => {
      const result = validateFact({ type: 'FILE_EXISTS', target: 42 as unknown as string, value: true });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.field).toBe('target');
    });
  });

  describe('invalid value', () => {
    it('rejects undefined value', () => {
      const result = validateFact({ type: 'FILE_EXISTS', target: 'x', value: undefined });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.field).toBe('value');
    });

    it('rejects null value', () => {
      const result = validateFact({ type: 'FILE_EXISTS', target: 'x', value: null });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.field).toBe('value');
    });

    it('rejects array with undefined element', () => {
      const result = validateFact({ type: 'LIST', target: 'x', value: ['a', undefined, 'b'] });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.field).toBe('value');
    });

    it('rejects array with null element', () => {
      const result = validateFact({ type: 'LIST', target: 'x', value: ['a', null, 'b'] });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.field).toBe('value');
    });
  });
});
