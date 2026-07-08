/**
 * Global error boundary.
 *
 * The {@link ErrorHandler} is the last line of defense: any error that
 * reaches `process.on('uncaughtException')` or `process.on('unhandledRejection')`
 * is routed here. It formats the error via the injected logger and terminates
 * the process with a deterministic exit code.
 *
 * Exit code policy:
 *   - `0` — never used here (success is the caller's responsibility).
 *   - `1` — operational RepoDoctor error (expected user-facing failure).
 *   - `2` — unexpected bug or CLI usage error.
 *
 * Architectural role: errors — may only import from utils. To respect that
 * boundary, the logger dependency is declared here as a local structural
 * interface ({@link ErrorBoundaryLogger}); the concrete `Logger` from
 * `@repodoctor/logger` satisfies it via TypeScript's structural typing, so
 * the cli layer can pass a real `Logger` instance in directly.
 */

import { BaseError } from '@repodoctor/errors/BaseError';
import { CLIArgumentError } from '@repodoctor/errors/CLIArgumentError';

/**
 * Local structural logger interface for the error boundary.
 *
 * Defined here (rather than imported from `core`) so that the `errors`
 * layer remains a strict leaf in the dependency graph. The concrete
 * `Logger` class implements this shape, so callers can pass a real logger
 * instance without any adapter.
 */
export interface ErrorBoundaryLogger {
  debug(message: string, context?: object): void;
  info(message: string, context?: object): void;
  warn(message: string, context?: object): void;
  error(message: string, context?: object): void;
}

/**
 * Exit codes used by the {@link ErrorHandler}.
 *
 * These are centralized here so that tests can assert against symbolic
 * names rather than magic numbers.
 */
export const EXIT_CODES = {
  /** Operational, expected user-facing failure. */
  OPERATIONAL: 1,
  /** Unexpected bug or CLI usage error. */
  UNEXPECTED: 2,
} as const;

/**
 * Format an unknown caught value into a loggable message and structured
 * context.
 *
 * - {@link BaseError}: serialized via its `toJSON()` method.
 * - `Error` (non-BaseError): always treated as an unexpected bug; we
 *   include the stack trace in the structured context.
 * - any other value: coerced to `String(value)`.
 */
function formatError(error: unknown): {
  message: string;
  context: Record<string, unknown>;
  isBaseError: boolean;
  isCLIArgumentError: boolean;
  isOperational: boolean;
  stack: string | undefined;
} {
  if (error instanceof BaseError) {
    return {
      message: error.message,
      context: error.toJSON(),
      isBaseError: true,
      isCLIArgumentError: error instanceof CLIArgumentError,
      isOperational: error.isOperational,
      stack: error.stack,
    };
  }
  if (error instanceof Error) {
    return {
      message: error.message,
      context: { name: error.name, stack: error.stack },
      isBaseError: false,
      isCLIArgumentError: false,
      isOperational: false,
      stack: error.stack,
    };
  }
  const coerced = String(error);
  return {
    message: coerced,
    context: { kind: typeof error, value: coerced },
    isBaseError: false,
    isCLIArgumentError: false,
    isOperational: false,
    stack: undefined,
  };
}

/**
 * Global error boundary.
 *
 * Constructed once at CLI startup with a logger; the {@link CliBootstrap}
 * wires its `handle` method into `process.on('uncaughtException')` and
 * `process.on('unhandledRejection')`.
 */
export class ErrorHandler {
  /**
   * Optional callback invoked after the error has been logged but before
   * `process.exit` is called. Used by tests to assert exit codes without
   * killing the test runner.
   *
   * In production this is `undefined` and the handler calls `process.exit`
   * directly.
   */
  private readonly exitHook: ((code: number) => void) | undefined;

  constructor(
    private readonly logger: ErrorBoundaryLogger,
    options: { exitHook?: (code: number) => void } = {},
  ) {
    this.exitHook = options.exitHook;
  }

  /**
   * Handle a single error and terminate the process.
   *
   * Decision tree:
   *   1. {@link CLIArgumentError} → log at `warn`, exit code 2.
   *   2. Any other operational {@link BaseError} → log at `error`, exit code 1.
   *   3. Anything else (unexpected bug) → log at `error` with stack, exit code 2.
   *
   * This method never returns normally — it always terminates the process.
   */
  public handle(error: unknown): never {
    const info = formatError(error);

    if (info.isCLIArgumentError) {
      this.logger.warn(info.message, { code: 'CLI_ARG_ERROR', ...info.context });
    } else if (info.isBaseError && info.isOperational) {
      this.logger.error(info.message, info.context);
    } else {
      // Unexpected bug — include stack for diagnostics.
      this.logger.error(info.message, {
        ...info.context,
        stack: info.stack,
        severity: 'unexpected',
      });
    }

    let exitCode: number;
    if (info.isCLIArgumentError) {
      exitCode = EXIT_CODES.UNEXPECTED;
    } else if (info.isBaseError && info.isOperational) {
      exitCode = EXIT_CODES.OPERATIONAL;
    } else {
      exitCode = EXIT_CODES.UNEXPECTED;
    }

    if (this.exitHook !== undefined) {
      this.exitHook(exitCode);
      // Per the type signature `never`, fall through to process.exit to satisfy TS.
    }
    process.exit(exitCode);
  }

  /**
   * Convenience wrapper for `process.on('uncaughtException', ...)`.
   */
  public handleUncaughtException = (error: Error): void => {
    this.handle(error);
  };

  /**
   * Convenience wrapper for `process.on('unhandledRejection', ...)`.
   */
  public handleUnhandledRejection = (reason: unknown): void => {
    this.handle(reason);
  };
}
