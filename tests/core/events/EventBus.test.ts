/**
 * Unit tests for the EventBus.
 *
 * Coverage:
 *   - emit / on registration and dispatch
 *   - handler isolation (one throwing handler does not crash the bus)
 *   - listener count and clear
 *   - disposer function returned by `on`
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '@repodoctor/core/events/EventBus';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('delivers payloads to registered handlers in registration order', () => {
    const calls: string[] = [];
    bus.on('ContextInitialized', () => {
      calls.push('first');
    });
    bus.on('ContextInitialized', () => {
      calls.push('second');
    });
    bus.emit('ContextInitialized', { workspace: { cwd: '/x', isCI: false, isInteractive: true } });
    expect(calls).toEqual(['first', 'second']);
  });

  it('does not deliver to handlers registered for other events', () => {
    let called = false;
    bus.on('ConfigLoaded', () => {
      called = true;
    });
    bus.emit('BootstrapComplete', undefined);
    expect(called).toBe(false);
  });

  it('returns a disposer that removes the handler', () => {
    let calls = 0;
    const dispose = bus.on('ContextInitialized', () => {
      calls += 1;
    });
    bus.emit('ContextInitialized', { workspace: { cwd: '/x', isCI: false, isInteractive: true } });
    expect(calls).toBe(1);
    dispose();
    bus.emit('ContextInitialized', { workspace: { cwd: '/x', isCI: false, isInteractive: true } });
    expect(calls).toBe(1);
  });

  it('isolates handler failures — one throwing handler does not crash the bus', () => {
    const calls: string[] = [];
    bus.on('ContextInitialized', () => {
      calls.push('before');
    });
    bus.on('ContextInitialized', () => {
      calls.push('throwing');
      throw new Error('handler failure');
    });
    bus.on('ContextInitialized', () => {
      calls.push('after');
    });
    // No error reporter — failures should be silently swallowed.
    expect(() =>
      bus.emit('ContextInitialized', {
        workspace: { cwd: '/x', isCI: false, isInteractive: true },
      }),
    ).not.toThrow();
    expect(calls).toEqual(['before', 'throwing', 'after']);
  });

  it('routes handler failures to the injected errorReporter', () => {
    const reports: Array<{ event: string; message: string }> = [];
    const reporterBus = new EventBus({
      errorReporter: (eventName, error) => {
        reports.push({
          event: eventName,
          message: error instanceof Error ? error.message : String(error),
        });
      },
    });
    reporterBus.on('ContextInitialized', () => {
      throw new Error('boom');
    });
    reporterBus.emit('ContextInitialized', {
      workspace: { cwd: '/x', isCI: false, isInteractive: true },
    });
    expect(reports).toHaveLength(1);
    expect(reports[0]?.event).toBe('ContextInitialized');
    expect(reports[0]?.message).toBe('boom');
  });

  it('survives a handler that registers a new handler mid-dispatch', () => {
    const calls: string[] = [];
    bus.on('ContextInitialized', () => {
      calls.push('first');
      bus.on('ContextInitialized', () => {
        calls.push('late');
      });
    });
    bus.emit('ContextInitialized', { workspace: { cwd: '/x', isCI: false, isInteractive: true } });
    // Late handler was registered AFTER the snapshot was taken, so it
    // should not be invoked during this emit.
    expect(calls).toEqual(['first']);
    // But it should be invoked on the next emit.
    bus.emit('ContextInitialized', { workspace: { cwd: '/x', isCI: false, isInteractive: true } });
    expect(calls).toEqual(['first', 'first', 'late']);
  });

  it('listenerCount reports the correct number', () => {
    expect(bus.listenerCount('ContextInitialized')).toBe(0);
    bus.on('ContextInitialized', () => {});
    bus.on('ContextInitialized', () => {});
    expect(bus.listenerCount('ContextInitialized')).toBe(2);
  });

  it('clear removes all handlers for all events', () => {
    bus.on('ContextInitialized', () => {});
    bus.on('ConfigLoaded', () => {});
    bus.clear();
    expect(bus.listenerCount('ContextInitialized')).toBe(0);
    expect(bus.listenerCount('ConfigLoaded')).toBe(0);
  });

  it('swallows errors thrown by the errorReporter itself', () => {
    const reporterBus = new EventBus({
      errorReporter: () => {
        throw new Error('reporter itself failed');
      },
    });
    reporterBus.on('ContextInitialized', () => {
      throw new Error('handler failure');
    });
    // The reporter-throws branch must NOT propagate.
    expect(() =>
      reporterBus.emit('ContextInitialized', {
        workspace: { cwd: '/x', isCI: false, isInteractive: true },
      }),
    ).not.toThrow();
  });

  it('does not invoke handlers added mid-emit (snapshot semantics)', () => {
    // Already covered above; this test name is for explicit documentation.
    const calls: string[] = [];
    bus.on('ContextInitialized', () => {
      calls.push('only');
    });
    bus.emit('ContextInitialized', { workspace: { cwd: '/x', isCI: false, isInteractive: true } });
    expect(calls).toEqual(['only']);
  });

  it('emit on an event with no handlers is a no-op', () => {
    expect(() =>
      bus.emit('BootstrapComplete', undefined),
    ).not.toThrow();
  });

  it('disposer is idempotent — calling it twice is safe', () => {
    let calls = 0;
    const dispose = bus.on('ContextInitialized', () => {
      calls += 1;
    });
    dispose();
    dispose(); // second call should be a no-op, not an error
    bus.emit('ContextInitialized', { workspace: { cwd: '/x', isCI: false, isInteractive: true } });
    expect(calls).toBe(0);
  });

  it('disposer is a no-op when the handler list has already been cleared', () => {
    // Exercises the `current === undefined` branch in the disposer.
    let calls = 0;
    const dispose = bus.on('ContextInitialized', () => {
      calls += 1;
    });
    bus.clear();
    // After clear, the handlers Map is empty; the disposer should
    // safely return without throwing.
    expect(() => dispose()).not.toThrow();
    bus.emit('ContextInitialized', { workspace: { cwd: '/x', isCI: false, isInteractive: true } });
    expect(calls).toBe(0);
  });
});
