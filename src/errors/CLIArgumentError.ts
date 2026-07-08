/**
 * CLI argument parsing error.
 *
 * Thrown by {@link ArgumentParser} when the user supplies malformed or
 * unrecognized CLI arguments. The {@link ErrorHandler} treats this class
 * specially: it logs at `warn` level (not `error`), prints the help text,
 * and exits with code 2.
 *
 * Architectural role: errors — may only import from utils.
 */

import { BaseError, type ErrorContext } from '@repodoctor/errors/BaseError';

/** Stable error code for {@link CLIArgumentError}. */
export const CLI_ARG_ERROR_CODE: string = 'CLI_ARG_ERROR';

/**
 * Concrete error raised when CLI argument parsing fails.
 *
 * `isOperational` defaults to `true` because a bad CLI flag is a user input
 * problem, not a programmer bug.
 */
export class CLIArgumentError extends BaseError {
  constructor(
    message: string,
    options: { context?: ErrorContext; cause?: unknown; isOperational?: boolean } = {},
  ) {
    super(message, CLI_ARG_ERROR_CODE, {
      context: options.context,
      isOperational: options.isOperational ?? true,
      cause: options.cause,
    });
  }
}
