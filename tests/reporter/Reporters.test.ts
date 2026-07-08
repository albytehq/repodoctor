/**
 * Unit tests for all three reporters.
 */

import { describe, it, expect } from 'vitest';
import { formatJsonReport } from '@repodoctor/reporter/JsonReporter';
import { formatMarkdownReport } from '@repodoctor/reporter/MarkdownReporter';
import { formatConsoleReport } from '@repodoctor/reporter/ConsoleReporter';
import type { FinalReport } from '@repodoctor/treatment/types';
import type { OrganDiagnosis } from '@repodoctor/core/domain/Health';
import type { Treatment } from '@repodoctor/treatment/types';
import { makeFinding, makeOrganDiagnosis, makeDiagnosis } from '../treatment/helpers';

function makeReport(
  organs: OrganDiagnosis[],
  treatments: Treatment[] = [],
): FinalReport {
  const diagnosis = makeDiagnosis(organs);
  return {
    diagnosis,
    treatments,
    generatedAt: '2024-01-01T00:00:00.000Z',
  };
}

function makeTreatment(findingId: string, ruleId: string): Treatment {
  return {
    findingId,
    ruleId,
    action: {
      type: 'manual',
      description: `Treatment for ${ruleId}`,
    },
  };
}

// ---------------------------------------------------------------------------
// JsonReporter
// ---------------------------------------------------------------------------

describe('JsonReporter', () => {
  it('outputs valid JSON with the FinalReport schema', () => {
    const report = makeReport([]);
    const json = formatJsonReport(report);
    const parsed: unknown = JSON.parse(json);
    expect(parsed).toHaveProperty('diagnosis');
    expect(parsed).toHaveProperty('treatments');
    expect(parsed).toHaveProperty('generatedAt');
  });

  it('includes diagnosis fields', () => {
    const report = makeReport([]);
    const parsed = JSON.parse(formatJsonReport(report)) as {
      diagnosis: Record<string, unknown>;
    };
    expect(parsed.diagnosis).toHaveProperty('schemaVersion');
    expect(parsed.diagnosis).toHaveProperty('patient');
    expect(parsed.diagnosis).toHaveProperty('overallScore');
    expect(parsed.diagnosis).toHaveProperty('overallStatus');
    expect(parsed.diagnosis).toHaveProperty('organs');
  });

  it('includes treatments array', () => {
    const finding = makeFinding('env-file-not-ignored', '.env', 'environment-analyzer');
    const organ = makeOrganDiagnosis('Environment', 75, [finding]);
    const treatment = makeTreatment(finding.id, finding.ruleId);
    const report = makeReport([organ], [treatment]);
    const parsed = JSON.parse(formatJsonReport(report)) as {
      treatments: Array<{ ruleId: string }>;
    };
    expect(parsed.treatments).toHaveLength(1);
    expect(parsed.treatments[0]!.ruleId).toBe('env-file-not-ignored');
  });
});

// ---------------------------------------------------------------------------
// MarkdownReporter
// ---------------------------------------------------------------------------

describe('MarkdownReporter', () => {
  it('produces a Markdown header', () => {
    const report = makeReport([]);
    const md = formatMarkdownReport(report);
    expect(md).toContain('# RepoDoctor Diagnosis Report');
    expect(md).toContain('**Patient:**');
  });

  it('includes overall health section', () => {
    const report = makeReport([]);
    const md = formatMarkdownReport(report);
    expect(md).toContain('## Overall Health:');
  });

  it('includes organs table with header row', () => {
    const report = makeReport([
      makeOrganDiagnosis('Environment', 75),
      makeOrganDiagnosis('Documentation', 90),
    ]);
    const md = formatMarkdownReport(report);
    expect(md).toContain('| Organ | Score | Status |');
    expect(md).toContain('|---|---|---|');
    expect(md).toContain('Environment');
    expect(md).toContain('75/100');
    expect(md).toContain('Documentation');
  });

  it('includes diagnosis and treatments section when findings exist', () => {
    const finding = makeFinding('env-file-not-ignored', '.env', 'environment-analyzer');
    const organ = makeOrganDiagnosis('Environment', 75, [finding]);
    const treatment = makeTreatment(finding.id, finding.ruleId);
    const report = makeReport([organ], [treatment]);
    const md = formatMarkdownReport(report);
    expect(md).toContain('### Diagnosis & Treatments');
    expect(md).toContain('**Finding:**');
    expect(md).toContain('**Treatment:**');
  });

  it('shows no issues message when no findings', () => {
    const report = makeReport([]);
    const md = formatMarkdownReport(report);
    expect(md).toContain('No issues found');
  });

  it('includes command in treatment when present', () => {
    const finding = makeFinding('lockfile-missing', 'package.json', 'manifest-analyzer');
    const organ = makeOrganDiagnosis('Manifest', 75, [finding]);
    const treatment: Treatment = {
      findingId: finding.id,
      ruleId: finding.ruleId,
      action: {
        type: 'command',
        description: 'Run npm install',
        command: 'npm install',
      },
    };
    const report = makeReport([organ], [treatment]);
    const md = formatMarkdownReport(report);
    expect(md).toContain('**Command:**');
    expect(md).toContain('`npm install`');
  });
});

// ---------------------------------------------------------------------------
// ConsoleReporter
// ---------------------------------------------------------------------------

