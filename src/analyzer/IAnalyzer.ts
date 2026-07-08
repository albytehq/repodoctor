/**
 * Analyzer interface and analyzer context.
 *
 * Every analyzer — built-in or future plugin — implements
 * {@link IAnalyzer}. The {@link AnalyzerContext} is the
 * dependency-injection container passed to each analyzer's `execute`
 * method.
 *
 * Architectural role: analyzer — may import from core, infrastructure,
 * utils, errors, scanner (for the FactStore interface), discovery (for
 * the profile type). This module imports from core (interfaces + domain
 * types) and discovery (for the profile type).
 */

import type { IFactStore } from '@repodoctor/core/IFactStore';
import type { RepositoryProfile } from '@repodoctor/core/domain/Discovery';
import type { RawFinding } from '@repodoctor/core/domain/Analysis';

/**
 * The context passed to each analyzer's `execute` method.
 *
 * Contains everything an analyzer needs to evaluate facts:
 *   - `profile`: the repository profile from v0.0.2 discovery.
 *   - `factStore`: read-only access to the validated facts from v0.0.3.
 *
 * Analyzers MUST NOT perform filesystem I/O. They only read from the
 * injected {@link IFactStore}.
 */
export interface AnalyzerContext {
  readonly profile: RepositoryProfile;
  readonly factStore: IFactStore;
}

/**
 * Every analyzer implements this interface.
 *
 * Analyzers MUST be pure logic — no I/O, no side effects. They query
 * the {@link IFactStore} via the {@link AnalyzerContext} and produce
 * `RawFinding[]`.
 *
 * Analyzers MUST NOT:
 *   - Perform filesystem I/O (read files, stat, etc.).
 *   - Import `fs`, `path`, or `ScannerFileSystem`.
 *   - Emit severity, score, or treatment strings.
 *   - Mutate the FactStore or any global state.
 *
 * Analyzers SHOULD be deterministic: the same facts + the same analyzer
 * code MUST always produce the same `RawFinding[]`.
 */
export interface IAnalyzer {
  /** Stable analyzer ID, e.g. `environment-analyzer`. */
  readonly id: string;
  /** Analyzer version, e.g. `1.0.0`. */
  readonly version: string;

  /**
   * Determines whether this analyzer should run for the given repository
   * profile.
   *
   * Called once per analysis, before execution. The
   * {@link AnalyzerRegistry} uses this to filter the analyzer list.
   */
  supports(profile: RepositoryProfile): boolean;

  /**
   * Evaluate facts and produce findings.
   *
   * @param context The analyzer context (profile, factStore).
   * @returns An array of {@link RawFinding} objects. May be empty.
   */
  execute(context: AnalyzerContext): Promise<RawFinding[]>;
}
