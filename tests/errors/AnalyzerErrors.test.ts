/**
 * Unit tests for new error classes introduced in v0.0.4.
 */

import { describe, it, expect } from 'vitest';
import {
  AnalyzerTimeoutError,
  ANALYZER_TIMEOUT_ERROR_CODE,
} from '@repodoctor/errors/AnalyzerTimeoutError';
import {
  AnalyzerError,
  ANALYZER_ERROR_CODE,
} from '@repodoctor/errors/AnalyzerError';
import {
  FindingValidationError,
  FINDING_VALIDATION_ERROR_CODE,
} from '@repodoctor/errors/FindingValidationError';
import { BaseError } from '@repodoctor/errors/BaseError';

describe('AnalyzerTimeoutError', () => {
  it('has the correct code', () => {
    const err = new AnalyzerTimeoutError('my-analyzer', 2000);
    expect(err.code).toBe(ANALYZER_TIMEOUT_ERROR_CODE);
    expect(err.code).toBe('ANALYZER_TIMEOUT');
  });

  it('extends BaseError', () => {
    const err = new AnalyzerTimeoutError('my-analyzer', 2000);
    expect(err instanceof BaseError).toBe(true);
    expect(err instanceof AnalyzerTimeoutError).toBe(true);
  });

  it('exposes analyzerId and timeoutMs', () => {
    const err = new AnalyzerTimeoutError('my-analyzer', 5000);
    expect(err.analyzerId).toBe('my-analyzer');
    expect(err.timeoutMs).toBe(5000);
  });

  it('message includes analyzerId and timeout', () => {
    const err = new AnalyzerTimeoutError('my-analyzer', 2000);
    expect(err.message).toContain('my-analyzer');
    expect(err.message).toContain('2000');
  });

  it('is operational by default', () => {
    const err = new AnalyzerTimeoutError('my-analyzer', 2000);
    expect(err.isOperational).toBe(true);
  });

  it('accepts a cause', () => {
    const cause = new Error('original');
    const err = new AnalyzerTimeoutError('my-analyzer', 2000, { cause });
    expect(err.cause).toBe(cause);
  });
});

describe('AnalyzerError', () => {
  it('has the correct code', () => {
    const err = new AnalyzerError('my-analyzer', 'something went wrong');
    expect(err.code).toBe(ANALYZER_ERROR_CODE);
    expect(err.code).toBe('ANALYZER_ERROR');
  });

  it('extends BaseError', () => {
    const err = new AnalyzerError('my-analyzer', 'boom');
    expect(err instanceof BaseError).toBe(true);
    expect(err instanceof AnalyzerError).toBe(true);
  });

  it('exposes analyzerId', () => {
    const err = new AnalyzerError('my-analyzer', 'boom');
    expect(err.analyzerId).toBe('my-analyzer');
  });

  it('message includes analyzerId and original message', () => {
    const err = new AnalyzerError('my-analyzer', 'disk full');
    expect(err.message).toContain('my-analyzer');
    expect(err.message).toContain('disk full');
  });

  it('is operational by default', () => {
    const err = new AnalyzerError('my-analyzer', 'boom');
    expect(err.isOperational).toBe(true);
  });

  it('accepts a cause', () => {
    const cause = new Error('original');
    const err = new AnalyzerError('my-analyzer', 'boom', { cause });
    expect(err.cause).toBe(cause);
  });
});

describe('FindingValidationError', () => {
  it('has the correct code', () => {
    const err = new FindingValidationError('ruleId', 'must not be empty');
    expect(err.code).toBe(FINDING_VALIDATION_ERROR_CODE);
    expect(err.code).toBe('FINDING_VALIDATION');
  });

  it('extends BaseError', () => {
    const err = new FindingValidationError('ruleId', 'bad');
    expect(err instanceof BaseError).toBe(true);
    expect(err instanceof FindingValidationError).toBe(true);
  });

  it('exposes field and reason', () => {
    const err = new FindingValidationError('target', 'must not be empty');
    expect(err.field).toBe('target');
    expect(err.reason).toBe('must not be empty');
  });

  it('message includes field and reason', () => {
    const err = new FindingValidationError('message', 'too short');
    expect(err.message).toContain('message');
    expect(err.message).toContain('too short');
  });

  it('is operational by default', () => {
    const err = new FindingValidationError('ruleId', 'bad');
    expect(err.isOperational).toBe(true);
  });

  it('accepts a cause', () => {
    const cause = new Error('original');
    const err = new FindingValidationError('ruleId', 'bad', { cause });
    expect(err.cause).toBe(cause);
  });
});
