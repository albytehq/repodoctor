/**
 * Scanner interface and scanner context.
 *
 * Every scanner — built-in or future plugin — implements {@link IScanner}.
 * The {@link ScannerContext} is the dependency-injection container passed
 * to each scanner's `execute` method.
 *
 * Architectural role: scanner — may import from core, infrastructure,
 * errors, utils, discovery. This module imports from core (interfaces +
 * domain types) and discovery (for the profile type).
 */

import type { IScannerFileSystem } from '@repodoctor/core/IScannerFileSystem';
import type { RepositoryProfile } from '@repodoctor/core/domain/Discovery';
import type { RawFact } from '@repodoctor/core/domain/Scan';
import type { Workspace } from '@repodoctor/core/domain/Workspace';

/**
 * The context passed to each scanner's `execute` method.
 *
 * Contains everything a scanner needs to read files safely:
 *   - `fs`: the caching, path-safe, size-limited file system.
 *   - `profile`: the repository profile from v0.0.2 discovery.
 *   - `workspace`: the workspace (cwd, CI/interactive flags).
 */
export interface ScannerContext {
  readonly fs: IScannerFileSystem;
  readonly profile: RepositoryProfile;
  readonly workspace: Workspace;
}

/**
 * Every scanner implements this interface.
 *
 * Scanners MUST be pure aside from FS reads via the injected
 * {@link ScannerContext}. They MUST NOT:
 *   - Import Node built-ins (`fs`, `path`).
 *   - Make network requests.
 *   - Spawn child processes.
 *   - Emit severity, score, or recommendation strings.
 *   - Mutate global state.
 *
 * Scanners SHOULD be deterministic: the same repository state + the same
 * scanner code MUST always produce the same `RawFact[]`.
 */
export interface IScanner {
  /** Stable scanner ID, e.g. `package-json-scanner`. */
  readonly id: string;
  /** Scanner version, e.g. `1.0.0`. */
  readonly version: string;

  /**
   * Determines whether this scanner should run for the given repository
   * profile.
   *
   * Called once per scan, before execution. The {@link ScannerRegistry}
   * uses this to filter the scanner list.
   */
  supports(profile: RepositoryProfile): boolean;

  /**
   * Execute the scan.
   *
   * @param context The scanner context (FS, profile, workspace).
   * @returns An array of {@link RawFact} objects. May be empty.
   */
  execute(context: ScannerContext): Promise<RawFact[]>;
}
