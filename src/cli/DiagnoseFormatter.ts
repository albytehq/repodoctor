/**
 * Diagnosis result formatter.
 *
 * Converts a {@link MedicalDiagnosis} into either a human-readable
 * terminal string or a JSON string.
 *
 * Architectural role: cli — may import from every other layer.
 */

import type {
  MedicalDiagnosis,
  ValidatedFinding,
} from '@repodoctor/core/domain/Health';

/**
 * Format a {@link MedicalDiagnosis} as a human-readable terminal string.
 *
 * The format matches the v0.0.5 spec section 10:
 *
 * ```text
 * RepoDoctor — Health & Diagnosis Engine
 * Patient: my-saas-app
 *
 * Overall Health: 48/100 [Recovery Needed]
 *
 * Organs:
 *   [ X ] Environment       25/100 (Critical)
 *   [ X ] Manifest           75/100 (Warning)
 *   ...
 *
 * Diagnosis Details:
 *   [ CRITICAL ] Environment: .env file is not listed in .gitignore.
 *   [ WARNING  ] Manifest: Lockfile is missing.
 * ```
 */
export function formatDiagnosisResult(result: MedicalDiagnosis): string {
  const lines: string[] = [];

  lines.push('RepoDoctor — Health & Diagnosis Engine');
  lines.push(`Patient: ${result.patient}`);
  lines.push('');
  lines.push(`Overall Health: ${result.overallScore}/100 [${result.overallStatus}]`);
  lines.push('');

  // Organs section
  lines.push('Organs:');
  for (const organ of result.organs) {
    const icon = organIcon(organ.status);
    const paddedName = padRight(organ.organName, 20);
    const paddedScore = padRight(`${organ.score}/100`, 10);
    lines.push(`  [ ${icon} ] ${paddedName} ${paddedScore} (${organ.status})`);
  }
  lines.push('');

  // Diagnosis details
  if (result.organs.some((o) => o.findings.length > 0)) {
    lines.push('Diagnosis Details:');
    for (const organ of result.organs) {
      for (const finding of organ.findings) {
        const severity = findingSeverityLabel(finding);
        const paddedSeverity = padRight(severity, 8);
        lines.push(`  [ ${paddedSeverity} ] ${organ.organName}: ${finding.message}`);
      }
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * Format a {@link MedicalDiagnosis} as a JSON string.
 */
export function formatDiagnosisResultJson(result: MedicalDiagnosis): string {
  return JSON.stringify(result, null, 2);
}

/**
 * Get the status icon for an organ.
 */
function organIcon(status: string): string {
  switch (status) {
    case 'Excellent':
      return '-';
    case 'Healthy':
      return '-';
    case 'Warning':
      return '!';
    case 'Critical':
      return 'X';
    default:
      return '?';
  }
}

/**
 * Get the severity label for a finding.
 *
 * This requires looking up the finding's ruleId in the rule weight
 * registry. Since the formatter is in the cli layer and the registry is
 * in the health layer, we pass the severity as part of the finding's
 * metadata or infer it from the ruleId.
 *
 * For simplicity in the formatter, we infer the severity from the
 * finding's ruleId using the same default mappings. This is a minor
 * duplication of the registry, but it keeps the formatter self-contained.
 */
function findingSeverityLabel(finding: ValidatedFinding): string {
  const severity = inferSeverity(finding.ruleId);
  return severity.toUpperCase();
}

/**
 * Infer the severity of a finding from its ruleId.
 *
 * This mirrors the default mappings in RuleWeightRegistry. Future
 * versions should pass the severity through the diagnosis object.
 */
function inferSeverity(ruleId: string): string {
  const CRITICAL_RULES = new Set([
    'env-file-not-ignored',
    'lockfile-missing',
    'gitignore-missing',
  ]);
  const WARNING_RULES = new Set([
    'license-missing',
    'env-example-missing',
  ]);

  if (CRITICAL_RULES.has(ruleId)) return 'Critical';
  if (WARNING_RULES.has(ruleId)) return 'Warning';
  return 'Minor';
}

/**
 * Pad a string to a fixed width with trailing spaces.
 */
function padRight(s: string, width: number): string {
  if (s.length >= width) {
    return s;
  }
  return s + ' '.repeat(width - s.length);
}
