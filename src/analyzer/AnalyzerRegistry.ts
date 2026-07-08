/**
 * Analyzer registry.
 *
 * Holds all registered {@link IAnalyzer} instances. Built-in analyzers
 * are registered synchronously during CLI bootstrap. The registry
 * filters analyzers by compatibility with a given
 * {@link RepositoryProfile}.
 *
 * Architectural role: analyzer — pure module. No I/O.
 */

import type { RepositoryProfile } from '@repodoctor/core/domain/Discovery';
import type { IAnalyzer } from '@repodoctor/analyzer/IAnalyzer';

/**
 * Internal registry of analyzers.
 *
 * Backed by a `Map<string, IAnalyzer>` keyed by analyzer ID. Duplicate
 * registrations throw — two analyzers with the same ID is almost always
 * a bug.
 */
export class AnalyzerRegistry {
  private readonly analyzers: Map<string, IAnalyzer> = new Map();

  /**
   * Register an analyzer. Throws if an analyzer with the same ID is
   * already registered.
   */
  public register(analyzer: IAnalyzer): void {
    if (analyzer.id === '') {
      throw new Error('Analyzer ID must not be empty.');
    }
    if (this.analyzers.has(analyzer.id)) {
      throw new Error(`Analyzer already registered: ${analyzer.id}`);
    }
    this.analyzers.set(analyzer.id, analyzer);
  }

  /**
   * Returns all registered analyzers, sorted alphabetically by ID.
   *
   * The sort ensures deterministic execution order (the spec requires
   * alphabetical ordering even though analyzers run in parallel).
   */
  public getAll(): readonly IAnalyzer[] {
    return Array.from(this.analyzers.values()).sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );
  }

  /**
   * Returns the subset of analyzers whose `supports(profile)` method
   * returns `true`, sorted alphabetically by ID.
   */
  public getCompatibleAnalyzers(profile: RepositoryProfile): readonly IAnalyzer[] {
    return this.getAll().filter((a) => a.supports(profile));
  }

  /**
   * Returns the number of registered analyzers.
   */
  public get size(): number {
    return this.analyzers.size;
  }
}
