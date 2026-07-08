/**
 * Unit tests for the BaseError abstract class and its concrete subclasses.
 *
 * Coverage:
 *   - BaseError sets name, code, context, isOperational.
 *   - toJSON serializes the error.
 *   - cause is propagated when provided.
 *   - isOperational defaults to true.
 *   - Specific error codes for ConfigError / FileNotFoundError / CLIArgumentError.
 *   - FileNotFoundError attaches path to context.
 */

import { describe, it, expect } from 'vitest';
import { BaseError } from '@repodoctor/errors/BaseError';
import { ConfigError, CONFIG_ERROR_CODE } from '@repodoctor/errors/ConfigError';
import { FileNotFoundError, FILE_NOT_FOUND_ERROR_CODE } from '@repodoctor/errors/FileNotFoundError';
import { CLIArgumentError, CLI_ARG_ERROR_CODE } from '@repodoctor/errors/CLIArgumentError';

class TestError extends BaseError {
  constructor(
    message: string,
    options?: { context?: object; isOperational?: boolean; cause?: unknown },
  ) {
    super(message, 'TEST_ERROR', options);
  }
}

describe('BaseError', () => {
  it('sets name to the constructor name', () => {
    const err = new TestError('boom');
    expect(err.name).toBe('TestError');
  });

  it('sets code, message, and default isOperational=true', () => {
    const err = new TestError('boom');
    expect(err.code).toBe('TEST_ERROR');
    expect(err.message).toBe('boom');
    expect(err.isOperational).toBe(true);
  });

  it('accepts an explicit isOperational=false', () => {
    const err = new TestError('boom', { isOperational: false });
    expect(err.isOperational).toBe(false);
  });

  it('accepts a context payload', () => {
    const err = new TestError('boom', { context: { foo: 'bar', n: 42 } });
    expect(err.context).toEqual({ foo: 'bar', n: 42 });
  });

  it('toJSON returns a plain object snapshot', () => {
    const err = new TestError('boom', { context: { foo: 'bar' } });
    expect(err.toJSON()).toEqual({
      name: 'TestError',
      message: 'boom',
      code: 'TEST_ERROR',
      context: { foo: 'bar' },
      isOperational: true,
    });
  });

  it('propagates the cause option via Error.cause', () => {
    const root = new Error('root cause');
    const err = new TestError('wrapper', { cause: root });
    expect(err.cause).toBe(root);
  });

  it('instanceof checks work after transpilation', () => {
    const err = new TestError('boom');
    expect(err instanceof BaseError).toBe(true);
    expect(err instanceof TestError).toBe(true);
    expect(err instanceof Error).toBe(true);
  });
});

describe('ConfigError', () => {
  it('has the CONFIG_ERROR code', () => {
    const err = new ConfigError('bad config');
    expect(err.code).toBe(CONFIG_ERROR_CODE);
    expect(err.code).toBe('CONFIG_ERROR');
  });

  it('extends BaseError', () => {
    const err = new ConfigError('bad config');
    expect(err instanceof BaseError).toBe(true);
    expect(err instanceof ConfigError).toBe(true);
  });

  it('is operational by default', () => {
    const err = new ConfigError('bad config');
    expect(err.isOperational).toBe(true);
  });
});

describe('FileNotFoundError', () => {
  it('has the FILE_NOT_FOUND code', () => {
    const err = new FileNotFoundError('/some/path');
    expect(err.code).toBe(FILE_NOT_FOUND_ERROR_CODE);
    expect(err.code).toBe('FILE_NOT_FOUND');
  });

  it('attaches the path to context and exposes it as a field', () => {
    const err = new FileNotFoundError('/some/path');
    expect(err.path).toBe('/some/path');
    expect(err.context?.path).toBe('/some/path');
  });

  it('message includes the path', () => {
    const err = new FileNotFoundError('/some/path');
    expect(err.message).toContain('/some/path');
  });
});

describe('CLIArgumentError', () => {
  it('has the CLI_ARG_ERROR code', () => {
    const err = new CLIArgumentError('bad flag');
    expect(err.code).toBe(CLI_ARG_ERROR_CODE);
    expect(err.code).toBe('CLI_ARG_ERROR');
  });

  it('extends BaseError', () => {
    const err = new CLIArgumentError('bad flag');
    expect(err instanceof BaseError).toBe(true);
    expect(err instanceof CLIArgumentError).toBe(true);
  });
});
