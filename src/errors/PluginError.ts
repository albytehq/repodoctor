/**
 * Plugin error.
 *
 * Raised when a plugin fails during loading or validation (not during
 * execution — execution errors are caught by {@link PluginWrapper}).
 *
 * Architectural role: errors — may only import from utils.
 */

import { BaseError, type ErrorContext } from '@repodoctor/errors/BaseError';

/** Stable error code for {@link PluginError}. */
export const PLUGIN_ERROR_CODE: string = 'PLUGIN_ERROR';

/**
 * Concrete error raised when a plugin fails to load or validate.
 *
 * `isOperational` defaults to `true` — a plugin failure is an expected
 * operational issue, not a programmer bug in the core.
 */
export class PluginError extends BaseError {
  /** The name or path of the plugin that failed. */
  public readonly pluginName: string;

  constructor(
    pluginName: string,
    message: string,
    options: { context?: ErrorContext; cause?: unknown; isOperational?: boolean } = {},
  ) {
    const mergedContext: ErrorContext = {
      ...options.context,
      pluginName,
    };
    super(`Plugin '${pluginName}': ${message}`, PLUGIN_ERROR_CODE, {
      context: mergedContext,
      isOperational: options.isOperational ?? true,
      cause: options.cause,
    });
    this.pluginName = pluginName;
  }
}
