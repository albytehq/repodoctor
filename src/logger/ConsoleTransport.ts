/**
 * Console transport for the logger.
 *
 * This is the ONLY module in the codebase permitted to touch the `console`
 * object (enforced via eslint override). Every other module routes its
 * output through {@link Logger}, which delegates to this transport.
 *
 * Architectural role: logger — may import from core, utils.
 */

import type { LogContext } from '@repodoctor/core/ILogger';

/**
 * The four stream choices a transport can target.
 *
 * - `stdout` — used for `debug` and `info` messages.
 * - `stderr` — used for `warn` and `error` messages.
 */
export type StreamName = 'stdout' | 'stderr';

/**
 * Subset of the `Console` interface that the transport uses. Defining it
 * here lets tests inject a mock console without depending on the global
 * `Console` type.
 */
export interface ConsoleLike {
  log(message: string): void;
  error(message: string): void;
  warn(message: string): void;
  info(message: string): void;
}

/**
 * Abstract transport contract. Future transports (file, network) implement
 * this interface so that the logger can swap them in without touching
 * call sites.
 */
export interface LogTransport {
  write(level: LogLevel, stream: StreamName, formatted: string, context: LogContext | undefined): void;
}

/**
 * Log levels recognized by the transport. The numeric priority is owned
 * by the {@link Logger}; the transport only needs the level name.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Default console transport.
 *
 * Writes formatted strings to `process.stdout` (for debug/info) and
 * `process.stderr` (for warn/error). The transport is stateless — each
 * `write` call is independent.
 *
 * The transport accepts an optional `consoleLike` injection so that tests
 * can capture output without redirecting the real process streams.
 */
export class ConsoleTransport implements LogTransport {
  private readonly consoleLike: ConsoleLike;

  constructor(options: { consoleLike?: ConsoleLike } = {}) {
    this.consoleLike = options.consoleLike ?? this.defaultConsole();
  }

  public write(
    _level: LogLevel,
    stream: StreamName,
    formatted: string,
    _context: LogContext | undefined,
  ): void {
    if (stream === 'stdout') {
      this.consoleLike.log(formatted);
    } else {
      this.consoleLike.error(formatted);
    }
  }

  private defaultConsole(): ConsoleLike {
    // We bind explicitly to avoid `this`-loss when the destructure is
    // invoked without a receiver.
    return {
      log: (msg: string) => console.log(msg),
      error: (msg: string) => console.error(msg),
      warn: (msg: string) => console.warn(msg),
      info: (msg: string) => console.info(msg),
    };
  }
}
