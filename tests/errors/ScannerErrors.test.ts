/**
 * Unit tests for new error classes introduced in v0.0.3.
 *
 * Coverage:
 *   - ScannerTimeoutError: code, scannerId, timeoutMs.
 *   - FileSizeExceededError: code, path, actualSize, maxSize.
 *   - ScannerError: code, scannerId, message.
 */

import { describe, it, expect } from 'vitest';
import {
  ScannerTimeoutError,
  SCANNER_TIMEOUT_ERROR_CODE,
} from '@repodoctor/errors/ScannerTimeoutError';
import {
  FileSizeExceededError,
  FILE_SIZE_EXCEEDED_ERROR_CODE,
  MAX_SCANNER_FILE_SIZE_BYTES,
} from '@repodoctor/errors/FileSizeExceededError';
import { ScannerError, SCANNER_ERROR_CODE } from '@repodoctor/errors/ScannerError';
import { BaseError } from '@repodoctor/errors/BaseError';

describe('ScannerTimeoutError', () => {
  it('has the correct code', () => {
    const err = new ScannerTimeoutError('my-scanner', 3000);
    expect(err.code).toBe(SCANNER_TIMEOUT_ERROR_CODE);
    expect(err.code).toBe('SCANNER_TIMEOUT');
  });

  it('extends BaseError', () => {
    const err = new ScannerTimeoutError('my-scanner', 3000);
    expect(err instanceof BaseError).toBe(true);
    expect(err instanceof ScannerTimeoutError).toBe(true);
  });

  it('exposes scannerId and timeoutMs', () => {
    const err = new ScannerTimeoutError('my-scanner', 5000);
    expect(err.scannerId).toBe('my-scanner');
    expect(err.timeoutMs).toBe(5000);
  });

  it('message includes scannerId and timeout', () => {
    const err = new ScannerTimeoutError('my-scanner', 3000);
    expect(err.message).toContain('my-scanner');
    expect(err.message).toContain('3000');
  });

  it('is operational by default', () => {
    const err = new ScannerTimeoutError('my-scanner', 3000);
    expect(err.isOperational).toBe(true);
  });

  it('accepts a cause', () => {
    const cause = new Error('original');
    const err = new ScannerTimeoutError('my-scanner', 3000, { cause });
    expect(err.cause).toBe(cause);
  });
});

describe('FileSizeExceededError', () => {
  it('has the correct code', () => {
    const err = new FileSizeExceededError('/repo/big.txt', 10_000_000);
    expect(err.code).toBe(FILE_SIZE_EXCEEDED_ERROR_CODE);
    expect(err.code).toBe('FILE_SIZE_EXCEEDED');
  });

  it('extends BaseError', () => {
    const err = new FileSizeExceededError('/repo/big.txt', 10_000_000);
    expect(err instanceof BaseError).toBe(true);
    expect(err instanceof FileSizeExceededError).toBe(true);
  });

  it('exposes path, actualSize, maxSize', () => {
    const err = new FileSizeExceededError('/repo/big.txt', 10_000_000);
    expect(err.path).toBe('/repo/big.txt');
    expect(err.actualSize).toBe(10_000_000);
    expect(err.maxSize).toBe(MAX_SCANNER_FILE_SIZE_BYTES);
  });

  it('accepts a custom maxSize', () => {
    const err = new FileSizeExceededError('/repo/big.txt', 1000, 500);
    expect(err.maxSize).toBe(500);
  });

  it('message includes sizes and path', () => {
    const err = new FileSizeExceededError('/repo/big.txt', 10_000_000);
    expect(err.message).toContain('10000000');
    expect(err.message).toContain('/repo/big.txt');
  });

  it('is operational by default', () => {
    const err = new FileSizeExceededError('/repo/big.txt', 10_000_000);
    expect(err.isOperational).toBe(true);
  });

  it('accepts a cause', () => {
    const cause = new Error('original');
    const err = new FileSizeExceededError('/repo/big.txt', 10_000_000, undefined, { cause });
    expect(err.cause).toBe(cause);
  });

  it('MAX_SCANNER_FILE_SIZE_BYTES is 5MB', () => {
    expect(MAX_SCANNER_FILE_SIZE_BYTES).toBe(5 * 1024 * 1024);
  });
});

describe('ScannerError', () => {
  it('has the correct code', () => {
    const err = new ScannerError('my-scanner', 'something went wrong');
    expect(err.code).toBe(SCANNER_ERROR_CODE);
    expect(err.code).toBe('SCANNER_ERROR');
  });

  it('extends BaseError', () => {
    const err = new ScannerError('my-scanner', 'boom');
    expect(err instanceof BaseError).toBe(true);
    expect(err instanceof ScannerError).toBe(true);
  });

  it('exposes scannerId', () => {
    const err = new ScannerError('my-scanner', 'boom');
    expect(err.scannerId).toBe('my-scanner');
  });

  it('message includes scannerId and original message', () => {
    const err = new ScannerError('my-scanner', 'disk full');
    expect(err.message).toContain('my-scanner');
    expect(err.message).toContain('disk full');
  });

  it('is operational by default', () => {
    const err = new ScannerError('my-scanner', 'boom');
    expect(err.isOperational).toBe(true);
  });

  it('accepts a cause', () => {
    const cause = new Error('original');
    const err = new ScannerError('my-scanner', 'boom', { cause });
    expect(err.cause).toBe(cause);
  });
});
