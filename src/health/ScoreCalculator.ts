/**
 * Score Calculator.
 *
 * Pure functions that compute organ scores and the overall repository
 * score from validated findings and rule weights.
 *
 * Architectural role: health — pure module. No I/O, no side effects.
 */

import type {
  RuleWeight,
  OrganDiagnosis,
  OrganStatus,
  OverallStatus,
  FindingSeverity,
} from '@repodoctor/core/domain/Health';
import type { ValidatedFinding } from '@repodoctor/core/domain/Analysis';
import type { RuleWeightRegistry } from '@repodoctor/health/RuleWeightRegistry';

/**
 * The maximum organ score (and the starting point before penalties).
 */
const MAX_SCORE = 100;

/**
 * The minimum organ score (penalties cannot drive it below 0).
 */
const MIN_SCORE = 0;

/**
 * The Critical Floor: if any finding is `Critical`, the overall score
 * is capped at this value (50, "Recovery Needed").
 */
const CRITICAL_FLOOR = 50;

/**
 * Maps an analyzer ID to its organ name and category weight.
 *
 * Per the v0.0.5 spec:
 *   - Security (Environment Analyzer): 30%
 *   - Dependencies (Manifest Analyzer): 25%
 *   - Structure (Structure Analyzer): 20%
 *   - Documentation (Documentation Analyzer): 15%
 *
 * The remaining 10% (the "Environment" overlap category) is merged into
 * the 30% Security weight for v0.0.5 — we treat the environment-analyzer
 * as a single organ. The weights are normalized so they sum to 1.0.
 */
export interface OrganMapping {
  readonly organName: string;
  readonly weight: number;
}

const ANALYZER_TO_ORGAN: ReadonlyMap<string, OrganMapping> = new Map<string, OrganMapping>(
  Object.entries({
    'environment-analyzer': { organName: 'Environment', weight: 0.30 },
    'manifest-analyzer': { organName: 'Manifest', weight: 0.25 },
    'structure-analyzer': { organName: 'Structure', weight: 0.20 },
    'documentation-analyzer': { organName: 'Documentation', weight: 0.15 },
  }),
);

/**
 * Result of calculating organ scores.
 */
export interface OrganScoreResult {
  readonly organs: readonly OrganDiagnosis[];
  readonly rawOverallScore: number;
  /** True if any finding has Critical severity. */
  readonly hasCritical: boolean;
  /** True if any organ's status is 'Critical' (score < 50). */
  readonly anyOrganCritical: boolean;
}

/**
 * Group findings by their source analyzer ID, then map each group to
 * its organ name.
 *
 * A finding may be attributed to multiple analyzers (via `analyzerIds`).
 * We assign it to the FIRST analyzer that has an organ mapping. This
 * prevents double-counting: each finding contributes to exactly one
 * organ's score.
 *
 * Findings whose analyzer IDs do not map to any organ are collected
 * under an "Uncategorized" organ.
 */
export function groupFindingsByOrgan(
  findings: readonly ValidatedFinding[],
): Map<string, ValidatedFinding[]> {
  const organFindings = new Map<string, ValidatedFinding[]>();

  for (const finding of findings) {
    const organName = resolveOrganName(finding);
    let list = organFindings.get(organName);
    if (list === undefined) {
      list = [];
      organFindings.set(organName, list);
    }
    list.push(finding);
  }

  return organFindings;
}

/**
 * Resolve which organ a finding belongs to, based on its `analyzerIds`.
 *
 * Returns the organ name for the first analyzer ID that has a mapping.
 * If none match, returns "Uncategorized".
 */
function resolveOrganName(finding: ValidatedFinding): string {
  for (const analyzerId of finding.analyzerIds) {
    const mapping = ANALYZER_TO_ORGAN.get(analyzerId);
    if (mapping !== undefined) {
      return mapping.organName;
    }
  }
  return 'Uncategorized';
}

/**
 * Calculate the score for a single organ.
 *
 * Starts at 100. For each finding, deducts the penalty specified by
 * the {@link RuleWeightRegistry}. The score is floored at 0.
 *
 * @param findings The findings attributed to this organ.
 * @param registry The rule weight registry.
 * @returns A score from 0 to 100.
 */
export function calculateOrganScore(
  findings: readonly ValidatedFinding[],
  registry: RuleWeightRegistry,
): number {
  let score = MAX_SCORE;
  for (const finding of findings) {
    const weight = registry.getWeight(finding.ruleId);
    score -= weight.penalty;
  }
  return Math.min(MAX_SCORE, Math.max(MIN_SCORE, score));
}

/**
 * Check whether any finding in the collection is classified as Critical.
 */
