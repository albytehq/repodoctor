/**
 * Analyzer timeout error.
 *
 * Thrown by {@link AnalyzerExecutor} when an analyzer exceeds the 2000ms
 * hard timeout. The executor catches this, emits `AnalyzerFailed`, and
 * continues with the remaining analyzers.
 *
 * Architectural role: errors — may only import from utils.
 */

import { BaseError, type ErrorContext } from '@repodoctor/errors/BaseError';

/** Stable error code for {@link AnalyzerTimeoutError}. */
export const ANALYZER_TIMEOUT_ERROR_CODE: string = 'ANALYZER_TIMEOUT';

/**
 * Concrete error raised when an analyzer exceeds its time budget.
 *
 * `isOperational` defaults to `true` — a slow analyzer is an expected
 * operational issue, not a programmer bug.
 */
export class AnalyzerTimeoutError extends BaseError {
  /** The ID of the analyzer that timed out. */
  public readonly analyzerId: string;
  /** The timeout duration in milliseconds. */
  public readonly timeoutMs: number;

  constructor(
    analyzerId: string,
    timeoutMs: number,
    options: { context?: ErrorContext; cause?: unknown; isOperational?: boolean } = {},
  ) {
    const mergedContext: ErrorContext = {
      ...options.context,
      analyzerId,
      timeoutMs,
    };
    super(
      `Analyzer '${analyzerId}' timed out after ${timeoutMs}ms`,
      ANALYZER_TIMEOUT_ERROR_CODE,
      {
        context: mergedContext,
        isOperational: options.isOperational ?? true,
        cause: options.cause,
      },
    );
    this.analyzerId = analyzerId;
    this.timeoutMs = timeoutMs;
  }
}
