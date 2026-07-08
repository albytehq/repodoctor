/**
 * Analysis result formatter.
 *
 * Converts an {@link AnalysisResult} into either a human-readable
 * terminal string or a JSON string. Used by the CLI bootstrap when the
 * `--json` flag is (or is not) present.
 *
 * Architectural role: cli — may import from every other layer.
 */

import type { AnalysisResult, ValidatedFinding } from '@repodoctor/core/domain/Analysis';

/**
 * Format an {@link AnalysisResult} as a human-readable terminal string.
 */
export function formatAnalysisResult(result: AnalysisResult): string {
  const lines: string[] = [];

  lines.push('RepoDoctor — Analyzer Engine');
  lines.push(`Patient: ${result.patient}`);
  lines.push('');
  lines.push(`Total Findings: ${result.findings.length}`);
  lines.push('');

  if (result.findings.length === 0) {
    lines.push('No findings. All rules passed.');
    lines.push('');
    return lines.join('\n');
  }

  // Group findings by ruleId for readability.
  const byRule = groupByRule(result.findings);
  for (const [ruleId, findings] of byRule) {
    lines.push(`${ruleId} (${findings.length}):`);
    for (const finding of findings) {
      lines.push(`  [${finding.target}] ${finding.message}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format an {@link AnalysisResult} as a JSON string.
 *
 * The output strictly matches the `AnalysisResult` interface — no extra
 * wrapper fields. Pretty-printed with 2-space indentation.
 */
export function formatAnalysisResultJson(result: AnalysisResult): string {
  return JSON.stringify(result, null, 2);
}

/**
 * Group findings by their `ruleId` field, preserving insertion order.
 */
function groupByRule(findings: readonly ValidatedFinding[]): Map<string, ValidatedFinding[]> {
  const map = new Map<string, ValidatedFinding[]>();
  for (const finding of findings) {
    let list = map.get(finding.ruleId);
    if (list === undefined) {
      list = [];
      map.set(finding.ruleId, list);
    }
    list.push(finding);
  }
  return map;
}
