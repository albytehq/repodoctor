/**
 * Finding validation error.
 *
 * Thrown (internally, not propagated) when a {@link RawFinding} fails
 * validation. The {@link FindingCollector} logs these errors but does
 * NOT crash — invalid findings are simply discarded.
 *
 * Architectural role: errors — may only import from utils.
 */

import { BaseError, type ErrorContext } from '@repodoctor/errors/BaseError';

/** Stable error code for {@link FindingValidationError}. */
export const FINDING_VALIDATION_ERROR_CODE: string = 'FINDING_VALIDATION';

/**
 * Concrete error raised when a raw finding fails validation.
 *
 * `isOperational` defaults to `true` — a malformed finding is an
 * expected operational issue (an analyzer bug), not a fatal error.
 */
export class FindingValidationError extends BaseError {
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
    super(`Finding validation failed: ${field} — ${reason}`, FINDING_VALIDATION_ERROR_CODE, {
      context: mergedContext,
      isOperational: options.isOperational ?? true,
      cause: options.cause,
    });
    this.field = field;
    this.reason = reason;
  }
}
