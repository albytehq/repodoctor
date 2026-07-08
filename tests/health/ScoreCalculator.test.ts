/**
 * Unit tests for ScoreCalculator.
 *
 * Coverage:
 *   - calculateOrganScore: penalty deduction, flooring at 0.
 *   - scoreToOrganStatus: threshold mapping.
 *   - scoreToOverallStatus: includes Recovery Needed.
 *   - applyCriticalFloor: caps at 50 when hasCritical is true.
 *   - calculateScores: full pipeline with grouping and normalization.
 *   - hasCriticalFinding.
 *   - groupFindingsByOrgan.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateOrganScore,
  scoreToOrganStatus,
  scoreToOverallStatus,
  applyCriticalFloor,
  calculateScores,
  hasCriticalFinding,
  groupFindingsByOrgan,
} from '@repodoctor/health/ScoreCalculator';
import { RuleWeightRegistry } from '@repodoctor/health/RuleWeightRegistry';
import { makeFinding } from './helpers';

describe('ScoreCalculator', () => {
  const registry = new RuleWeightRegistry();

  describe('calculateOrganScore', () => {
    it('returns 100 when there are no findings', () => {
      expect(calculateOrganScore([], registry)).toBe(100);
    });

    it('deducts 25 for a Critical finding', () => {
      const findings = [makeFinding('env-file-not-ignored', '.env', 'environment-analyzer')];
      expect(calculateOrganScore(findings, registry)).toBe(75);
    });

    it('deducts 10 for a Warning finding', () => {
      const findings = [makeFinding('license-missing', 'LICENSE', 'documentation-analyzer')];
      expect(calculateOrganScore(findings, registry)).toBe(90);
    });

    it('deducts 2 for a Minor finding', () => {
      const findings = [makeFinding('readme-too-short', 'README.md', 'documentation-analyzer')];
      expect(calculateOrganScore(findings, registry)).toBe(98);
    });

    it('deducts 1 for an unknown rule (default)', () => {
      const findings = [makeFinding('unknown-rule', 'x', 'test-analyzer')];
      expect(calculateOrganScore(findings, registry)).toBe(99);
    });

    it('sums penalties for multiple findings', () => {
      const findings = [
        makeFinding('env-file-not-ignored', '.env', 'environment-analyzer'),
        makeFinding('env-example-missing', '.env.example', 'environment-analyzer'),
      ];
      // 25 + 10 = 35 deducted → 65
      expect(calculateOrganScore(findings, registry)).toBe(65);
    });

    it('3 warnings = 70 (acceptance criterion #3)', () => {
      const findings = [
        makeFinding('license-missing', 'LICENSE', 'documentation-analyzer'),
        makeFinding('env-example-missing', '.env.example', 'environment-analyzer'),
        makeFinding('license-missing', 'LICENSE2', 'documentation-analyzer'),
      ];
      // 3 warnings × 10 = 30 deducted → 70
      expect(calculateOrganScore(findings, registry)).toBe(70);
    });

    it('floors at 0 when penalties exceed 100', () => {
      const findings = [
        makeFinding('env-file-not-ignored', '.env', 'environment-analyzer'),
        makeFinding('lockfile-missing', 'package.json', 'manifest-analyzer'),
        makeFinding('gitignore-missing', '.gitignore', 'structure-analyzer'),
        makeFinding('env-file-not-ignored', '.env2', 'environment-analyzer'),
        makeFinding('lockfile-missing', 'package2.json', 'manifest-analyzer'),
      ];
      // 5 × 25 = 125 → floored at 0
      expect(calculateOrganScore(findings, registry)).toBe(0);
    });
  });

  describe('scoreToOrganStatus', () => {
    it('90-100 = Excellent', () => {
      expect(scoreToOrganStatus(100)).toBe('Excellent');
      expect(scoreToOrganStatus(90)).toBe('Excellent');
    });

    it('70-89 = Healthy', () => {
      expect(scoreToOrganStatus(89)).toBe('Healthy');
      expect(scoreToOrganStatus(70)).toBe('Healthy');
    });

    it('50-69 = Warning', () => {
      expect(scoreToOrganStatus(69)).toBe('Warning');
      expect(scoreToOrganStatus(50)).toBe('Warning');
    });

    it('0-49 = Critical', () => {
      expect(scoreToOrganStatus(49)).toBe('Critical');
      expect(scoreToOrganStatus(0)).toBe('Critical');
    });
  });

  describe('scoreToOverallStatus', () => {
    it('returns Recovery Needed when score < 50', () => {
      expect(scoreToOverallStatus(49, false)).toBe('Recovery Needed');
      expect(scoreToOverallStatus(0, false)).toBe('Recovery Needed');
    });

    it('returns Recovery Needed when hasCritical is true (even if score >= 50)', () => {
      expect(scoreToOverallStatus(80, true)).toBe('Recovery Needed');
      expect(scoreToOverallStatus(100, true)).toBe('Recovery Needed');
    });

    it('returns Excellent when score >= 90 and no critical', () => {
      expect(scoreToOverallStatus(90, false)).toBe('Excellent');
      expect(scoreToOverallStatus(100, false)).toBe('Excellent');
    });

    it('returns Healthy when 70-89 and no critical', () => {
      expect(scoreToOverallStatus(89, false)).toBe('Healthy');
    });

    it('returns Warning when 50-69 and no critical', () => {
      expect(scoreToOverallStatus(50, false)).toBe('Warning');
    });
  });

  describe('applyCriticalFloor', () => {
    it('caps at 50 when hasCritical is true', () => {
      expect(applyCriticalFloor(80, true)).toBe(50);
      expect(applyCriticalFloor(100, true)).toBe(50);
    });

    it('does not cap when hasCritical is false', () => {
      expect(applyCriticalFloor(80, false)).toBe(80);
      expect(applyCriticalFloor(100, false)).toBe(100);
    });

    it('does not increase a score below 50', () => {
      expect(applyCriticalFloor(30, true)).toBe(30);
    });

    it('acceptance criterion #4: if any finding is Critical, overall <= 50', () => {
      expect(applyCriticalFloor(90, true)).toBeLessThanOrEqual(50);
      expect(applyCriticalFloor(70, true)).toBeLessThanOrEqual(50);
    });
  });

  describe('hasCriticalFinding', () => {
    it('returns true when a Critical finding is present', () => {
      const findings = [makeFinding('env-file-not-ignored', '.env', 'environment-analyzer')];
      expect(hasCriticalFinding(findings, registry)).toBe(true);
    });

    it('returns false when only Warning/Minor findings', () => {
      const findings = [makeFinding('license-missing', 'LICENSE', 'documentation-analyzer')];
      expect(hasCriticalFinding(findings, registry)).toBe(false);
    });

    it('returns false when no findings', () => {
      expect(hasCriticalFinding([], registry)).toBe(false);
    });
  });

  describe('groupFindingsByOrgan', () => {
    it('groups findings by their analyzer ID → organ name', () => {
      const findings = [
        makeFinding('env-file-not-ignored', '.env', 'environment-analyzer'),
        makeFinding('license-missing', 'LICENSE', 'documentation-analyzer'),
        makeFinding('gitignore-missing', '.gitignore', 'structure-analyzer'),
      ];
      const groups = groupFindingsByOrgan(findings);
      expect(groups.get('Environment')).toHaveLength(1);
      expect(groups.get('Documentation')).toHaveLength(1);
      expect(groups.get('Structure')).toHaveLength(1);
    });

    it('assigns findings with unknown analyzer IDs to Uncategorized', () => {
      const findings = [makeFinding('test-rule', 'x', 'unknown-analyzer')];
      const groups = groupFindingsByOrgan(findings);
      expect(groups.get('Uncategorized')).toHaveLength(1);
    });

    it('assigns findings with multiple analyzer IDs to the first mapped organ', () => {
      const findings = [
        {
          ...makeFinding('env-file-not-ignored', '.env', 'environment-analyzer'),
          analyzerIds: ['environment-analyzer', 'documentation-analyzer'],
        },
      ];
      const groups = groupFindingsByOrgan(findings);
      expect(groups.get('Environment')).toHaveLength(1);
      expect(groups.get('Documentation')).toBeUndefined();
    });
  });

  describe('calculateScores', () => {
    it('returns 100 overall when no findings', () => {
      const result = calculateScores([], registry);
      expect(result.rawOverallScore).toBe(100);
      expect(result.hasCritical).toBe(false);
      expect(result.organs).toHaveLength(0);
    });

    it('calculates organ scores and raw overall', () => {
      const findings = [
        makeFinding('env-file-not-ignored', '.env', 'environment-analyzer'),
        makeFinding('license-missing', 'LICENSE', 'documentation-analyzer'),
      ];
      const result = calculateScores(findings, registry);
      expect(result.organs).toHaveLength(2);

      const env = result.organs.find((o) => o.organName === 'Environment');
      expect(env?.score).toBe(75); // 100 - 25

      const doc = result.organs.find((o) => o.organName === 'Documentation');
      expect(doc?.score).toBe(90); // 100 - 10
    });

    it('sets hasCritical when a Critical finding exists', () => {
      const findings = [
        makeFinding('env-file-not-ignored', '.env', 'environment-analyzer'),
      ];
      const result = calculateScores(findings, registry);
      expect(result.hasCritical).toBe(true);
    });

    it('normalizes the overall score to 0-100', () => {
      // All organs perfect → 100.
      const result = calculateScores([], registry);
      expect(result.rawOverallScore).toBe(100);
    });

    it('sorts organs alphabetically', () => {
      const findings = [
        makeFinding('gitignore-missing', '.gitignore', 'structure-analyzer'),
        makeFinding('env-file-not-ignored', '.env', 'environment-analyzer'),
        makeFinding('license-missing', 'LICENSE', 'documentation-analyzer'),
      ];
      const result = calculateScores(findings, registry);
      const names = result.organs.map((o) => o.organName);
      expect(names).toEqual(['Documentation', 'Environment', 'Structure']);
    });

    it('Uncategorized organs have weight 0 (do not affect overall)', () => {
      const findings = [makeFinding('test-rule', 'x', 'unknown-analyzer')];
      const result = calculateScores(findings, registry);
      // Uncategorized organ exists but weight 0 → overall is 100 (no
      // weighted contribution from uncategorized).
      expect(result.organs.find((o) => o.organName === 'Uncategorized')).toBeDefined();
      // Since usedWeight is 0 for uncategorized, and there are no other
      // organs, the overall defaults to 100.
      expect(result.rawOverallScore).toBe(100);
    });
  });
});
