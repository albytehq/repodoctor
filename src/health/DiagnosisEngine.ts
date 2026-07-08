/**
 * Diagnosis Engine.
 *
 * Converts raw scores into medical terminology (Excellent, Healthy,
 * Warning, Critical, Recovery Needed) and assembles the final
 * {@link MedicalDiagnosis} object.
 *
 * Architectural role: health — pure module. No I/O, no side effects.
 */

import type {
  MedicalDiagnosis,
  OverallStatus,
} from '@repodoctor/core/domain/Health';
import type { ValidatedFinding } from '@repodoctor/core/domain/Analysis';
import type { RuleWeightRegistry } from '@repodoctor/health/RuleWeightRegistry';
import {
  calculateScores,
  applyCriticalFloor,
  scoreToOverallStatus,
} from '@repodoctor/health/ScoreCalculator';

/**
 * Parameters for the diagnosis engine.
 */
export interface DiagnosisParams {
  readonly patient: string;
  readonly findings: readonly ValidatedFinding[];
  readonly registry: RuleWeightRegistry;
}

/**
 * Converts raw scores into a {@link MedicalDiagnosis}.
 *
 * This is a pure function: it takes findings + weights and returns a
 * diagnosis. No I/O, no events, no side effects.
 */
export function diagnose(params: DiagnosisParams): MedicalDiagnosis {
  const { patient, findings, registry } = params;

  // Calculate organ scores and raw overall score.
  const scoreResult = calculateScores(findings, registry);

  // Apply the Critical Floor rule.
  const overallScore = applyCriticalFloor(scoreResult.rawOverallScore, scoreResult.hasCritical);

  // Determine the overall status. Pass both `hasCritical` (any finding
  // has Critical severity) and `anyOrganCritical` (any organ's status is
  // Critical, even via accumulated Warnings) so the overall status
  // correctly reflects organ-level criticality.
  const overallStatus: OverallStatus = scoreToOverallStatus(
    overallScore,
    scoreResult.hasCritical,
    scoreResult.anyOrganCritical,
  );

  return Object.freeze({
    schemaVersion: 1,
    patient,
    diagnosedAt: new Date().toISOString(),
    overallScore,
    overallStatus,
    organs: scoreResult.organs,
  });
}
