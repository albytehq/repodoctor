/**
 * Configuration-specific error.
 *
 * Thrown by the config subsystem when:
 *   - a config file exists but cannot be parsed (malformed JSON / invalid JS),
 *   - a config file parses successfully but fails schema validation,
 *   - a `--config <path>` CLI flag points to a file that is not a recognized
 *     format.
 *
 * Architectural role: errors — may only import from utils.
 */

import { BaseError, type ErrorContext } from '@repodoctor/errors/BaseError';

/** Stable error code for {@link ConfigError}. */
export const CONFIG_ERROR_CODE: string = 'CONFIG_ERROR';

/**
 * Concrete error raised by the configuration subsystem.
 *
 * `isOperational` defaults to `true` because config failures are expected
 * user-facing problems, not programmer bugs.
 */
export class ConfigError extends BaseError {
  constructor(
    message: string,
    options: { context?: ErrorContext; cause?: unknown; isOperational?: boolean } = {},
  ) {
    super(message, CONFIG_ERROR_CODE, {
      context: options.context,
      isOperational: options.isOperational ?? true,
      cause: options.cause,
    });
  }
}
