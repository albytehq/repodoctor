/**
 * Markdown Reporter.
 *
 * Formats a {@link FinalReport} as a clean Markdown document suitable
 * for GitHub READMEs or Issues.
 *
 * Architectural role: reporter — may import from core, utils, health,
 * treatment. This module imports only type definitions.
 */

import type { FinalReport } from '@repodoctor/treatment/types';

/**
 * Format a {@link FinalReport} as a Markdown string.
 */
export function formatMarkdownReport(report: FinalReport): string {
  const lines: string[] = [];
  const { diagnosis, treatments, generatedAt } = report;

  // --- Header ---
  lines.push('# RepoDoctor Diagnosis Report');
  lines.push('');
  lines.push(`**Patient:** ${diagnosis.patient} | **Date:** ${generatedAt}`);
  lines.push('');

  // --- Overall Health ---
  lines.push(`## Overall Health: ${diagnosis.overallScore}/100 (${diagnosis.overallStatus})`);
  lines.push('');

  // --- Organs Table ---
  lines.push('### Organs');
  lines.push('');
  lines.push('| Organ | Score | Status |');
  lines.push('|---|---|---|');
  for (const organ of diagnosis.organs) {
    lines.push(`| ${organ.organName} | ${organ.score}/100 | ${organ.status} |`);
  }
  lines.push('');

  // --- Diagnosis & Treatments ---
  if (diagnosis.organs.some(o => o.findings.length > 0)) {
    lines.push('### Diagnosis & Treatments');
    lines.push('');
    for (const organ of diagnosis.organs) {
      for (const finding of organ.findings) {
        const treatment = treatments.find((t) => t.findingId === finding.id);
        lines.push(`#### ${finding.ruleId}: ${organ.organName} (${finding.target})`);
        lines.push(`* **Finding:** ${finding.message}`);
        if (treatment !== undefined) {
          lines.push(`* **Treatment:** ${treatment.action.description}`);
          if (treatment.action.command !== undefined) {
            lines.push(`* **Command:** \`${treatment.action.command}\``);
          }
        }
        lines.push('');
      }
    }
  } else {
    lines.push('### Diagnosis & Treatments');
    lines.push('');
    lines.push('No issues found. The repository is in excellent health.');
    lines.push('');
  }

  return lines.join('\n');
}
