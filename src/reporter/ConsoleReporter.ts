/**
 * Console Reporter.
 *
 * Formats a {@link FinalReport} as a beautiful, hierarchical terminal
 * string using `picocolors` for colors and `cli-table3` for tables.
 *
 * The output is clean ASCII — no emoji, just consistent box-drawing
 * characters and text prefixes.
 *
 * Architectural role: reporter — may import from core, utils, health,
 * treatment. This module imports `picocolors` and `cli-table3` (both
 * are external libraries, allowed in any layer).
 */

import pc from 'picocolors';
import Table from 'cli-table3';
import type { FinalReport } from '@repodoctor/treatment/types';
import type {
  MedicalDiagnosis,
  OrganDiagnosis,
  ValidatedFinding,
} from '@repodoctor/core/domain/Health';
import type { Treatment } from '@repodoctor/treatment/types';

/**
 * Type alias for the picocolors formatter object.
 */
type ColorFormatter = ReturnType<typeof pc.createColors>;

/**
 * Format a {@link FinalReport} as a colored, tabular terminal string.
 *
 * The output includes:
 *   - Header with patient name and timestamp.
 *   - Overall health score with colored status.
 *   - Organ score table.
 *   - Diagnosis & Treatments section with findings and actions.
 *   - Final verdict.
 *
 * When `useColor` is `false`, all color codes are stripped (for CI or
 * non-interactive environments where ANSI codes may not render).
 */
export function formatConsoleReport(report: FinalReport, useColor: boolean = true): string {
  const c: ColorFormatter = pc.createColors(useColor);
  const { diagnosis, treatments, generatedAt } = report;

  const lines: string[] = [];

  // --- Header ---
  lines.push(c.bold('RepoDoctor — First Diagnosis'));
  lines.push(`Patient: ${diagnosis.patient} | Scanned: ${formatTimestamp(generatedAt)}`);
  lines.push('');

  // --- Overall Health ---
  const overallColor = statusColor(diagnosis.overallStatus, c);
  lines.push(
    `${c.bold('Overall Health:')} ${overallColor(`${diagnosis.overallScore}/100`)} [${overallColor(diagnosis.overallStatus)}]`,
  );
  lines.push('');

  // --- Organ Table ---
  lines.push(formatOrganTable(diagnosis.organs, c));
  lines.push('');

  // --- Diagnosis & Treatments ---
  if (diagnosis.organs.some((o) => o.findings.length > 0)) {
    lines.push(c.bold('Diagnosis & Treatments:'));
    lines.push('');
    for (const organ of diagnosis.organs) {
      for (const finding of organ.findings) {
        lines.push(formatFindingBlock(organ, finding, treatments, c));
      }
    }
  }

  // --- Verdict ---
  lines.push(formatVerdict(diagnosis, c));

  return lines.join('\n') + '\n';
}

/**
 * Format the organ score table using cli-table3.
 */
function formatOrganTable(
  organs: readonly OrganDiagnosis[],
  c: ColorFormatter,
): string {
  const table = new Table({
    head: ['Organ', 'Score', 'Status'],
    style: {
      head: [], // No special head styling (we apply our own colors)
      border: [], // No colored borders
    },
    chars: {
      'top': '━',
      'bottom': '━',
      'left': '┃',
      'right': '┃',
      'mid': '─',
      'left-mid': '├',
      'mid-mid': '┼',
      'right-mid': '┤',
      'top-mid': '┬',
      'bottom-mid': '┴',
      'top-left': '┏',
      'top-right': '┓',
      'bottom-left': '┗',
      'bottom-right': '┛',
      'middle': '│',
    },
  });

  for (const organ of organs) {
    const statusLabel = formatStatusLabel(organ.status, c);
    table.push([organ.organName, `${organ.score}/100`, statusLabel]);
  }

  return table.toString();
}

/**
 * Format a single finding block (finding + treatment).
 */
function formatFindingBlock(
  organ: OrganDiagnosis,
  finding: ValidatedFinding,
  treatments: readonly Treatment[],
  c: ColorFormatter,
): string {
  const lines: string[] = [];
  const severity = inferSeverity(finding.ruleId);
  const severityLabel = formatSeverityLabel(severity, c);

  lines.push(
    `  [${severityLabel}] ${organ.organName} (${finding.target})`,
  );
  lines.push(`    └─ Finding: ${finding.message}`);

  const treatment = treatments.find((t) => t.findingId === finding.id);
  if (treatment !== undefined) {
    lines.push(`    └─ Treatment: ${treatment.action.description}`);
    if (treatment.action.command !== undefined) {
      lines.push(`    └─ Command: ${c.cyan(treatment.action.command)}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format the final verdict line.
 */
function formatVerdict(diagnosis: MedicalDiagnosis, c: ColorFormatter): string {
  const color = statusColor(diagnosis.overallStatus, c);
  return `\nVerdict: ${color(diagnosis.overallStatus)}.`;
}

/**
 * Format a status label with a prefix icon and color.
 */
function formatStatusLabel(status: string, c: ColorFormatter): string {
  const icon = statusIcon(status);
  const colored = statusColor(status, c);
  return `${icon} ${colored(status)}`;
}

/**
 * Format a severity label with padding and color.
 */
function formatSeverityLabel(severity: string, c: ColorFormatter): string {
  const icon = severity === 'Critical' ? 'X' : severity === 'Warning' ? '!' : '-';
  const padded = severity.toUpperCase().padEnd(8);
  const colored =
    severity === 'Critical'
      ? c.red(padded)
      : severity === 'Warning'
        ? c.yellow(padded)
        : c.gray(padded);
  return `${icon} ${colored}`;
}

/**
 * Get the icon for an organ status.
 */
function statusIcon(status: string): string {
  switch (status) {
    case 'Excellent':
      return '+';
    case 'Healthy':
      return '+';
    case 'Warning':
      return '!';
    case 'Critical':
      return 'X';
    default:
      return '?';
  }
}

/**
 * Get the color function for a status.
 */
function statusColor(status: string, c: ColorFormatter): (s: string) => string {
  switch (status) {
    case 'Excellent':
      return c.green;
    case 'Healthy':
      return c.green;
    case 'Warning':
      return c.yellow;
    case 'Critical':
      return c.red;
    case 'Recovery Needed':
      return c.red;
    default:
      return c.gray;
  }
}

/**
 * Infer the severity of a finding from its ruleId.
 *
 * This mirrors the default mappings in RuleWeightRegistry.
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
 * Format a timestamp for display (strip milliseconds).
 */
function formatTimestamp(iso: string): string {
  return iso.replace(/\.\d{3}Z$/, ' UTC').replace('T', ' ');
}
