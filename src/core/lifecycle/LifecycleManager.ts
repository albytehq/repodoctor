/**
 * Lifecycle Manager.
 *
 * Manages pre/post hooks for lifecycle phases. In v0.0.1, the only phases
 * are the bootstrap phases; future versions will add organ-specific phases
 * (e.g. `scan.dependencies.pre`). Hooks are simple `() => void | Promise<void>`
 * callbacks registered against a named phase.
 *
 * Architectural role: core (lifecycle). May only import from core/errors/utils.
 * The manager depends on the event bus (also core) to emit lifecycle events
 * when phases transition.
 */

import type { IEventBus } from '@repodoctor/core/events/IEventBus';
import type { EventName } from '@repodoctor/core/events/EventTypes';

/**
 * Strict union of lifecycle phases recognized by v0.0.1.
 *
 * Adding a new phase requires extending this union and updating the
 * `phaseToStartEvent` / `phaseToCompleteEvent` maps below.
 */
export type LifecyclePhase =
  /**
   * Before the {@link ExecutionContext} is constructed. Pre-hooks run with
   * no context available; post-hooks run after the context is built.
   */
  | 'context.init'

  /**
   * Around the {@link ConfigLoader} invocation. Pre-hooks run before the
   * loader reads any file; post-hooks run after a validated config is
   * available.
   */
  | 'config.load'

  /**
   * Around the final bootstrap step (emit `BootstrapComplete`, log success).
   */
  | 'bootstrap.finalize';

/**
 * Hook callback signature. May be sync or async; the manager awaits async
 * hooks sequentially in registration order.
 */
export type LifecycleHook = () => void | Promise<void>;

/**
 * Internal map from phase to the event emitted when the phase starts.
 * `undefined` means no event is emitted on phase start.
 */
const PHASE_START_EVENTS: Readonly<Record<LifecyclePhase, EventName | undefined>> = {
  'context.init': undefined,
  'config.load': undefined,
  'bootstrap.finalize': 'BootstrapComplete',
};

/**
 * Internal map from phase to the event emitted when the phase completes.
 */
const PHASE_COMPLETE_EVENTS: Readonly<Record<LifecyclePhase, EventName | undefined>> = {
  'context.init': 'ContextInitialized',
  'config.load': 'ConfigLoaded',
  'bootstrap.finalize': undefined,
};

/**
 * Manages pre/post hooks for lifecycle phases.
 *
 * The manager is intentionally minimal: it stores hooks, runs them in
 * order, and emits lifecycle events at phase boundaries. It does NOT
 * implement any actual business logic — that is the responsibility of
 * future organ doctors.
 */
export class LifecycleManager {
  private readonly preHooks: Map<LifecyclePhase, LifecycleHook[]> = new Map();
  private readonly postHooks: Map<LifecyclePhase, LifecycleHook[]> = new Map();

  constructor(private readonly eventBus: IEventBus) {}

  /**
   * Register a pre-hook for a phase. Pre-hooks run sequentially in
   * registration order before the phase body.
   */
  public onPre(phase: LifecyclePhase, hook: LifecycleHook): () => void {
    return this.addHook(this.preHooks, phase, hook);
  }

  /**
   * Register a post-hook for a phase. Post-hooks run sequentially in
   * registration order after the phase body.
   */
  public onPost(phase: LifecyclePhase, hook: LifecycleHook): () => void {
    return this.addHook(this.postHooks, phase, hook);
  }

  /**
   * Run all pre-hooks for `phase`, sequentially, awaiting each in turn.
   *
   * Pre-hook failures propagate to the caller — the bootstrap flow treats
   * them as operational errors and routes them through the ErrorHandler.
   */
  public async runPre(phase: LifecyclePhase): Promise<void> {
    await this.runHooks(this.preHooks.get(phase));
  }

  /**
   * Run all post-hooks for `phase`, sequentially, then emit the phase's
   * completion event (if any) on the event bus.
   *
   * Post-hook failures propagate to the caller.
   */
  public async runPost(phase: LifecyclePhase, payload?: unknown): Promise<void> {
    await this.runHooks(this.postHooks.get(phase));
    const completeEvent = PHASE_COMPLETE_EVENTS[phase];
    if (completeEvent !== undefined) {
      // We intentionally cast the payload to the event's expected payload
      // type. The caller (bootstrap) is responsible for passing the correct
      // shape; the type system cannot enforce this dynamically.
      this.eventBus.emit(completeEvent, payload as never);
    }
  }

  /**
   * Emit the phase's start event (if any). Called by the bootstrap flow
   * immediately before running pre-hooks.
   */
  public emitStart(phase: LifecyclePhase, payload?: unknown): void {
    const startEvent = PHASE_START_EVENTS[phase];
    if (startEvent !== undefined) {
      this.eventBus.emit(startEvent, payload as never);
    }
  }

  private addHook(
    store: Map<LifecyclePhase, LifecycleHook[]>,
    phase: LifecyclePhase,
    hook: LifecycleHook,
  ): () => void {
    let list = store.get(phase);
    if (list === undefined) {
      list = [];
      store.set(phase, list);
    }
    list.push(hook);
    return () => {
      const current = store.get(phase);
      if (current === undefined) {
        return;
      }
      const idx = current.indexOf(hook);
      if (idx >= 0) {
        current.splice(idx, 1);
      }
    };
  }

  private async runHooks(hooks: LifecycleHook[] | undefined): Promise<void> {
    if (hooks === undefined) {
      return;
    }
    const snapshot = hooks.slice();
    for (const hook of snapshot) {
      await hook();
    }
  }

  /**
   * Removes all pre- and post-hooks for all phases. Intended for test
   * isolation — production code should not call this.
   */
  public clear(): void {
    this.preHooks.clear();
    this.postHooks.clear();
  }
}
