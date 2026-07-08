/**
 * Unit tests for the LifecycleManager.
 *
 * Coverage:
 *   - onPre / runPre dispatch in registration order.
 *   - onPost / runPost dispatch + emits the phase's complete event.
 *   - emitStart emits the phase's start event.
 *   - Disposer functions remove hooks.
 *   - Async hooks are awaited sequentially.
 *   - Hooks for unrelated phases do not fire.
 */

import { describe, it, expect } from 'vitest';
import { LifecycleManager, type LifecyclePhase } from '@repodoctor/core/lifecycle/LifecycleManager';
import { EventBus } from '@repodoctor/core/events/EventBus';

describe('LifecycleManager', () => {
  it('runPre invokes pre-hooks in registration order', async () => {
    const bus = new EventBus();
    const manager = new LifecycleManager(bus);
    const calls: string[] = [];
    manager.onPre('context.init', () => {
      calls.push('first');
    });
    manager.onPre('context.init', () => {
      calls.push('second');
    });
    await manager.runPre('context.init');
    expect(calls).toEqual(['first', 'second']);
  });

  it('runPost invokes post-hooks and emits the phase complete event', async () => {
    const bus = new EventBus();
    const manager = new LifecycleManager(bus);
    const events: string[] = [];
    bus.on('ContextInitialized', () => events.push('ContextInitialized'));
    const calls: string[] = [];
    manager.onPost('context.init', () => {
      calls.push('post');
    });
    await manager.runPost('context.init', { workspace: { cwd: '/x', isCI: false, isInteractive: true } });
    expect(calls).toEqual(['post']);
    expect(events).toEqual(['ContextInitialized']);
  });

  it('runPost for a phase without a complete event does not emit', async () => {
    const bus = new EventBus();
    const manager = new LifecycleManager(bus);
    const events: string[] = [];
    bus.on('BootstrapComplete', () => events.push('BootstrapComplete'));
    await manager.runPost('bootstrap.finalize');
    // 'bootstrap.finalize' has no complete event (PHASE_COMPLETE_EVENTS is undefined),
    // so nothing should be emitted.
    expect(events).toEqual([]);
  });

  it('emitStart emits the start event for phases that have one', () => {
    const bus = new EventBus();
    const manager = new LifecycleManager(bus);
    const events: string[] = [];
    bus.on('BootstrapComplete', () => events.push('BootstrapComplete'));
    manager.emitStart('bootstrap.finalize');
    expect(events).toEqual(['BootstrapComplete']);
  });

  it('emitStart is a no-op for phases without a start event', () => {
    const bus = new EventBus();
    const manager = new LifecycleManager(bus);
    const events: string[] = [];
    bus.on('ContextInitialized', () => events.push('ContextInitialized'));
    manager.emitStart('context.init');
    expect(events).toEqual([]);
  });

  it('await async hooks sequentially', async () => {
    const bus = new EventBus();
    const manager = new LifecycleManager(bus);
    const calls: string[] = [];
    manager.onPre('config.load', async () => {
      await new Promise((r) => setTimeout(r, 10));
      calls.push('slow');
    });
    manager.onPre('config.load', () => {
      calls.push('fast');
    });
    await manager.runPre('config.load');
    expect(calls).toEqual(['slow', 'fast']);
  });

  it('hooks for one phase do not fire when running a different phase', async () => {
    const bus = new EventBus();
    const manager = new LifecycleManager(bus);
    let called = false;
    manager.onPre('context.init', () => {
      called = true;
    });
    await manager.runPre('config.load');
    expect(called).toBe(false);
  });

  it('disposer returned by onPre removes the hook', async () => {
    const bus = new EventBus();
    const manager = new LifecycleManager(bus);
    let calls = 0;
    const dispose = manager.onPre('context.init', () => {
      calls += 1;
    });
    await manager.runPre('context.init');
    expect(calls).toBe(1);
    dispose();
    await manager.runPre('context.init');
    expect(calls).toBe(1);
  });

  it('disposer returned by onPost removes the hook', async () => {
    const bus = new EventBus();
    const manager = new LifecycleManager(bus);
    let calls = 0;
    const dispose = manager.onPost('context.init', () => {
      calls += 1;
    });
    await manager.runPost('context.init', { workspace: { cwd: '/x', isCI: false, isInteractive: true } });
    expect(calls).toBe(1);
    dispose();
    await manager.runPost('context.init', { workspace: { cwd: '/x', isCI: false, isInteractive: true } });
    expect(calls).toBe(1);
  });

  it('runPre on a phase with no hooks is a no-op', async () => {
    const bus = new EventBus();
    const manager = new LifecycleManager(bus);
    await expect(manager.runPre('config.load')).resolves.toBeUndefined();
  });

  it('all three phases can be exercised end-to-end', async () => {
    const bus = new EventBus();
    const manager = new LifecycleManager(bus);
    const events: string[] = [];
    bus.on('ContextInitialized', () => events.push('ctx'));
    bus.on('ConfigLoaded', () => events.push('cfg'));
    bus.on('BootstrapComplete', () => events.push('done'));

    const phase: LifecyclePhase = 'context.init';
    await manager.runPost(phase, { workspace: { cwd: '/x', isCI: false, isInteractive: true } });
    await manager.runPost('config.load', { logLevel: 'info', strict: false, organsCount: 0 });
    manager.emitStart('bootstrap.finalize');

    expect(events).toEqual(['ctx', 'cfg', 'done']);
  });

  it('onPre and onPost can register multiple hooks and dispose them independently', async () => {
    const bus = new EventBus();
    const manager = new LifecycleManager(bus);
    const calls: string[] = [];
    const disposePre1 = manager.onPre('context.init', () => calls.push('pre1'));
    const disposePre2 = manager.onPre('context.init', () => calls.push('pre2'));
    const disposePost = manager.onPost('context.init', () => calls.push('post'));

    await manager.runPre('context.init');
    await manager.runPost('context.init', { workspace: { cwd: '/x', isCI: false, isInteractive: true } });
    expect(calls).toEqual(['pre1', 'pre2', 'post']);

    disposePre1();
    calls.length = 0;
    await manager.runPre('context.init');
    await manager.runPost('context.init', { workspace: { cwd: '/x', isCI: false, isInteractive: true } });
    expect(calls).toEqual(['pre2', 'post']);

    disposePre2();
    disposePost();
  });

  it('clear() removes all hooks; subsequent disposers are safe no-ops', async () => {
    // Exercises the `current === undefined` branch in the disposer.
    const bus = new EventBus();
    const manager = new LifecycleManager(bus);
    let calls = 0;
    const dispose = manager.onPre('context.init', () => {
      calls += 1;
    });
    manager.clear();
    // After clear, the hooks Map is empty; the disposer should safely
    // return without throwing.
    expect(() => dispose()).not.toThrow();
    await manager.runPre('context.init');
    expect(calls).toBe(0);
  });
});
