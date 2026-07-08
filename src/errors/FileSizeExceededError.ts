/**
 * File-size-exceeded error.
 *
 * Thrown by {@link ScannerFileSystem} when a scanner attempts to read a
 * file larger than the 5MB limit. Prevents memory exhaustion from
 * pathological files.
 *
 * Architectural role: errors — may only import from utils.
 */

import { BaseError, type ErrorContext } from '@repodoctor/errors/BaseError';

/** Stable error code for {@link FileSizeExceededError}. */
export const FILE_SIZE_EXCEEDED_ERROR_CODE: string = 'FILE_SIZE_EXCEEDED';

/** The maximum file size (in bytes) that a scanner may read. */
export const MAX_SCANNER_FILE_SIZE_BYTES: number = 5 * 1024 * 1024; // 5 MB

/**
 * Concrete error raised when a file read exceeds the size limit.
 *
 * `isOperational` defaults to `true` — a large file is an expected
 * operational issue, not a programmer bug.
 */
export class FileSizeExceededError extends BaseError {
  /** The path that was too large. */
  public readonly path: string;
  /** The actual file size in bytes. */
  public readonly actualSize: number;
  /** The maximum allowed size in bytes. */
  public readonly maxSize: number;

  constructor(
    path: string,
    actualSize: number,
    maxSize: number = MAX_SCANNER_FILE_SIZE_BYTES,
    options: { context?: ErrorContext; cause?: unknown; isOperational?: boolean } = {},
  ) {
    const mergedContext: ErrorContext = {
      ...options.context,
      path,
      actualSize,
      maxSize,
    };
    super(
      `File size ${actualSize} bytes exceeds limit ${maxSize} bytes: ${path}`,
      FILE_SIZE_EXCEEDED_ERROR_CODE,
      {
        context: mergedContext,
        isOperational: options.isOperational ?? true,
        cause: options.cause,
      },
    );
    this.path = path;
    this.actualSize = actualSize;
    this.maxSize = maxSize;
  }
}
