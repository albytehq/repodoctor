/**
 * Scanner execution error.
 *
 * Thrown (or constructed) when a scanner fails for a non-timeout reason.
 * The {@link ScannerExecutor} wraps non-BaseError exceptions in this
 * class before emitting `ScannerFailed`.
 *
 * Architectural role: errors — may only import from utils.
 */

import { BaseError, type ErrorContext } from '@repodoctor/errors/BaseError';

/** Stable error code for {@link ScannerError}. */
export const SCANNER_ERROR_CODE: string = 'SCANNER_ERROR';

/**
 * Concrete error raised when a scanner fails during execution.
 *
 * `isOperational` defaults to `true` — a scanner failure is an expected
 * operational issue (e.g., a file read error), not a programmer bug in
 * the engine itself.
 */
export class ScannerError extends BaseError {
  /** The ID of the scanner that failed. */
  public readonly scannerId: string;

  constructor(
    scannerId: string,
    message: string,
    options: { context?: ErrorContext; cause?: unknown; isOperational?: boolean } = {},
  ) {
    const mergedContext: ErrorContext = {
      ...options.context,
      scannerId,
    };
    super(`Scanner '${scannerId}' failed: ${message}`, SCANNER_ERROR_CODE, {
      context: mergedContext,
      isOperational: options.isOperational ?? true,
      cause: options.cause,
    });
    this.scannerId = scannerId;
  }
}
