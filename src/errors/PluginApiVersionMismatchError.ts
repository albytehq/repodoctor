/**
 * Plugin API version mismatch error.
 *
 * Raised when a plugin's `apiVersion` does not match the expected
 * {@link PLUGIN_API_VERSION}. The plugin is skipped (not loaded).
 *
 * Architectural role: errors — may only import from utils.
 */

import { BaseError, type ErrorContext } from '@repodoctor/errors/BaseError';

/** Stable error code for {@link PluginApiVersionMismatchError}. */
export const PLUGIN_API_VERSION_MISMATCH_ERROR_CODE: string = 'PLUGIN_API_VERSION_MISMATCH';

/**
 * Concrete error raised when a plugin's API version does not match.
 *
 * `isOperational` defaults to `true`.
 */
export class PluginApiVersionMismatchError extends BaseError {
  /** The plugin name. */
  public readonly pluginName: string;
  /** The expected API version. */
  public readonly expectedVersion: number;
  /** The actual API version from the plugin. */
  public readonly actualVersion: number;

  constructor(
    pluginName: string,
    expectedVersion: number,
    actualVersion: number,
    options: { context?: ErrorContext; cause?: unknown } = {},
  ) {
    const mergedContext: ErrorContext = {
      ...options.context,
      pluginName,
      expectedVersion,
      actualVersion,
    };
    super(
      `Plugin '${pluginName}' has apiVersion ${actualVersion}, expected ${expectedVersion}`,
      PLUGIN_API_VERSION_MISMATCH_ERROR_CODE,
      {
        context: mergedContext,
        isOperational: true,
        cause: options.cause,
      },
    );
    this.pluginName = pluginName;
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}
