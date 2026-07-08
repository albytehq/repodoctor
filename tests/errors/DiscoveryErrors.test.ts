/**
 * Unit tests for MalformedJsonError and PermissionError.
 *
 * Coverage:
 *   - Error codes are correct.
 *   - Path is attached to both the field and the context.
 *   - isOperational defaults to true.
 *   - They extend BaseError.
 */

import { describe, it, expect } from 'vitest';
import { MalformedJsonError, MALFORMED_JSON_ERROR_CODE } from '@repodoctor/errors/MalformedJsonError';
import { PermissionError, PERMISSION_DENIED_ERROR_CODE } from '@repodoctor/errors/PermissionError';
import { BaseError } from '@repodoctor/errors/BaseError';

describe('MalformedJsonError', () => {
  it('has the MALFORMED_JSON code', () => {
    const err = new MalformedJsonError('/repo/package.json');
    expect(err.code).toBe(MALFORMED_JSON_ERROR_CODE);
    expect(err.code).toBe('MALFORMED_JSON');
  });

  it('extends BaseError', () => {
    const err = new MalformedJsonError('/repo/package.json');
    expect(err instanceof BaseError).toBe(true);
    expect(err instanceof MalformedJsonError).toBe(true);
  });

  it('is operational by default', () => {
    const err = new MalformedJsonError('/repo/package.json');
    expect(err.isOperational).toBe(true);
  });

  it('attaches the path to context and exposes it as a field', () => {
    const err = new MalformedJsonError('/repo/package.json');
    expect(err.path).toBe('/repo/package.json');
    expect(err.context?.path).toBe('/repo/package.json');
  });

  it('message includes the path', () => {
    const err = new MalformedJsonError('/repo/package.json');
    expect(err.message).toContain('/repo/package.json');
  });

  it('accepts a cause', () => {
    const cause = new Error('Unexpected token');
    const err = new MalformedJsonError('/repo/package.json', { cause });
    expect(err.cause).toBe(cause);
  });
});

describe('PermissionError', () => {
  it('has the PERMISSION_DENIED code', () => {
    const err = new PermissionError('/repo/locked');
    expect(err.code).toBe(PERMISSION_DENIED_ERROR_CODE);
    expect(err.code).toBe('PERMISSION_DENIED');
  });

  it('extends BaseError', () => {
    const err = new PermissionError('/repo/locked');
    expect(err instanceof BaseError).toBe(true);
    expect(err instanceof PermissionError).toBe(true);
  });

  it('is operational by default', () => {
    const err = new PermissionError('/repo/locked');
    expect(err.isOperational).toBe(true);
  });

  it('attaches the path to context and exposes it as a field', () => {
    const err = new PermissionError('/repo/locked');
    expect(err.path).toBe('/repo/locked');
    expect(err.context?.path).toBe('/repo/locked');
  });

  it('message includes the path', () => {
    const err = new PermissionError('/repo/locked');
    expect(err.message).toContain('/repo/locked');
  });

  it('accepts a cause', () => {
    const cause = new Error('EACCES');
    const err = new PermissionError('/repo/locked', { cause });
    expect(err.cause).toBe(cause);
  });
});
