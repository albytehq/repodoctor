/**
 * Permission-denied error.
 *
 * Thrown by the infrastructure layer when an operation requires
 * filesystem access that the current process does not have (EACCES,
 * EPERM). The global {@link ErrorHandler} catches this and exits with
 * code 1.
 *
 * Architectural role: errors — may only import from utils.
 */

import { BaseError, type ErrorContext } from '@repodoctor/errors/BaseError';

/** Stable error code for {@link PermissionError}. */
export const PERMISSION_DENIED_ERROR_CODE: string = 'PERMISSION_DENIED';

/**
 * Concrete error raised when a filesystem operation is denied by the
 * operating system.
 *
 * `isOperational` defaults to `true` because a permission failure is an
 * expected user-facing problem (the user needs to fix their filesystem
 * permissions), not a programmer bug.
 */
export class PermissionError extends BaseError {
  /** The path that could not be accessed. */
  public readonly path: string;

  constructor(
    path: string,
    options: { context?: ErrorContext; cause?: unknown; isOperational?: boolean } = {},
  ) {
    const mergedContext: ErrorContext = {
      ...options.context,
      path,
    };
    super(`Permission denied: ${path}`, PERMISSION_DENIED_ERROR_CODE, {
      context: mergedContext,
      isOperational: options.isOperational ?? true,
      cause: options.cause,
    });
    this.path = path;
  }
}
