/**
 * Test helper: mock FactStore.
 *
 * Implements the {@link IFactStore} interface using an in-memory array.
 * Tests use this to inject controlled facts without running the full
 * scanner pipeline.
 */

import type { IFactStore } from '@repodoctor/core/IFactStore';
import type { ValidatedFact } from '@repodoctor/core/domain/Scan';

/**
 * In-memory mock of {@link IFactStore}.
 */
export class MockFactStore implements IFactStore {
  private readonly facts: ValidatedFact[];

  constructor(facts: ValidatedFact[] = []) {
    this.facts = facts;
  }

  public getAll(): readonly ValidatedFact[] {
    return this.facts;
  }

  public getByType(type: string): readonly ValidatedFact[] {
    return this.facts.filter((f) => f.type === type);
  }

  public getByTarget(target: string): readonly ValidatedFact[] {
    return this.facts.filter((f) => f.target === target);
  }

  public hasFact(type: string, target: string): boolean {
    return this.facts.some((f) => f.type === type && f.target === target);
  }

  public get size(): number {
    return this.facts.length;
  }
}

/**
 * Helper: create a ValidatedFact with sensible defaults.
 */
export function makeFact(
  type: string,
  target: string,
  value: unknown,
  overrides: Partial<ValidatedFact> = {},
): ValidatedFact {
  return {
    id: `${type}:${target}`,
    scannerIds: ['test-scanner'],
    type,
    target,
    value,
    observedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}
