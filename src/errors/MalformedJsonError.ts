/**
 * Malformed-JSON error.
 *
 * Thrown by {@link PackageJsonParser} (and any future parser) when a file
 * that should contain valid JSON cannot be parsed. The global
 * {@link ErrorHandler} catches this, logs a clear error pointing to the
 * file, and exits with code 1.
 *
 * Architectural role: errors — may only import from utils.
 */

import { BaseError, type ErrorContext } from '@repodoctor/errors/BaseError';

/** Stable error code for {@link MalformedJsonError}. */
export const MALFORMED_JSON_ERROR_CODE: string = 'MALFORMED_JSON';

/**
 * Concrete error raised when a JSON file is syntactically invalid.
 *
 * `isOperational` defaults to `true` because a malformed `package.json`
 * is an expected user-facing problem, not a programmer bug.
 */
export class MalformedJsonError extends BaseError {
  /** The path of the file that failed to parse. */
  public readonly path: string;

  constructor(
    path: string,
    options: { context?: ErrorContext; cause?: unknown; isOperational?: boolean } = {},
  ) {
    const mergedContext: ErrorContext = {
      ...options.context,
      path,
    };
    super(`Malformed JSON in file: ${path}`, MALFORMED_JSON_ERROR_CODE, {
      context: mergedContext,
      isOperational: options.isOperational ?? true,
      cause: options.cause,
    });
    this.path = path;
  }
}
