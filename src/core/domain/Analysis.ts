/**
 * Analyzer Engine domain model.
 *
 * Pure type definitions for the interpretation system introduced in
 * v0.0.4. Findings are structured interpretations of Facts — they
 * identify specific conditions (rule violations or positive patterns)
 * without assigning health scores, severity, or treatment
 * recommendations.
 *
 * Architectural role: core (domain) — type-only. Every layer may depend
 * on these types because every layer may depend on `core`.
 */

import type { ValidatedFact } from '@repodoctor/core/domain/Scan';

/**
 * A raw, unvalidated finding produced by an analyzer.
 *
 * Analyzers emit `RawFinding[]` from their `execute` method. The
 * {@link FindingValidator} inspects each one before promoting it to a
 * {@link ValidatedFinding} in the {@link FindingStore}.
 *
 * Invariants (enforced by the validator):
 *   - `ruleId` must be a non-empty kebab-case string matching
 *     `^[a-z0-9]+(-[a-z0-9]+)*$`.
 *   - `target` must be a non-empty string.
 *   - `message` must be a non-empty string.
 *   - `metadata` is optional but, when present, must be a record.
 */
export interface RawFinding {
  /** Kebab-case rule identifier, e.g. `env-file-not-ignored`. */
  readonly ruleId: string;
  /** The file or entity being evaluated, e.g. `.env`. */
  readonly target: string;
  /** Objective description of the condition, e.g. "The .env file is not listed in .gitignore." */
  readonly message: string;
  /** Optional structured context (e.g. missing variables). */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * A validated, stored finding with provenance and a deterministic ID.
 *
 * Once a `RawFinding` passes validation, the {@link FindingStore}
 * assigns it a deterministic `id` (SHA-256 hash of `${ruleId}:${target}`)
 * and records which analyzer(s) produced it.
 *
 * Immutability: a `ValidatedFinding` is frozen at creation time. When a
 * duplicate finding is produced by a different analyzer, the
 * {@link FindingStore} creates a NEW `ValidatedFinding` with the merged
 * `analyzerIds` array — it never mutates the existing one.
 */
export interface ValidatedFinding {
  /** SHA-256 hash of `${ruleId}:${target}`, truncated to 16 hex chars. */
  readonly id: string;
  /** IDs of the analyzer(s) that produced this finding. At least one entry. */
  readonly analyzerIds: readonly string[];
  /** Kebab-case rule identifier. */
  readonly ruleId: string;
  /** The file or entity being evaluated. */
  readonly target: string;
  /** Objective description of the condition. */
  readonly message: string;
  /** Optional structured context. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * The complete result of an analysis run.
 *
 * Returned by `AnalyzerEngine.run()` and emitted as the payload of the
 * `RepositoryAnalysisCompleted` event.
 */
export interface AnalysisResult {
  /** Schema version for forward compatibility. Currently `1`. */
  readonly schemaVersion: number;
  /** Repository name (from the discovery profile). */
  readonly patient: string;
  /** ISO-8601 timestamp marking when the analysis completed. */
  readonly analysisCompletedAt: string;
  /** All validated findings produced during the analysis. */
  readonly findings: readonly ValidatedFinding[];
}

/**
 * Re-export ValidatedFact so analyzer modules can reference it without
 * importing from `core/domain/Scan` directly. Both types live in core,
 * so this re-export does not create a layering violation.
 */
export type { ValidatedFact };
