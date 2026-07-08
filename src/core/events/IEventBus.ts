/**
 * Event bus interface.
 *
 * Defines the public contract for the internal pub/sub system. Future
 * plugins will subscribe to lifecycle events via this interface.
 *
 * Architectural role: core (events) — defined here alongside its
 * implementor so that consumers can depend on the contract alone.
 *
 * Consumers: `LifecycleManager`, future plugins.
 * Implementor: `EventBus`.
 */

import type { EventName, PayloadFor } from '@repodoctor/core/events/EventTypes';

/**
 * A handler registered for a specific event. Receives the strongly-typed
 * payload.
 */
export type EventHandler<E extends EventName> = (payload: PayloadFor<E>) => void;

/**
 * Abstract event bus contract.
 *
 * Implementations MUST:
 *   - Dispatch handlers synchronously in registration order.
 *   - Isolate handler failures: a throwing handler must NOT crash the bus
 *     or prevent subsequent handlers from running.
 *   - Be safe to call from any context (no internal locking required).
 */
export interface IEventBus {
  /**
   * Emit an event, synchronously invoking every registered handler in
   * registration order.
   *
   * Handler failures are caught and reported (via console.error at this
   * layer — we cannot import a logger here without violating the layering
   * rules); the bus then continues with the next handler.
   */
  emit<E extends EventName>(eventName: E, payload: PayloadFor<E>): void;

  /**
   * Register a handler for the given event. The handler is appended to the
   * end of the handler list. Returns a disposer function that, when called,
   * removes the handler.
   */
  on<E extends EventName>(eventName: E, handler: EventHandler<E>): () => void;
}
