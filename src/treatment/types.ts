/**
 * Treatment domain model.
 *
 * Pure type definitions for the prescription system introduced in
 * v0.0.6. Treatments are actionable recommendations that map 1:1 to
 * validated Findings from v0.0.4. Each Treatment carries a
 * {@link TreatmentAction} describing what the developer should do.
 *
 * Architectural role: treatment — type-only. May be imported by
 * `reporter/`, `cli/`, and `core/` (via re-export).
 */

import type { MedicalDiagnosis } from '@repodoctor/core/domain/Health';

/**
 * The kind of action a treatment prescribes.
 *
 * - `command` — a shell command the developer can run (e.g. `npm install`).
 * - `manual`  — a manual step the developer must perform (e.g. edit a file).
 * - `info`    — informational; no specific action required.
 */
export type TreatmentActionType = 'command' | 'manual' | 'info';

/**
 * A single actionable step.
 */
export interface TreatmentAction {
  /** The kind of action. */
  readonly type: TreatmentActionType;
  /** Human-readable description of what to do. */
  readonly description: string;
  /**
   * The shell command to run, present only when `type === 'command'`.
   * May contain `{packageManager}` as a placeholder to be substituted
   * with the detected package manager (e.g. `npm`, `pnpm`).
   */
  readonly command?: string;
}

/**
 * A treatment linked to a specific finding.
 */
export interface Treatment {
  /** The ID of the {@link ValidatedFinding} this treatment addresses. */
  readonly findingId: string;
  /** The rule ID (e.g. `env-file-not-ignored`). */
  readonly ruleId: string;
  /** The action to take. */
  readonly action: TreatmentAction;
}

/**
 * The complete report combining diagnosis and treatments.
 *
 * Produced by the CLI bootstrap after the health engine and treatment
 * engine have run. Consumed by all reporters.
 */
export interface FinalReport {
  /** The medical diagnosis from v0.0.5. */
  readonly diagnosis: MedicalDiagnosis;
  /** All treatments generated for the diagnosis findings. */
  readonly treatments: readonly Treatment[];
  /** ISO-8601 timestamp marking when the report was generated. */
  readonly generatedAt: string;
}
