/**
 * File-not-found error.
 *
 * Thrown by the infrastructure layer when an operation requires a file to
 * exist at a specific path, but no such file is present. The raw Node
 * `ENOENT` error is converted into this class so that the rest of the
 * codebase never has to deal with platform-specific errno strings.
 *
 * Architectural role: errors — may only import from utils.
 */

import { BaseError, type ErrorContext } from '@repodoctor/errors/BaseError';

/** Stable error code for {@link FileNotFoundError}. */
export const FILE_NOT_FOUND_ERROR_CODE: string = 'FILE_NOT_FOUND';

/**
 * Concrete error raised when a required file does not exist on disk.
 *
 * The original `path` is always attached to the `context` payload so that
 * downstream loggers can surface it without parsing the message string.
 */
export class FileNotFoundError extends BaseError {
  public readonly path: string;

  constructor(
    path: string,
    options: { context?: ErrorContext; cause?: unknown; isOperational?: boolean } = {},
  ) {
    const mergedContext: ErrorContext = {
      ...options.context,
      path,
    };
    super(`File not found: ${path}`, FILE_NOT_FOUND_ERROR_CODE, {
      context: mergedContext,
      isOperational: options.isOperational ?? true,
      cause: options.cause,
    });
    this.path = path;
  }
}
