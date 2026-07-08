/**
 * Unit tests for the Logger.
 *
 * Coverage:
 *   - Priority filtering (silent/error/warn/info/debug).
 *   - Output stream selection (stdout vs stderr).
 *   - Format: [timestamp] [LEVEL] message {json}.
 *   - Context serialization.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Logger, formatLogEntry, LOG_LEVEL_PRIORITIES, priorityForLevel } from '@repodoctor/logger/Logger';
import { ConsoleTransport } from '@repodoctor/logger/ConsoleTransport';
import { CapturingConsole } from '../helpers';

describe('Logger — priority filtering', () => {
  let console: CapturingConsole;
  let transport: ConsoleTransport;

  beforeEach(() => {
    console = new CapturingConsole();
    transport = new ConsoleTransport({ consoleLike: console });
  });

  it('silent level discards all messages', () => {
    const logger = new Logger('silent', transport);
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');
    expect(console.stdout).toHaveLength(0);
    expect(console.stderr).toHaveLength(0);
  });

  it('error level emits only error', () => {
    const logger = new Logger('error', transport);
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');
    expect(console.stderr).toHaveLength(1);
    expect(console.stderr[0]).toContain('[ERROR] e');
    expect(console.stdout).toHaveLength(0);
  });

  it('warn level emits warn and error', () => {
    const logger = new Logger('warn', transport);
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');
    expect(console.stderr).toHaveLength(2);
    expect(console.stderr[0]).toContain('[WARN] w');
    expect(console.stderr[1]).toContain('[ERROR] e');
    expect(console.stdout).toHaveLength(0);
  });

  it('info level emits info, warn, error', () => {
    const logger = new Logger('info', transport);
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');
    expect(console.stdout).toHaveLength(1);
    expect(console.stderr).toHaveLength(2);
    expect(console.stdout[0]).toContain('[INFO] i');
  });

  it('debug level emits all four', () => {
    const logger = new Logger('debug', transport);
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');
    expect(console.stdout).toHaveLength(2);
    expect(console.stderr).toHaveLength(2);
  });
});

describe('Logger — stream routing', () => {
  it('writes debug and info to stdout', () => {
    const console = new CapturingConsole();
    const transport = new ConsoleTransport({ consoleLike: console });
    const logger = new Logger('debug', transport);
    logger.debug('a debug msg');
    logger.info('an info msg');
    expect(console.stdout.map((s) => s.includes('a debug msg'))).toContain(true);
    expect(console.stdout.map((s) => s.includes('an info msg'))).toContain(true);
    expect(console.stderr).toHaveLength(0);
  });

  it('writes warn and error to stderr', () => {
    const console = new CapturingConsole();
    const transport = new ConsoleTransport({ consoleLike: console });
    const logger = new Logger('debug', transport);
    logger.warn('a warn msg');
    logger.error('an error msg');
    expect(console.stderr.map((s) => s.includes('a warn msg'))).toContain(true);
    expect(console.stderr.map((s) => s.includes('an error msg'))).toContain(true);
    expect(console.stdout).toHaveLength(0);
  });
});

describe('Logger — format', () => {
  it('formats with timestamp, level, message, and JSON context', () => {
    const line = formatLogEntry('info', 'hello', { foo: 'bar', count: 3 });
    // Shape: [ISO timestamp] [LEVEL] message {json}
    expect(line).toMatch(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\] \[INFO\] hello \{.*\}$/);
    expect(line).toContain('"foo":"bar"');
    expect(line).toContain('"count":3');
  });

  it('omits the JSON object when context is undefined', () => {
    const line = formatLogEntry('warn', 'no context', undefined);
    expect(line).toMatch(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\] \[WARN\] no context$/);
  });

  it('handles non-serializable context without throwing', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const line = formatLogEntry('error', 'bad context', cyclic as never);
    expect(line).toContain('_serializeError');
  });
});

describe('Logger — priority map', () => {
  it('silent has priority 0', () => {
    expect(priorityForLevel('silent')).toBe(0);
    expect(LOG_LEVEL_PRIORITIES.silent).toBe(0);
  });

  it('debug has the highest priority', () => {
    expect(priorityForLevel('debug')).toBe(4);
    expect(priorityForLevel('debug')).toBeGreaterThan(priorityForLevel('info'));
  });

  it('priorities are strictly ordered', () => {
    expect(priorityForLevel('silent')).toBeLessThan(priorityForLevel('error'));
    expect(priorityForLevel('error')).toBeLessThan(priorityForLevel('warn'));
    expect(priorityForLevel('warn')).toBeLessThan(priorityForLevel('info'));
    expect(priorityForLevel('info')).toBeLessThan(priorityForLevel('debug'));
  });
});
