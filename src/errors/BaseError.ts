/**
 * Abstract base class for all RepoDoctor errors.
 *
 * The hierarchy is the ONLY inheritance allowed in the codebase (per the
 * engineering standards). Every RepoDoctor error carries:
 *   - a stable `code` string (used for programmatic matching / telemetry),
 *   - an optional `context` payload (structured diagnostic data),
 *   - an `isOperational` flag (true for expected user-facing failures,
 *     false for unexpected bugs / programmer errors).
 *
 * Architectural role: errors — may only import from utils.
 */

/**
 * Structured context payload attached to errors. Keys are free-form, but
 * values are constrained to JSON-serializable primitives to guarantee that
 * loggers and error handlers can serialize them safely.
 */
export type ErrorContext = Readonly<Record<string, string | number | boolean | null | undefined>>;

/**
 * Abstract base error. Concrete subclasses MUST set a unique `code`.
 *
 * Subclasses must call `super(message)` and set `this.name` to their class
 * name to ensure correct `instanceof` checks after transpilation.
 */
export abstract class BaseError extends Error {
  /** Stable, machine-readable error code, e.g. `CONFIG_ERROR`. */
  public readonly code: string;

  /** Structured diagnostic context, or `undefined` if none was provided. */
  public readonly context: ErrorContext | undefined;

  /**
   * `true` when the error represents an expected, recoverable failure
   * (e.g. a missing config file, a malformed CLI flag). `false` when the
   * error represents a programmer mistake or invariant violation that
   * should crash loudly with a stack trace.
   */
  public readonly isOperational: boolean;

  constructor(
    message: string,
    code: string,
    options: {
      context?: ErrorContext;
      isOperational?: boolean;
      cause?: unknown;
    } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = this.constructor.name;
    this.code = code;
    this.context = options.context;
    this.isOperational = options.isOperational ?? true;

    // Restore prototype chain after Error subclassing — required for TS
    // targeting ES5/ES2015 subclasses to satisfy `instanceof` checks.
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Serializes the error into a plain object suitable for structured logging
   * or JSON transport. Does not include the stack trace.
   */
  public toJSON(): {
    name: string;
    message: string;
    code: string;
    context: ErrorContext | undefined;
    isOperational: boolean;
  } {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      isOperational: this.isOperational,
    };
  }
}
