/**
 * Fact collector.
 *
 * Receives `RawFact[]` from scanners, validates each fact via
 * {@link validateFact}, and pushes valid facts to the {@link FactStore}.
 * Invalid facts are discarded (the caller receives a list of validation
 * errors for logging).
 *
 * Architectural role: scanner — may import from core, errors. This
 * module imports `core/domain/Scan`, `errors/FactValidationError`, and
 * the local `FactValidator` + `FactStore`.
 */

import type { IEventBus } from '@repodoctor/core/events/IEventBus';
import type { RawFact } from '@repodoctor/core/domain/Scan';
import { FactValidationError } from '@repodoctor/errors/FactValidationError';
import { validateFact } from '@repodoctor/scanner/FactValidator';
import type { FactStore } from '@repodoctor/scanner/FactStore';

/**
 * Result of collecting facts from a single scanner.
 */
export interface CollectionResult {
  /** The number of facts that passed validation and entered the store. */
  readonly accepted: number;
  /** The number of facts that were rejected by the validator. */
  readonly rejected: number;
  /** The validation errors for rejected facts. */
  readonly errors: readonly FactValidationError[];
}

/**
 * Aggregates raw facts from scanners into the {@link FactStore}.
 *
 * Constructed once per scan with the {@link FactStore} and optional
 * {@link IEventBus} (for emitting `FactValidated` events).
 */
export class FactCollector {
  constructor(
    private readonly store: FactStore,
    private readonly eventBus: IEventBus | undefined,
  ) {}

  /**
   * Collect facts from a single scanner.
   *
   * Each fact is validated. Valid facts are added to the store and
   * trigger a `FactValidated` event. Invalid facts are collected into
   * the returned `CollectionResult.errors` array.
   *
   * @param facts The raw facts produced by a scanner.
   * @param scannerId The ID of the scanner that produced the facts.
   */
  public collect(facts: readonly RawFact[], scannerId: string): CollectionResult {
    let accepted = 0;
    let rejected = 0;
    const errors: FactValidationError[] = [];

    for (const fact of facts) {
      const result = validateFact(fact);
      if (result.valid) {
        const stored = this.store.add(result.fact, scannerId);
        accepted += 1;
        if (this.eventBus !== undefined) {
          this.eventBus.emit('FactValidated', { factId: stored.id });
        }
      } else {
        rejected += 1;
        const error = new FactValidationError(result.field, result.reason, {
          context: { scannerId, factType: fact.type, factTarget: fact.target },
        });
        errors.push(error);
      }
    }

    return { accepted, rejected, errors };
  }
}
