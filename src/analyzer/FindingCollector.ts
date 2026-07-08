/**
 * Finding collector.
 *
 * Receives `RawFinding[]` from analyzers, validates each finding via
 * {@link validateFinding}, and pushes valid findings to the
 * {@link FindingStore}. Invalid findings are discarded (the caller
 * receives a list of validation errors for logging).
 *
 * Architectural role: analyzer — may import from core, errors. This
 * module imports `core/domain/Analysis`, `errors/FindingValidationError`,
 * and the local `FindingValidator` + `FindingStore`.
 */

import type { IEventBus } from '@repodoctor/core/events/IEventBus';
import type { RawFinding } from '@repodoctor/core/domain/Analysis';
import { FindingValidationError } from '@repodoctor/errors/FindingValidationError';
import { validateFinding } from '@repodoctor/analyzer/FindingValidator';
import type { FindingStore } from '@repodoctor/analyzer/FindingStore';

/**
 * Result of collecting findings from a single analyzer.
 */
export interface CollectionResult {
  /** The number of findings that passed validation and entered the store. */
  readonly accepted: number;
  /** The number of findings that were rejected by the validator. */
  readonly rejected: number;
  /** The validation errors for rejected findings. */
  readonly errors: readonly FindingValidationError[];
}

/**
 * Aggregates raw findings from analyzers into the {@link FindingStore}.
 *
 * Constructed once per analysis with the {@link FindingStore} and
 * optional {@link IEventBus} (for emitting `FindingValidated` events).
 */
export class FindingCollector {
  constructor(
    private readonly store: FindingStore,
    private readonly eventBus: IEventBus | undefined,
  ) {}

  /**
   * Collect findings from a single analyzer.
   *
   * Each finding is validated. Valid findings are added to the store
   * and trigger a `FindingValidated` event. Invalid findings are
   * collected into the returned `CollectionResult.errors` array.
   *
   * @param findings The raw findings produced by an analyzer.
   * @param analyzerId The ID of the analyzer that produced the findings.
   */
  public collect(findings: readonly RawFinding[], analyzerId: string): CollectionResult {
    let accepted = 0;
    let rejected = 0;
    const errors: FindingValidationError[] = [];

    for (const finding of findings) {
      const result = validateFinding(finding);
      if (result.valid) {
        const stored = this.store.add(result.finding, analyzerId);
        accepted += 1;
        if (this.eventBus !== undefined) {
          this.eventBus.emit('FindingValidated', { findingId: stored.id });
        }
      } else {
        rejected += 1;
        const error = new FindingValidationError(result.field, result.reason, {
          context: { analyzerId, ruleId: finding.ruleId, target: finding.target },
        });
        errors.push(error);
      }
    }

    return { accepted, rejected, errors };
  }
}
