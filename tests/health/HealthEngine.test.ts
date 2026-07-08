/**
 * Integration tests for HealthEngine and DiagnosisEngine.
 *
 * Coverage:
 *   - Full pipeline with mocked findings.
 *   - Critical Floor rule enforcement.
 *   - Events are emitted.
 *   - MedicalDiagnosis schema correctness.
 *   - Multiple organs with mixed severities.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { HealthEngine } from '@repodoctor/health/HealthEngine';
import { RuleWeightRegistry } from '@repodoctor/health/RuleWeightRegistry';
import { diagnose } from '@repodoctor/health/DiagnosisEngine';
import { EventBus } from '@repodoctor/core/events/EventBus';
import type { RepositoryProfile } from '@repodoctor/core/domain/Discovery';
import { makeFinding } from './helpers';
import { CapturingLogger } from '../helpers';

function makeProfile(overrides: Partial<RepositoryProfile> = {}): RepositoryProfile {
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

describe('DiagnosisEngine (pure function)', () => {
  it('returns a MedicalDiagnosis with the correct schema', () => {
    const diagnosis = diagnose({
      patient: 'my-app',
      findings: [],
      registry: new RuleWeightRegistry(),
    });
    expect(diagnosis.schemaVersion).toBe(1);
    expect(diagnosis.patient).toBe('my-app');
    expect(diagnosis.diagnosedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(diagnosis.overallScore).toBe(100);
    expect(diagnosis.overallStatus).toBe('Excellent');
    expect(diagnosis.organs).toEqual([]);
  });

  it('returns a frozen object', () => {
    const diagnosis = diagnose({
      patient: 'x',
      findings: [],
      registry: new RuleWeightRegistry(),
    });
    expect(Object.isFrozen(diagnosis)).toBe(true);
  });

  it('applies the Critical Floor when a Critical finding exists', () => {
    const findings = [
      makeFinding('env-file-not-ignored', '.env', 'environment-analyzer'),
    ];
    const diagnosis = diagnose({
      patient: 'test',
      findings,
      registry: new RuleWeightRegistry(),
    });
    // Environment organ: 100 - 25 = 75. But Critical Floor caps overall at 50.
    expect(diagnosis.overallScore).toBeLessThanOrEqual(50);
    expect(diagnosis.overallStatus).toBe('Recovery Needed');
  });

  it('does not apply the Critical Floor when no Critical findings', () => {
    const findings = [
      makeFinding('license-missing', 'LICENSE', 'documentation-analyzer'),
    ];
    const diagnosis = diagnose({
      patient: 'test',
      findings,
      registry: new RuleWeightRegistry(),
    });
    // Documentation: 100 - 10 = 90. No critical → no floor.
    expect(diagnosis.overallScore).toBe(90);
    expect(diagnosis.overallStatus).toBe('Excellent');
  });
});

describe('HealthEngine — integration', () => {
  let logger: CapturingLogger;

  beforeEach(() => {
    logger = new CapturingLogger();
  });

  it('returns a MedicalDiagnosis with all fields populated', () => {
    const findings = [
      makeFinding('env-file-not-ignored', '.env', 'environment-analyzer'),
      makeFinding('license-missing', 'LICENSE', 'documentation-analyzer'),
    ];
    const engine = new HealthEngine({
      findings,
      profile: makeProfile({ name: 'my-app' }),
      logger,
      eventBus: undefined,
      registry: new RuleWeightRegistry(),
    });
    const result = engine.run();

    expect(result.schemaVersion).toBe(1);
    expect(result.patient).toBe('my-app');
    expect(result.organs).toHaveLength(2);
    expect(result.overallScore).toBeLessThanOrEqual(50); // Critical floor
    expect(result.overallStatus).toBe('Recovery Needed');
  });

  it('returns 100/Excellent when there are no findings', () => {
    const engine = new HealthEngine({
      findings: [],
      profile: makeProfile(),
      logger,
      eventBus: undefined,
      registry: new RuleWeightRegistry(),
    });
    const result = engine.run();
    expect(result.overallScore).toBe(100);
    expect(result.overallStatus).toBe('Excellent');
    expect(result.organs).toEqual([]);
  });

  it('emits HealthCalculationStarted with finding count', () => {
    const eventBus = new EventBus();
    let startedPayload: { findingCount: number } | undefined;
    eventBus.on('HealthCalculationStarted', (p) => {
      startedPayload = p;
    });

    const engine = new HealthEngine({
      findings: [makeFinding('license-missing', 'LICENSE', 'documentation-analyzer')],
      profile: makeProfile(),
      logger,
      eventBus,
      registry: new RuleWeightRegistry(),
    });
    engine.run();

    expect(startedPayload?.findingCount).toBe(1);
  });

  it('emits OrganDiagnosed for each organ', () => {
    const eventBus = new EventBus();
    const organEvents: string[] = [];
    eventBus.on('OrganDiagnosed', (p) => {
      organEvents.push(p.organName);
    });

    const findings = [
      makeFinding('env-file-not-ignored', '.env', 'environment-analyzer'),
      makeFinding('gitignore-missing', '.gitignore', 'structure-analyzer'),
    ];
    const engine = new HealthEngine({
      findings,
      profile: makeProfile(),
      logger,
      eventBus,
      registry: new RuleWeightRegistry(),
    });
    engine.run();

    expect(organEvents).toContain('Environment');
    expect(organEvents).toContain('Structure');
  });

  it('emits HealthCalculationCompleted with overall score and status', () => {
    const eventBus = new EventBus();
    let completedPayload: { overallScore: number; status: string } | undefined;
    eventBus.on('HealthCalculationCompleted', (p) => {
      completedPayload = p;
    });

    const engine = new HealthEngine({
      findings: [],
      profile: makeProfile(),
      logger,
      eventBus,
      registry: new RuleWeightRegistry(),
    });
    engine.run();

    expect(completedPayload?.overallScore).toBe(100);
    expect(completedPayload?.status).toBe('Excellent');
  });

  it('logs debug messages', () => {
    const engine = new HealthEngine({
      findings: [],
      profile: makeProfile(),
      logger,
      eventBus: undefined,
      registry: new RuleWeightRegistry(),
    });
    engine.run();

    const debugMessages = logger.calls
      .filter((c) => c.level === 'debug')
      .map((c) => c.message);
    expect(debugMessages).toContain('Health engine starting.');
    expect(debugMessages).toContain('Health engine complete.');
  });

  it('Critical Floor: overall score <= 50 when any Critical finding', () => {
    const findings = [
      makeFinding('env-file-not-ignored', '.env', 'environment-analyzer'),
    ];
    const engine = new HealthEngine({
      findings,
      profile: makeProfile(),
      logger,
      eventBus: undefined,
      registry: new RuleWeightRegistry(),
    });
    const result = engine.run();
    expect(result.overallScore).toBeLessThanOrEqual(50);
    expect(result.overallStatus).toBe('Recovery Needed');
  });

  it('Critical Floor: even with perfect organs, critical finding caps at 50', () => {
    // One critical finding in one organ, all other organs perfect.
    const findings = [
      makeFinding('env-file-not-ignored', '.env', 'environment-analyzer'),
    ];
    const engine = new HealthEngine({
      findings,
      profile: makeProfile(),
      logger,
      eventBus: undefined,
      registry: new RuleWeightRegistry(),
    });
    const result = engine.run();

    // Environment organ: 75 (100 - 25). No other organs.
    // Raw overall: 75. But Critical Floor caps at 50.
    expect(result.overallScore).toBe(50);
    expect(result.overallStatus).toBe('Recovery Needed');
  });

  it('handles multiple organs with mixed severities', () => {
    const findings = [
      makeFinding('env-file-not-ignored', '.env', 'environment-analyzer'),      // Critical -25
      makeFinding('env-example-missing', '.env.example', 'environment-analyzer'), // Warning -10
      makeFinding('license-missing', 'LICENSE', 'documentation-analyzer'),      // Warning -10
      makeFinding('readme-too-short', 'README.md', 'documentation-analyzer'),   // Minor -2
      makeFinding('gitignore-missing', '.gitignore', 'structure-analyzer'),     // Critical -25
      makeFinding('lockfile-missing', 'package.json', 'manifest-analyzer'),     // Critical -25
      makeFinding('script-missing-build', 'package.json', 'manifest-analyzer'), // Minor -2
    ];
    const engine = new HealthEngine({
      findings,
      profile: makeProfile(),
      logger,
      eventBus: undefined,
      registry: new RuleWeightRegistry(),
    });
    const result = engine.run();

    // Check organ scores
    const env = result.organs.find((o) => o.organName === 'Environment');
    expect(env?.score).toBe(65); // 100 - 25 - 10

    const doc = result.organs.find((o) => o.organName === 'Documentation');
    expect(doc?.score).toBe(88); // 100 - 10 - 2

    const struct = result.organs.find((o) => o.organName === 'Structure');
    expect(struct?.score).toBe(75); // 100 - 25

    const manifest = result.organs.find((o) => o.organName === 'Manifest');
    expect(manifest?.score).toBe(73); // 100 - 25 - 2

    // Has critical → floor at 50
    expect(result.overallScore).toBeLessThanOrEqual(50);
    expect(result.overallStatus).toBe('Recovery Needed');
  });

  it('no critical findings → score reflects actual penalties', () => {
    const findings = [
      makeFinding('license-missing', 'LICENSE', 'documentation-analyzer'),   // Warning -10
      makeFinding('readme-too-short', 'README.md', 'documentation-analyzer'), // Minor -2
    ];
    const engine = new HealthEngine({
      findings,
      profile: makeProfile(),
      logger,
      eventBus: undefined,
      registry: new RuleWeightRegistry(),
    });
    const result = engine.run();

    // Documentation: 88. No critical → no floor.
    // Overall = 88 (only organ with findings, normalized).
    expect(result.overallScore).toBe(88);
    expect(result.overallStatus).toBe('Healthy');
  });
});
