/**
 * Analyzer execution error.
 *
 * Thrown (or constructed) when an analyzer fails for a non-timeout
 * reason. The {@link AnalyzerExecutor} wraps non-BaseError exceptions
 * in this class before emitting `AnalyzerFailed`.
 *
 * Architectural role: errors — may only import from utils.
 */

import { BaseError, type ErrorContext } from '@repodoctor/errors/BaseError';

/** Stable error code for {@link AnalyzerError}. */
export const ANALYZER_ERROR_CODE: string = 'ANALYZER_ERROR';

/**
 * Concrete error raised when an analyzer fails during execution.
 *
 * `isOperational` defaults to `true` — an analyzer failure is an
 * expected operational issue, not a programmer bug in the engine.
 */
export class AnalyzerError extends BaseError {
  /** The ID of the analyzer that failed. */
  public readonly analyzerId: string;

  constructor(
    analyzerId: string,
    message: string,
    options: { context?: ErrorContext; cause?: unknown; isOperational?: boolean } = {},
  ) {
    const mergedContext: ErrorContext = {
      ...options.context,
      analyzerId,
    };
    super(`Analyzer '${analyzerId}' failed: ${message}`, ANALYZER_ERROR_CODE, {
      context: mergedContext,
      isOperational: options.isOperational ?? true,
      cause: options.cause,
    });
    this.analyzerId = analyzerId;
  }
}
