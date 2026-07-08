/**
 * Unit tests for the ErrorHandler.
 *
 * Coverage:
 *   - Operational BaseError → exit code 1.
 *   - Unexpected error → exit code 2 with stack trace.
 *   - CLIArgumentError → exit code 2 with warn level.
 *   - exitHook injection (no real process.exit).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ErrorHandler, EXIT_CODES } from '@repodoctor/errors/ErrorHandler';
import { BaseError } from '@repodoctor/errors/BaseError';
import { ConfigError } from '@repodoctor/errors/ConfigError';
import { FileNotFoundError } from '@repodoctor/errors/FileNotFoundError';
import { CLIArgumentError } from '@repodoctor/errors/CLIArgumentError';
import { CapturingLogger } from '../helpers';

describe('ErrorHandler', () => {
  let logger: CapturingLogger;
  let exitCalls: number[];
  let handler: ErrorHandler;

  beforeEach(() => {
    logger = new CapturingLogger();
    exitCalls = [];
    handler = new ErrorHandler(logger, {
      exitHook: (code) => {
        exitCalls.push(code);
        // Throw to short-circuit the rest of `handle` so that
        // `process.exit` is not actually called.
        throw new Error(`exit(${code})`);
      },
    });
  });

  it('logs operational BaseError at error level and exits with code 1', () => {
    expect(() => handler.handle(new ConfigError('bad config'))).toThrow('exit(1)');
    expect(exitCalls).toEqual([EXIT_CODES.OPERATIONAL]);
    const errorCalls = logger.calls.filter((c) => c.level === 'error');
    expect(errorCalls).toHaveLength(1);
    expect(errorCalls[0]?.message).toBe('bad config');
  });

  it('logs FileNotFoundError as operational (exit 1)', () => {
    expect(() => handler.handle(new FileNotFoundError('/some/path'))).toThrow('exit(1)');
    expect(exitCalls).toEqual([EXIT_CODES.OPERATIONAL]);
    expect(logger.calls.some((c) => c.level === 'error' && c.message.includes('File not found'))).toBe(true);
  });

  it('logs CLIArgumentError at warn level and exits with code 2', () => {
    expect(() => handler.handle(new CLIArgumentError('bad flag'))).toThrow('exit(2)');
    expect(exitCalls).toEqual([EXIT_CODES.UNEXPECTED]);
    const warnCalls = logger.calls.filter((c) => c.level === 'warn');
    expect(warnCalls).toHaveLength(1);
    expect(warnCalls[0]?.message).toBe('bad flag');
  });

  it('logs unexpected Error at error level with stack and exits with code 2', () => {
    const err = new Error('unexpected bug');
    expect(() => handler.handle(err)).toThrow('exit(2)');
    expect(exitCalls).toEqual([EXIT_CODES.UNEXPECTED]);
    const errorCalls = logger.calls.filter((c) => c.level === 'error');
    expect(errorCalls).toHaveLength(1);
    expect(errorCalls[0]?.message).toBe('unexpected bug');
    // The context should carry the stack and severity=unexpected.
    const ctx = errorCalls[0]?.context as { stack?: string; severity?: string };
    expect(ctx.severity).toBe('unexpected');
    expect(typeof ctx.stack).toBe('string');
  });

  it('treats non-Error throwables as unexpected (exit 2)', () => {
    expect(() => handler.handle('just a string')).toThrow('exit(2)');
    expect(exitCalls).toEqual([EXIT_CODES.UNEXPECTED]);
    const errorCalls = logger.calls.filter((c) => c.level === 'error');
    expect(errorCalls).toHaveLength(1);
    expect(errorCalls[0]?.message).toBe('just a string');
  });

  it('treats non-operational BaseError as unexpected (exit 2)', () => {
    class ProgrammerBug extends BaseError {
      constructor() {
        super('invariant violated', 'PROGRAMMER_BUG', { isOperational: false });
      }
    }
    expect(() => handler.handle(new ProgrammerBug())).toThrow('exit(2)');
    expect(exitCalls).toEqual([EXIT_CODES.UNEXPECTED]);
  });

  it('handleUncaughtException routes through handle', () => {
    expect(() => handler.handleUncaughtException(new Error('uncaught'))).toThrow('exit(2)');
    expect(exitCalls).toEqual([EXIT_CODES.UNEXPECTED]);
  });

  it('handleUnhandledRejection routes through handle', () => {
    expect(() => handler.handleUnhandledRejection('string reason')).toThrow('exit(2)');
    expect(exitCalls).toEqual([EXIT_CODES.UNEXPECTED]);
  });

  it('falls through to process.exit when no exitHook is provided', () => {
    // We can't actually call process.exit in tests, so we mock it.
    const realExit = process.exit.bind(process);
    const exitSpy: number[] = [];
    process.exit = ((code?: number) => {
      exitSpy.push(code ?? 0);
      throw new Error(`process.exit(${code})`);
    }) as never;
    try {
      const noHookHandler = new ErrorHandler(logger);
      expect(() => noHookHandler.handle(new ConfigError('boom'))).toThrow('process.exit(1)');
      expect(exitSpy).toEqual([1]);
    } finally {
      process.exit = realExit;
    }
  });
});
