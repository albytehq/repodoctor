/**
 * Unit tests for TreatmentRegistry and TreatmentEngine.
 */

import { describe, it, expect } from 'vitest';
import { TreatmentRegistry, DEFAULT_TREATMENT_ACTION } from '@repodoctor/treatment/TreatmentRegistry';
import { generateTreatments } from '@repodoctor/treatment/TreatmentEngine';
import { makeFinding, makeOrganDiagnosis, makeDiagnosis, makeProfile } from './helpers';

describe('TreatmentRegistry', () => {
  describe('default mappings', () => {
    const registry = new TreatmentRegistry();

    it('maps env-file-not-ignored to manual', () => {
      const action = registry.getAction('env-file-not-ignored');
      expect(action.type).toBe('manual');
      expect(action.description).toContain('.gitignore');
    });

    it('maps lockfile-missing to command with {lockfileCommand} placeholder', () => {
      const action = registry.getAction('lockfile-missing');
      expect(action.type).toBe('command');
      expect(action.command).toBe('{lockfileCommand}');
      expect(action.description).toContain('{lockfileCommand}');
    });

    it('maps license-missing to manual', () => {
      const action = registry.getAction('license-missing');
      expect(action.type).toBe('manual');
      expect(action.description).toContain('LICENSE');
    });

    it('maps readme-too-short to manual', () => {
      const action = registry.getAction('readme-too-short');
      expect(action.type).toBe('manual');
    });

    it('maps gitignore-missing to command', () => {
      const action = registry.getAction('gitignore-missing');
      expect(action.type).toBe('command');
      expect(action.command).toBe('git init');
    });

    it('maps env-example-missing to manual', () => {
      const action = registry.getAction('env-example-missing');
      expect(action.type).toBe('manual');
    });

    it('maps script-missing-build to manual', () => {
      const action = registry.getAction('script-missing-build');
      expect(action.type).toBe('manual');
    });

    it('has 7 registered treatments (acceptance criterion #5)', () => {
      expect(registry.size).toBe(7);
    });
  });

  describe('fallback for unknown rules', () => {
    it('returns info type for unknown rules', () => {
      const registry = new TreatmentRegistry();
      const action = registry.getAction('unknown-rule');
      expect(action.type).toBe('info');
      expect(action.description).toContain('Review this issue');
    });

    it('DEFAULT_TREATMENT_ACTION is info', () => {
      expect(DEFAULT_TREATMENT_ACTION.type).toBe('info');
    });
  });

  describe('has', () => {
    it('returns true for registered rules', () => {
      const registry = new TreatmentRegistry();
      expect(registry.has('env-file-not-ignored')).toBe(true);
    });

    it('returns false for unknown rules', () => {
      const registry = new TreatmentRegistry();
      expect(registry.has('unknown-rule')).toBe(false);
    });
  });
});

