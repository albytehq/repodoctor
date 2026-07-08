/**
 * Scanner Engine domain model.
 *
 * Pure type definitions for the raw fact-collection system introduced in
 * v0.0.3. Facts are atomic units of objective truth — they contain NO
 * severity, score, or recommendation. They only describe what IS.
 *
 * Architectural role: core (domain) — type-only. Every layer may depend
 * on these types because every layer may depend on `core`.
 */

/**
 * A raw, unvalidated fact produced by a scanner.
 *
 * Scanners emit `RawFact[]` from their `execute` method. The
 * {@link FactValidator} inspects each one before promoting it to a
 * {@link ValidatedFact} in the {@link FactStore}.
 *
 * Invariants (enforced by the validator):
 *   - `type` must be a non-empty string matching `/^[A-Z_]+$/`.
 *   - `target` must be a non-empty string.
 *   - `value` must not be `undefined` or `null`.
 *   - If `value` is an array, it must not contain `undefined` or `null`.
 */
export interface RawFact {
  /** Fact type, e.g. `FILE_EXISTS`, `DEPENDENCY_DECLARED`. */
  readonly type: string;
  /** The file or entity being observed, e.g. `package.json`. */
  readonly target: string;
  /** The objective payload, e.g. `true`, `40`, `["react", "express"]`. */
  readonly value: unknown;
}

/**
 * A validated, stored fact with provenance and a deterministic ID.
 *
 * Once a `RawFact` passes validation, the {@link FactStore} assigns it
 * a deterministic `id` (SHA-256 hash of `${type}:${target}:${JSON.stringify(value)}`)
 * and records which scanner(s) observed it.
 *
 * Immutability: a `ValidatedFact` is frozen at creation time. Its fields
 * never change. When a duplicate fact is observed by a different scanner,
 * the {@link FactStore} creates a NEW `ValidatedFact` with the merged
 * `scannerIds` array — it never mutates the existing one.
 */
export interface ValidatedFact {
  /** SHA-256 hash of `${type}:${target}:${JSON.stringify(value)}`, truncated to 16 hex chars. */
  readonly id: string;
  /** IDs of the scanner(s) that observed this fact. At least one entry. */
  readonly scannerIds: readonly string[];
  /** Fact type, e.g. `FILE_EXISTS`. */
  readonly type: string;
  /** The file or entity being observed. */
  readonly target: string;
  /** The objective payload. */
  readonly value: unknown;
  /** ISO-8601 timestamp marking when the fact was validated and stored. */
  readonly observedAt: string;
}

/**
 * The complete result of a scan run.
 *
 * Returned by `ScannerEngine.run()` and emitted as the payload of the
 * `RepositoryScanCompleted` event.
 */
export interface ScanResult {
  /** Schema version for forward compatibility. Currently `1`. */
  readonly schemaVersion: number;
  /** Repository name (from the discovery profile). */
  readonly patient: string;
  /** ISO-8601 timestamp marking when the scan completed. */
  readonly scanCompletedAt: string;
  /** All validated facts collected during the scan. */
  readonly facts: readonly ValidatedFact[];
}
