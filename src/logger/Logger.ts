/**
 * Logger implementation.
 *
 * Implements {@link ILogger}. Takes a {@link ConsoleTransport} and a
 * `logLevel` filter. Before writing, the logger checks the message's
 * priority against the current threshold; messages below the threshold
 * are discarded without reaching the transport.
 *
 * Architectural role: logger — may import from core, utils.
 */

import type { ILogger, LogContext } from '@repodoctor/core/ILogger';
import type { ConsoleTransport, LogLevel, StreamName } from '@repodoctor/logger/ConsoleTransport';

/**
 * Numeric priorities for log levels. Higher numbers mean more verbose.
 * `silent` (priority 0) suppresses everything; `debug` (priority 4) is
 * the most verbose.
 *
 * Stored as `Readonly<Record>` so the priority lookup is type-safe and
 * exhaustively checked.
 */
export const LOG_LEVEL_PRIORITIES: Readonly<Record<LogLevel | 'silent', number>> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

/**
 * Map a {@link RepoDoctorConfig.logLevel} string to a numeric priority.
 * Throws if the input is not a recognized log level.
 */
export function priorityForLevel(level: LogLevel | 'silent'): number {
  const priority = LOG_LEVEL_PRIORITIES[level];
  if (priority === undefined) {
    // Should be unreachable because the type system guarantees `level` is
    // a known key. Defensive only.
    throw new Error(`Unknown log level: ${level}`);
  }
  return priority;
}

/**
 * Format a log entry as a single line:
 *
 *   [YYYY-MM-DDTHH:mm:ssZ] [LEVEL] message {json: context}
 *
 * - Timestamp is always in UTC with a trailing `Z`.
 * - Context is serialized as compact JSON; `undefined` context produces no
 *   trailing JSON object.
 * - The JSON object is appended only when context is non-`undefined`.
 */
export function formatLogEntry(
  level: LogLevel,
  message: string,
  context: LogContext | undefined,
): string {
  const timestamp = formatTimestamp(new Date());
  const base = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  if (context === undefined) {
    return base;
  }
  const json = safeStringify(context);
  return `${base} ${json}`;
}

/**
 * Format a `Date` as an ISO-8601 UTC timestamp with second precision and
 * a trailing `Z`.
 *
 * Example: `2026-07-06T12:34:56Z`.
 */
function formatTimestamp(date: Date): string {
  const iso = date.toISOString();
  // `toISOString()` returns e.g. `2026-07-06T12:34:56.789Z`. We strip
  // the milliseconds to keep the format compact and stable.
  return iso.replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Serialize a log context object as compact JSON, never throwing.
 *
 * Circular references and non-serializable values are replaced with
 * placeholder strings so that a logging failure never propagates to the
 * caller.
 */
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ _serializeError: 'context was not JSON-serializable' });
  }
}

/**
 * Concrete implementation of {@link ILogger}.
 *
 * The logger is constructed once at CLI startup with the resolved log
 * level. Callers call `debug`/`info`/`warn`/`error` freely; the logger
 * applies the priority filter and delegates to the transport.
 */
export class Logger implements ILogger {
  private readonly currentPriority: number;
  private readonly transport: ConsoleTransport;

  constructor(
    logLevel: LogLevel | 'silent',
    transport: ConsoleTransport,
  ) {
    this.currentPriority = priorityForLevel(logLevel);
    this.transport = transport;
  }

  public debug(message: string, context?: LogContext): void {
    this.write('debug', message, context);
  }

  public info(message: string, context?: LogContext): void {
    this.write('info', message, context);
  }

  public warn(message: string, context?: LogContext): void {
    this.write('warn', message, context);
  }

  public error(message: string, context?: LogContext): void {
    this.write('error', message, context);
  }

  private write(level: LogLevel, message: string, context: LogContext | undefined): void {
    const messagePriority = LOG_LEVEL_PRIORITIES[level];
    if (messagePriority === undefined) {
      // Unreachable — `level` is a known key. Defensive only.
      return;
    }
    if (messagePriority > this.currentPriority) {
      return;
    }
    const stream: StreamName = level === 'warn' || level === 'error' ? 'stderr' : 'stdout';
    const formatted = formatLogEntry(level, message, context);
    this.transport.write(level, stream, formatted, context);
  }
}
