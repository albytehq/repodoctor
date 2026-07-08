/**
 * Logger interface.
 *
 * Decouples logging from the console. Future versions can implement this
 * interface to write to files, network sinks, or structured log shippers,
 * without touching any consumer.
 *
 * Architectural role: core (interface) — defined here (in `core/`) so that
 * every layer that is allowed to import `core` can depend on this contract.
 * The concrete implementor lives in `@repodoctor/logger/Logger`.
 *
 * Consumers: every module that needs to emit log output.
 * Implementor: `logger/Logger.ts`.
 */

/**
 * Structured log context payload.
 *
 * Keys are free-form; values are constrained to JSON-serializable primitives
 * to guarantee that any transport can serialize them safely.
 */
export type LogContext = Readonly<Record<string, string | number | boolean | null | undefined>>;

/**
 * Abstract logger contract.
 *
 * Implementations MUST be synchronous and non-throwing — a logger failure
 * must never propagate to the caller. The optional `context` argument is
 * always a structured payload, never a pre-formatted string.
 */
export interface ILogger {
  /**
   * Emit a debug-level message. Intended for high-volume diagnostic output
   * that is normally suppressed in production.
   */
  debug(message: string, context?: LogContext): void;

  /**
   * Emit an informational message. Used for normal operational milestones
   * (e.g. "config loaded", "bootstrap complete").
   */
  info(message: string, context?: LogContext): void;

  /**
   * Emit a warning. The process continues; the user should be alerted.
   */
  warn(message: string, context?: LogContext): void;

  /**
   * Emit an error. The process may or may not continue; the user must be
   * alerted. Stack traces should be carried in the `context` payload, not
   * in the message string.
   */
  error(message: string, context?: LogContext): void;
}
