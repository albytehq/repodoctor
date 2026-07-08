/**
 * Read-only FactStore interface for analyzers.
 *
 * Analyzers need to query facts efficiently but MUST NOT mutate the
 * store. This interface exposes only the query methods of the
 * {@link FactStore}, providing a clear separation between the scanner
 * layer (which writes facts) and the analyzer layer (which reads them).
 *
 * Architectural role: core (interface) — defined here so that `analyzer/`
 * can depend on the contract without importing from `scanner/` at
 * runtime. The concrete implementor is the `FactStore` class in
 * `scanner/FactStore.ts`, which structurally satisfies this interface.
 *
 * Consumers: `analyzer/AnalyzerContext.ts`, built-in analyzers.
 * Implementor: `scanner/FactStore.ts` (via structural typing).
 */

import type { ValidatedFact } from '@repodoctor/core/domain/Scan';

/**
 * Read-only interface for querying validated facts.
 *
 * The analyzer engine receives an `IFactStore` via the
 * {@link AnalyzerContext}. Analyzers call these methods to inspect the
 * raw facts collected by the scanner engine.
 */
export interface IFactStore {
  /**
   * Returns all validated facts in the store.
   */
  getAll(): readonly ValidatedFact[];

  /**
   * Returns all validated facts of the given type (e.g. `FILE_EXISTS`).
   */
  getByType(type: string): readonly ValidatedFact[];

  /**
   * Returns all validated facts whose `target` matches the given value
   * (e.g. `package.json`).
   */
  getByTarget(target: string): readonly ValidatedFact[];

  /**
   * Returns `true` if at least one fact with the given `type` and
   * `target` exists in the store.
   *
   * This is a convenience method — equivalent to
   * `getByType(type).some(f => f.target === target)` but more efficient
   * because it can short-circuit on the first match.
   */
  hasFact(type: string, target: string): boolean;

  /**
   * Returns the number of facts in the store.
   */
  readonly size: number;
}