describe('ConsoleReporter', () => {
  it('produces a header with patient name', () => {
    const report = makeReport([]);
    const output = formatConsoleReport(report, false);
    expect(output).toContain('RepoDoctor — First Diagnosis');
    expect(output).toContain('Patient:');
  });

  it('includes overall health score', () => {
    const report = makeReport([]);
    const output = formatConsoleReport(report, false);
    expect(output).toContain('Overall Health:');
    expect(output).toContain('/100');
  });

  it('includes organ table', () => {
    const report = makeReport([
      makeOrganDiagnosis('Environment', 75),
      makeOrganDiagnosis('Documentation', 90),
    ]);
    const output = formatConsoleReport(report, false);
    expect(output).toContain('Environment');
    expect(output).toContain('75/100');
    expect(output).toContain('Documentation');
  });

  it('includes diagnosis and treatments when findings exist', () => {
    const finding = makeFinding('env-file-not-ignored', '.env', 'environment-analyzer');
    const organ = makeOrganDiagnosis('Environment', 75, [finding]);
    const treatment = makeTreatment(finding.id, finding.ruleId);
    const report = makeReport([organ], [treatment]);
    const output = formatConsoleReport(report, false);
    expect(output).toContain('Diagnosis & Treatments');
    expect(output).toContain('Finding:');
    expect(output).toContain('Treatment:');
  });

  it('includes verdict line', () => {
    const report = makeReport([]);
    const output = formatConsoleReport(report, false);
    expect(output).toContain('Verdict:');
  });

  it('produces colored output when useColor is true', () => {
    const report = makeReport([makeOrganDiagnosis('Environment', 25)]);
    const coloredOutput = formatConsoleReport(report, true);
    const plainOutput = formatConsoleReport(report, false);
    // Colored output should contain ANSI escape codes.
    expect(coloredOutput.length).toBeGreaterThan(plainOutput.length);
  });

  it('plain output has no ANSI escape codes', () => {
    const report = makeReport([makeOrganDiagnosis('Environment', 25)]);
    const output = formatConsoleReport(report, false);
    // ANSI escape codes start with \x1b[
    expect(output).not.toContain('\x1b[');
  });

  it('includes CRITICAL label for critical findings', () => {
    const finding = makeFinding('env-file-not-ignored', '.env', 'environment-analyzer');
    const organ = makeOrganDiagnosis('Environment', 25, [finding]);
    const treatment = makeTreatment(finding.id, finding.ruleId);
    const report = makeReport([organ], [treatment]);
    const output = formatConsoleReport(report, false);
    expect(output).toContain('CRITICAL');
  });

  it('includes WARNING label for warning findings', () => {
    const finding = makeFinding('license-missing', 'LICENSE', 'documentation-analyzer');
    const organ = makeOrganDiagnosis('Documentation', 90, [finding]);
    const treatment = makeTreatment(finding.id, finding.ruleId);
    const report = makeReport([organ], [treatment]);
    const output = formatConsoleReport(report, false);
    expect(output).toContain('WARNING');
  });

  it('includes MINOR label for minor findings', () => {
    const finding = makeFinding('readme-too-short', 'README.md', 'documentation-analyzer');
    const organ = makeOrganDiagnosis('Documentation', 98, [finding]);
    const treatment = makeTreatment(finding.id, finding.ruleId);
    const report = makeReport([organ], [treatment]);
    const output = formatConsoleReport(report, false);
    expect(output).toContain('MINOR');
  });

  it('includes command when treatment has one', () => {
    const finding = makeFinding('lockfile-missing', 'package.json', 'manifest-analyzer');
    const organ = makeOrganDiagnosis('Manifest', 75, [finding]);
    const treatment: Treatment = {
      findingId: finding.id,
      ruleId: finding.ruleId,
      action: {
        type: 'command',
        description: 'Run npm install',
        command: 'npm install',
      },
    };
    const report = makeReport([organ], [treatment]);
    const output = formatConsoleReport(report, false);
    expect(output).toContain('Command:');
    expect(output).toContain('npm install');
  });

  it('displays Warning status icon and color in organ table', () => {
    const organ = makeOrganDiagnosis('Manifest', 60); // Warning status
    const report = makeReport([organ]);
    const output = formatConsoleReport(report, true);
    // Warning uses '!' icon and yellow color
    expect(output).toContain('!');
  });

  it('displays Recovery Needed overall status with red color', () => {
    const finding = makeFinding('env-file-not-ignored', '.env', 'environment-analyzer');
    const organ = makeOrganDiagnosis('Environment', 25, [finding]);
    const report = makeReport([organ], [], 50, 'Recovery Needed');
    const output = formatConsoleReport(report, true);
    expect(output).toContain('Recovery Needed');
  });

  it('displays Excellent and Healthy organ statuses', () => {
    const organs = [
      makeOrganDiagnosis('Doc1', 95), // Excellent
      makeOrganDiagnosis('Doc2', 80), // Healthy
    ];
    const report = makeReport(organs);
    const output = formatConsoleReport(report, false);
    expect(output).toContain('Excellent');
    expect(output).toContain('Healthy');
  });

  it('handles unknown status strings gracefully (defensive default branches)', () => {
    // Force an unknown status string to exercise the default branches
    // in statusIcon and statusColor.
    const organ = makeOrganDiagnosis('Unknown', 50);
    const diagnosis = makeDiagnosis([organ]) as unknown as {
      schemaVersion: number;
      patient: string;
      diagnosedAt: string;
      overallScore: number;
      overallStatus: string;
      organs: Array<{ organName: string; score: number; status: string; findings: never[] }>;
    };
    diagnosis.overallStatus = 'Unknown';
    diagnosis.organs[0]!.status = 'Unknown';
    const report: FinalReport = {
      diagnosis: diagnosis as never,
      treatments: [],
      generatedAt: '2024-01-01T00:00:00.000Z',
    };
    const output = formatConsoleReport(report, false);
    // Should not crash — should render with default icon '?' and gray color.
    expect(output).toContain('?');
    expect(output).toContain('Unknown');
  });
});
