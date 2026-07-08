/**
 * Unit tests for FindingValidator.
 */

import { describe, it, expect } from 'vitest';
import { validateFinding } from '@repodoctor/analyzer/FindingValidator';
import type { RawFinding } from '@repodoctor/core/domain/Analysis';

describe('FindingValidator', () => {
  describe('valid findings', () => {
    it('accepts a minimal finding', () => {
      const finding: RawFinding = {
        ruleId: 'env-file-not-ignored',
        target: '.env',
        message: 'The .env file is not listed in .gitignore.',
      };
      expect(validateFinding(finding).valid).toBe(true);
    });

    it('accepts a finding with metadata', () => {
      const finding: RawFinding = {
        ruleId: 'lockfile-missing',
        target: 'package.json',
        message: 'No lockfile found.',
        metadata: { dependencyCount: 5 },
      };
      expect(validateFinding(finding).valid).toBe(true);
    });

    it('accepts ruleId with numbers', () => {
      const finding: RawFinding = {
        ruleId: 'rule-123-test',
        target: 'x',
        message: 'msg',
      };
      expect(validateFinding(finding).valid).toBe(true);
    });

    it('accepts single-word ruleId', () => {
      const finding: RawFinding = {
        ruleId: 'lockfile',
        target: 'x',
        message: 'msg',
      };
      expect(validateFinding(finding).valid).toBe(true);
    });

    it('accepts empty metadata object', () => {
      const finding: RawFinding = {
        ruleId: 'test',
        target: 'x',
        message: 'msg',
        metadata: {},
      };
      expect(validateFinding(finding).valid).toBe(true);
    });
  });

  describe('invalid ruleId', () => {
    it('rejects empty ruleId', () => {
      const result = validateFinding({ ruleId: '', target: 'x', message: 'msg' });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.field).toBe('ruleId');
    });

    it('rejects non-string ruleId', () => {
      const result = validateFinding({ ruleId: 123 as unknown as string, target: 'x', message: 'msg' });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.field).toBe('ruleId');
    });

    it('rejects uppercase ruleId', () => {
      const result = validateFinding({ ruleId: 'EnvFileNotIgnored', target: 'x', message: 'msg' });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.field).toBe('ruleId');
    });

    it('rejects ruleId with underscores', () => {
      const result = validateFinding({ ruleId: 'env_file_not_ignored', target: 'x', message: 'msg' });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.field).toBe('ruleId');
    });

    it('rejects ruleId with leading hyphen', () => {
      const result = validateFinding({ ruleId: '-env', target: 'x', message: 'msg' });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.field).toBe('ruleId');
    });

    it('rejects ruleId with trailing hyphen', () => {
      const result = validateFinding({ ruleId: 'env-', target: 'x', message: 'msg' });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.field).toBe('ruleId');
    });

    it('rejects ruleId with double hyphen', () => {
      const result = validateFinding({ ruleId: 'env--file', target: 'x', message: 'msg' });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.field).toBe('ruleId');
    });
  });

  describe('invalid target', () => {
    it('rejects empty target', () => {
      const result = validateFinding({ ruleId: 'test', target: '', message: 'msg' });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.field).toBe('target');
    });

    it('rejects non-string target', () => {
      const result = validateFinding({ ruleId: 'test', target: 42 as unknown as string, message: 'msg' });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.field).toBe('target');
    });
  });

  describe('invalid message', () => {
    it('rejects empty message', () => {
      const result = validateFinding({ ruleId: 'test', target: 'x', message: '' });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.field).toBe('message');
    });

    it('rejects non-string message', () => {
      const result = validateFinding({ ruleId: 'test', target: 'x', message: null as unknown as string });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.field).toBe('message');
    });
  });

  describe('invalid metadata', () => {
    it('rejects null metadata', () => {
      const result = validateFinding({ ruleId: 'test', target: 'x', message: 'msg', metadata: null });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.field).toBe('metadata');
    });

    it('rejects array metadata', () => {
      const result = validateFinding({ ruleId: 'test', target: 'x', message: 'msg', metadata: [1, 2] });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.field).toBe('metadata');
    });

    it('rejects string metadata', () => {
      const result = validateFinding({ ruleId: 'test', target: 'x', message: 'msg', metadata: 'not-an-object' });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.field).toBe('metadata');
    });
  });
});