describe('TreatmentEngine (generateTreatments)', () => {
  it('generates a treatment for each finding', () => {
    const findings = [
      makeFinding('env-file-not-ignored', '.env', 'environment-analyzer'),
      makeFinding('license-missing', 'LICENSE', 'documentation-analyzer'),
    ];
    const diagnosis = makeDiagnosis([
      makeOrganDiagnosis('Environment', 75, [findings[0]!]),
      makeOrganDiagnosis('Documentation', 90, [findings[1]!]),
    ]);
    const treatments = generateTreatments({
      diagnosis,
      profile: makeProfile(),
      registry: new TreatmentRegistry(),
    });
    expect(treatments).toHaveLength(2);
  });

  it('substitutes {lockfileCommand} with the correct command for Npm', () => {
    const findings = [makeFinding('lockfile-missing', 'package.json', 'manifest-analyzer')];
    const diagnosis = makeDiagnosis([makeOrganDiagnosis('Manifest', 75, findings)]);
    const treatments = generateTreatments({
      diagnosis,
      profile: makeProfile({ packageManager: 'Npm' }),
      registry: new TreatmentRegistry(),
    });
    expect(treatments[0]!.action.command).toBe('npm install');
    expect(treatments[0]!.action.description).toContain('npm install');
  });

  it('substitutes {lockfileCommand} with the correct command for Pnpm', () => {
    const findings = [makeFinding('lockfile-missing', 'package.json', 'manifest-analyzer')];
    const diagnosis = makeDiagnosis([makeOrganDiagnosis('Manifest', 75, findings)]);
    const treatments = generateTreatments({
      diagnosis,
      profile: makeProfile({ packageManager: 'Pnpm' }),
      registry: new TreatmentRegistry(),
    });
    expect(treatments[0]!.action.command).toBe('pnpm install');
  });

  it('substitutes {lockfileCommand} with cargo generate-lockfile for Rust', () => {
    const findings = [makeFinding('lockfile-missing', 'Cargo.toml', 'manifest-analyzer')];
    const diagnosis = makeDiagnosis([makeOrganDiagnosis('Manifest', 75, findings)]);
    const treatments = generateTreatments({
      diagnosis,
      profile: makeProfile({ packageManager: 'Cargo' }),
      registry: new TreatmentRegistry(),
    });
    expect(treatments[0]!.action.command).toBe('cargo generate-lockfile');
    expect(treatments[0]!.action.description).toContain('cargo generate-lockfile');
  });

  it('substitutes {lockfileCommand} with poetry lock for Poetry', () => {
    const findings = [makeFinding('lockfile-missing', 'pyproject.toml', 'manifest-analyzer')];
    const diagnosis = makeDiagnosis([makeOrganDiagnosis('Manifest', 75, findings)]);
    const treatments = generateTreatments({
      diagnosis,
      profile: makeProfile({ packageManager: 'Poetry' }),
      registry: new TreatmentRegistry(),
    });
    expect(treatments[0]!.action.command).toBe('poetry lock');
  });

  it('substitutes {lockfileCommand} with go mod tidy for Go', () => {
    const findings = [makeFinding('lockfile-missing', 'go.mod', 'manifest-analyzer')];
    const diagnosis = makeDiagnosis([makeOrganDiagnosis('Manifest', 75, findings)]);
    const treatments = generateTreatments({
      diagnosis,
      profile: makeProfile({ packageManager: 'GoModules' }),
      registry: new TreatmentRegistry(),
    });
    expect(treatments[0]!.action.command).toBe('go mod tidy');
  });

  it('returns empty array when diagnosis has no findings', () => {
    const diagnosis = makeDiagnosis([]);
    const treatments = generateTreatments({
      diagnosis,
      profile: makeProfile(),
      registry: new TreatmentRegistry(),
    });
    expect(treatments).toEqual([]);
  });

  it('uses default treatment for unknown rule IDs', () => {
    const findings = [makeFinding('unknown-rule', 'x', 'test-analyzer')];
    const diagnosis = makeDiagnosis([makeOrganDiagnosis('Test', 99, findings)]);
    const treatments = generateTreatments({
      diagnosis,
      profile: makeProfile(),
      registry: new TreatmentRegistry(),
    });
    expect(treatments[0]!.action.type).toBe('info');
    expect(treatments[0]!.action.description).toContain('Review this issue');
  });

  it('preserves findingId and ruleId in the treatment', () => {
    const findings = [makeFinding('env-file-not-ignored', '.env', 'environment-analyzer')];
    const diagnosis = makeDiagnosis([makeOrganDiagnosis('Environment', 75, findings)]);
    const treatments = generateTreatments({
      diagnosis,
      profile: makeProfile(),
      registry: new TreatmentRegistry(),
    });
    expect(treatments[0]!.findingId).toBe(findings[0]!.id);
    expect(treatments[0]!.ruleId).toBe('env-file-not-ignored');
  });

  it('generates treatments for all 7 built-in rule IDs (acceptance #5)', () => {
    const allRules = [
      'env-file-not-ignored',
      'lockfile-missing',
      'license-missing',
      'readme-too-short',
      'gitignore-missing',
      'env-example-missing',
      'script-missing-build',
    ];
    const findings = allRules.map((ruleId, i) =>
      makeFinding(ruleId, `target-${i}`, 'test-analyzer'),
    );
    const diagnosis = makeDiagnosis([makeOrganDiagnosis('Test', 0, findings)]);
    const treatments = generateTreatments({
      diagnosis,
      profile: makeProfile(),
      registry: new TreatmentRegistry(),
    });
    expect(treatments).toHaveLength(7);
    const ruleIds = treatments.map((t) => t.ruleId);
    for (const rule of allRules) {
      expect(ruleIds).toContain(rule);
    }
  });
});
