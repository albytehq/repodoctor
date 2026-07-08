/**
 * Health & Diagnosis domain model.
 *
 * Pure type definitions for the medical assessment system introduced in
 * v0.0.5. The Health Engine consumes validated Findings from v0.0.4,
 * applies deterministic weights, and produces a quantitative Health
 * Score (0-100) and a qualitative Medical Diagnosis.
 *
 * Architectural role: core (domain) — type-only. Every layer may depend
 * on these types because every layer may depend on `core`.
 */

import type { ValidatedFinding } from '@repodoctor/core/domain/Analysis';

/**
 * The severity level assigned to a single finding by the
 * {@link RuleWeightRegistry}.
 *
 * - `Critical` — severe issues that cap the overall score at 50.
 * - `Warning`  — notable issues that deduct 10 points per finding.
 * - `Minor`    — minor issues that deduct 2 points per finding.
 */
export type FindingSeverity = 'Critical' | 'Warning' | 'Minor';

/**
 * The medical status assigned to an organ (or the overall repository)
 * based on its score.
 *
 * - `Excellent`       (90-100): Perfect health.
 * - `Healthy`         (70-89):  Minor issues, fully functional.
 * - `Warning`         (50-69):  Notable issues, maintenance required.
 * - `Critical`        (1-49):   Severe issues, unmaintainable/dangerous.
 * - `Recovery Needed`:          Triggered if Overall Score < 50 OR any
 *                               organ is `Critical`. Only used for the
 *                               overall status, never for individual organs.
 */
export type OrganStatus = 'Excellent' | 'Healthy' | 'Warning' | 'Critical';

/**
 * The overall status for the repository. Extends {@link OrganStatus}
 * with `Recovery Needed`, which is triggered by the Critical Floor rule.
 */
export type OverallStatus = OrganStatus | 'Recovery Needed';

/**
 * The weight mapping for a single rule.
 *
 * Each rule ID is mapped to a severity and a penalty (points to deduct
 * from the organ score). The {@link RuleWeightRegistry} holds the
 * default mappings; unknown rules default to `Minor` with penalty 1.
 */
export interface RuleWeight {
  /** The rule ID, matching the `ruleId` field on {@link ValidatedFinding}. */
  readonly ruleId: string;
  /** The severity classification. */
  readonly severity: FindingSeverity;
  /** The points to deduct from the organ score (e.g., 25, 10, 2). */
  readonly penalty: number;
}

/**
 * The diagnosis for a single organ (analyzer module).
 *
 * Each organ starts at 100 and has penalties deducted based on the
 * findings attributed to it. The score is floored at 0.
 */
export interface OrganDiagnosis {
  /** Human-readable organ name (e.g., "Environment", "Documentation"). */
  readonly organName: string;
  /** The organ's health score (0-100). */
  readonly score: number;
  /** The organ's medical status. */
  readonly status: OrganStatus;
  /** The findings attributed to this organ. */
  readonly findings: readonly ValidatedFinding[];
}

/**
 * The complete medical diagnosis for the repository.
 *
 * Produced by the {@link HealthEngine} and emitted as the payload of
 * the `HealthCalculationCompleted` event.
 */
export interface MedicalDiagnosis {
  /** Schema version for forward compatibility. Currently `1`. */
  readonly schemaVersion: number;
  /** Repository name (from the discovery profile). */
  readonly patient: string;
  /** ISO-8601 timestamp marking when the diagnosis was completed. */
  readonly diagnosedAt: string;
  /** The overall health score (0-100, with Critical Floor applied). */
  readonly overallScore: number;
  /** The overall medical status. */
  readonly overallStatus: OverallStatus;
  /** Per-organ diagnoses. */
  readonly organs: readonly OrganDiagnosis[];
}

/**
 * Re-export ValidatedFinding so health modules can reference it without
 * importing from `core/domain/Analysis` directly.
 */
export type { ValidatedFinding };
