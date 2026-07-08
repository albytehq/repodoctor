/**
 * Scanner timeout error.
 *
 * Thrown by {@link ScannerExecutor} when a scanner exceeds the 3000ms
 * hard timeout. The executor catches this, emits `ScannerFailed`, and
 * continues with the remaining scanners.
 *
 * Architectural role: errors — may only import from utils.
 */

import { BaseError, type ErrorContext } from '@repodoctor/errors/BaseError';

/** Stable error code for {@link ScannerTimeoutError}. */
export const SCANNER_TIMEOUT_ERROR_CODE: string = 'SCANNER_TIMEOUT';

/**
 * Concrete error raised when a scanner exceeds its time budget.
 *
 * `isOperational` defaults to `true` — a slow scanner is an expected
 * operational issue, not a programmer bug.
 */
export class ScannerTimeoutError extends BaseError {
  /** The ID of the scanner that timed out. */
  public readonly scannerId: string;
  /** The timeout duration in milliseconds. */
  public readonly timeoutMs: number;

  constructor(
    scannerId: string,
    timeoutMs: number,
    options: { context?: ErrorContext; cause?: unknown; isOperational?: boolean } = {},
  ) {
    const mergedContext: ErrorContext = {
      ...options.context,
      scannerId,
      timeoutMs,
    };
    super(
      `Scanner '${scannerId}' timed out after ${timeoutMs}ms`,
      SCANNER_TIMEOUT_ERROR_CODE,
      {
        context: mergedContext,
        isOperational: options.isOperational ?? true,
        cause: options.cause,
      },
    );
    this.scannerId = scannerId;
    this.timeoutMs = timeoutMs;
  }
}
