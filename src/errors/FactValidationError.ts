/**
 * Fact validation error.
 *
 * Thrown (internally, not propagated) when a {@link RawFact} fails
 * validation. The {@link FactCollector} logs these errors but does NOT
 * crash — invalid facts are simply discarded.
 *
 * Architectural role: errors — may only import from utils.
 */

import { BaseError, type ErrorContext } from '@repodoctor/errors/BaseError';

/** Stable error code for {@link FactValidationError}. */
export const FACT_VALIDATION_ERROR_CODE: string = 'FACT_VALIDATION';

/**
 * Concrete error raised when a raw fact fails validation.
 *
 * `isOperational` defaults to `true` — a malformed fact is an expected
 * operational issue (a scanner bug), not a fatal error.
 */
export class FactValidationError extends BaseError {
  /** The name of the field that failed validation. */
  public readonly field: string;
  /** A human-readable reason for the failure. */
  public readonly reason: string;

  constructor(
    field: string,
    reason: string,
    options: { context?: ErrorContext; cause?: unknown; isOperational?: boolean } = {},
  ) {
    const mergedContext: ErrorContext = {
      ...options.context,
      field,
      reason,
    };
    super(`Fact validation failed: ${field} — ${reason}`, FACT_VALIDATION_ERROR_CODE, {
      context: mergedContext,
      isOperational: options.isOperational ?? true,
      cause: options.cause,
    });
    this.field = field;
    this.reason = reason;
  }
}