export function hasCriticalFinding(
  findings: readonly ValidatedFinding[],
  registry: RuleWeightRegistry,
): boolean {
  for (const finding of findings) {
    const weight = registry.getWeight(finding.ruleId);
    if (weight.severity === 'Critical') {
      return true;
    }
  }
  return false;
}

/**
 * Calculate organ scores and the raw overall score for a collection of
 * findings.
 *
 * The raw overall score is the weighted average of organ scores,
 * normalized to a 0-100 scale. The Critical Floor is NOT applied here
 * — the caller (DiagnosisEngine) applies it after determining the
 * overall status.
 *
 * @param findings All validated findings from the analysis.
 * @param registry The rule weight registry.
 * @returns Organ diagnoses, the raw overall score, and a flag indicating
 *   whether any finding is Critical.
 */
export function calculateScores(
  findings: readonly ValidatedFinding[],
  registry: RuleWeightRegistry,
): OrganScoreResult {
  const organFindings = groupFindingsByOrgan(findings);
  const organs: OrganDiagnosis[] = [];
  let hasCritical = false;
  let weightedSum = 0;
  let usedWeight = 0;

  for (const [organName, organFindingsList] of organFindings) {
    const score = calculateOrganScore(organFindingsList, registry);
    const status = scoreToOrganStatus(score);

    if (hasCriticalFinding(organFindingsList, registry)) {
      hasCritical = true;
    }

    const weight = getOrganWeight(organName);
    weightedSum += score * weight;
    usedWeight += weight;

    organs.push(
      Object.freeze({
        organName,
        score,
        status,
        findings: organFindingsList,
      }),
    );
  }

  // Sort organs alphabetically by name for deterministic output.
  organs.sort((a, b) => a.organName.localeCompare(b.organName));

  // Normalize: if usedWeight is 0 (no findings at all), score is 100.
  // Otherwise, divide by usedWeight to scale to 0-100.
  const rawOverallScore = usedWeight > 0 ? weightedSum / usedWeight : MAX_SCORE;

  // Check if any organ has Critical status (score < 50). This is distinct
  // from `hasCritical` (which means any FINDING has Critical severity).
  // An organ can reach Critical status via accumulated Warnings even
  // without any Critical-severity finding. Per the Health.ts spec, the
  // overall status should be 'Recovery Needed' if any organ is Critical.
  const anyOrganCritical = organs.some((o) => o.status === 'Critical');

  return {
    organs,
    rawOverallScore: Math.round(rawOverallScore),
    hasCritical,
    anyOrganCritical,
  };
}

/**
 * Get the category weight for an organ name.
 *
 * Returns 0 for "Uncategorized" organs (they don't contribute to the
 * overall score, but their findings are still listed in the diagnosis).
 */
function getOrganWeight(organName: string): number {
  for (const mapping of ANALYZER_TO_ORGAN.values()) {
    if (mapping.organName === organName) {
      return mapping.weight;
    }
  }
  return 0;
}

/**
 * Map a numeric score (0-100) to an {@link OrganStatus}.
 *
 * - 90-100: Excellent
 * - 70-89:  Healthy
 * - 50-69:  Warning
 * - 0-49:   Critical
 */
export function scoreToOrganStatus(score: number): OrganStatus {
  if (score >= 90) return 'Excellent';
  if (score >= 70) return 'Healthy';
  if (score >= 50) return 'Warning';
  return 'Critical';
}

/**
 * Apply the Critical Floor rule.
 *
 * If `hasCritical` is true, the overall score is capped at
 * {@link CRITICAL_FLOOR} (50). Otherwise the score is returned unchanged.
 */
export function applyCriticalFloor(score: number, hasCritical: boolean): number {
  if (hasCritical) {
    return Math.min(score, CRITICAL_FLOOR);
  }
  return score;
}

/**
 * Map a numeric overall score (0-100) and critical flags to an
 * {@link OverallStatus}.
 *
 * - If the score is < 50, OR any finding is Critical severity, OR any
 *   organ has Critical status (score < 50): `Recovery Needed`.
 * - Otherwise, uses the same thresholds as {@link scoreToOrganStatus}.
 *
 * The `anyOrganCritical` flag catches the case where an organ reaches
 * Critical status via accumulated Warnings (without any Critical-severity
 * finding) — per the Health.ts spec, this should still trigger
 * 'Recovery Needed' at the overall level.
 */
export function scoreToOverallStatus(
  score: number,
  hasCritical: boolean,
  anyOrganCritical: boolean = false,
): OverallStatus {
  if (score < 50 || hasCritical || anyOrganCritical) {
    return 'Recovery Needed';
  }
  return scoreToOrganStatus(score);
}

/**
 * Re-export for convenience.
 */
export type { RuleWeight, FindingSeverity };
