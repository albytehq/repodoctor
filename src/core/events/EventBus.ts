/**
 * Internal pub/sub event bus.
 *
 * Implements {@link IEventBus}. Used by the lifecycle manager and future
 * plugins to react to bootstrap events without being directly coupled to
 * the bootstrap code.
 *
 * Architectural role: core (events) — may only import from errors/utils.
 * The bus therefore cannot depend on the logger; instead, callers may inject
 * an `errorReporter` callback to route handler failures to the logger.
 */

import type { IEventBus, EventHandler } from '@repodoctor/core/events/IEventBus';
import type { EventName, PayloadFor } from '@repodoctor/core/events/EventTypes';

/**
 * Function injected by callers (typically the CLI bootstrap) to receive
 * handler failures. If omitted, handler failures are silently swallowed
 * (this is appropriate for unit tests of the bus itself).
 */
export type HandlerErrorReporter = (eventName: EventName, error: unknown) => void;

/**
 * Concrete in-memory implementation of {@link IEventBus}.
 *
 * Backed by a `Map<EventName, Array<handler>>`. All operations are
 * synchronous. Handler isolation is enforced: a throwing handler is caught,
 * reported via the optional {@link HandlerErrorReporter}, and the bus then
 * continues with the next handler in the registration order.
 */
export class EventBus implements IEventBus {
  private readonly handlers: Map<EventName, Array<(payload: unknown) => void>> = new Map();
  private readonly errorReporter: HandlerErrorReporter | undefined;

  constructor(options: { errorReporter?: HandlerErrorReporter } = {}) {
    this.errorReporter = options.errorReporter;
  }

  public emit<E extends EventName>(eventName: E, payload: PayloadFor<E>): void {
    const list = this.handlers.get(eventName);
    if (list === undefined) {
      return;
    }
    // Iterate over a snapshot so handlers that register/unregister during
    // dispatch do not mutate the live list mid-iteration.
    const snapshot = list.slice();
    for (const handler of snapshot) {
      try {
        const result = handler(payload) as unknown;
        if (
          result !== null &&
          typeof result === 'object' &&
          typeof (result as Promise<unknown>).then === 'function'
        ) {
          (result as Promise<unknown>).catch((err: unknown) => {
            if (this.errorReporter !== undefined) {
              try {
                this.errorReporter(eventName, err);
              } catch {
                // The error reporter itself failed; swallow to preserve bus
                // integrity. We deliberately do not re-throw.
              }
            }
          });
        }
      } catch (error) {
        if (this.errorReporter !== undefined) {
          try {
            this.errorReporter(eventName, error);
          } catch {
            // The error reporter itself failed; swallow to preserve bus
            // integrity. We deliberately do not re-throw.
          }
        }
        // Continue with the next handler regardless.
      }
    }
  }

  public on<E extends EventName>(eventName: E, handler: EventHandler<E>): () => void {
    let list = this.handlers.get(eventName);
    if (list === undefined) {
      list = [];
      this.handlers.set(eventName, list);
    }
    // Store as `unknown` payload internally; type safety is enforced at the
    // public API boundary by the generic signature.
    const stored = handler as (payload: unknown) => void;
    list.push(stored);
    return () => {
      const current = this.handlers.get(eventName);
      if (current === undefined) {
        return;
      }
      const idx = current.indexOf(stored);
      if (idx >= 0) {
        current.splice(idx, 1);
      }
    };
  }

  /**
   * Returns the number of handlers currently registered for an event.
   * Intended for diagnostics and tests.
   */
  public listenerCount<E extends EventName>(eventName: E): number {
    const list = this.handlers.get(eventName);
    return list === undefined ? 0 : list.length;
  }

  /**
   * Removes all handlers for all events. Intended for test isolation.
   */
  public clear(): void {
    this.handlers.clear();
  }
}
