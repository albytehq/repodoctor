/**
 * Test helper: create ValidatedFinding and MedicalDiagnosis objects.
 */

import type { ValidatedFinding } from '@repodoctor/core/domain/Analysis';
import type {
  MedicalDiagnosis,
  OrganDiagnosis,
} from '@repodoctor/core/domain/Health';
import type { RepositoryProfile } from '@repodoctor/core/domain/Discovery';

export function makeFinding(
  ruleId: string,
  target: string,
  analyzerId: string = 'test-analyzer',
  message: string = 'test message',
): ValidatedFinding {
  return {
    id: `${ruleId}:${target}`,
    analyzerIds: [analyzerId],
    ruleId,
    target,
    message,
  };
}

export function makeOrganDiagnosis(
  organName: string,
  score: number,
  findings: ValidatedFinding[] = [],
): OrganDiagnosis {
  const status =
    score >= 90 ? 'Excellent' : score >= 70 ? 'Healthy' : score >= 50 ? 'Warning' : 'Critical';
  return {
    organName,
    score,
    status,
    findings,
  };
}

export function makeDiagnosis(
  organs: OrganDiagnosis[],
  overallScore?: number,
  overallStatus?: string,
): MedicalDiagnosis {
  const hasCritical = organs.some(
    (o) => o.status === 'Critical' || o.findings.some((f) => isCriticalRule(f.ruleId)),
  );
  const computedScore = overallScore ?? (hasCritical ? Math.min(50, 75) : 75);
  const computedStatus =
    overallStatus ??
    (computedScore < 50 || hasCritical
      ? 'Recovery Needed'
      : computedScore >= 90
        ? 'Excellent'
        : computedScore >= 70
          ? 'Healthy'
          : 'Warning');
  return {
    schemaVersion: 1,
    patient: 'test-repo',
    diagnosedAt: '2024-01-01T00:00:00.000Z',
    overallScore: computedScore,
    overallStatus: computedStatus as MedicalDiagnosis['overallStatus'],
    organs,
  };
}

export function makeProfile(
  overrides: Partial<RepositoryProfile> = {},
): RepositoryProfile {
  return {
    name: 'test-repo',
    type: 'NodeApplication',
    languages: ['TypeScript'],
    packageManager: 'Npm',
    isMonorepo: false,
    workspaces: [],
    frameworks: [],
    rootFiles: [],
    configFiles: [],
    ...overrides,
  };
}

function isCriticalRule(ruleId: string): boolean {
  return (
    ruleId === 'env-file-not-ignored' ||
    ruleId === 'lockfile-missing' ||
    ruleId === 'gitignore-missing'
  );
}
