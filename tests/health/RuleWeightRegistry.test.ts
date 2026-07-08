/**
 * Unit tests for RuleWeightRegistry.
 */

import { describe, it, expect } from 'vitest';
import { RuleWeightRegistry, DEFAULT_RULE_WEIGHT } from '@repodoctor/health/RuleWeightRegistry';

describe('RuleWeightRegistry', () => {
  describe('default mappings', () => {
    const registry = new RuleWeightRegistry();

    it('maps env-file-not-ignored to Critical/25', () => {
      const w = registry.getWeight('env-file-not-ignored');
      expect(w.severity).toBe('Critical');
      expect(w.penalty).toBe(25);
    });

    it('maps lockfile-missing to Critical/25', () => {
      const w = registry.getWeight('lockfile-missing');
      expect(w.severity).toBe('Critical');
      expect(w.penalty).toBe(25);
    });

    it('maps license-missing to Warning/10', () => {
      const w = registry.getWeight('license-missing');
      expect(w.severity).toBe('Warning');
      expect(w.penalty).toBe(10);
    });

    it('maps readme-too-short to Minor/2', () => {
      const w = registry.getWeight('readme-too-short');
      expect(w.severity).toBe('Minor');
      expect(w.penalty).toBe(2);
    });

    it('maps gitignore-missing to Critical/25', () => {
      const w = registry.getWeight('gitignore-missing');
      expect(w.severity).toBe('Critical');
      expect(w.penalty).toBe(25);
    });

    it('maps env-example-missing to Warning/10', () => {
      const w = registry.getWeight('env-example-missing');
      expect(w.severity).toBe('Warning');
      expect(w.penalty).toBe(10);
    });

    it('maps script-missing-build to Minor/2', () => {
      const w = registry.getWeight('script-missing-build');
      expect(w.severity).toBe('Minor');
      expect(w.penalty).toBe(2);
    });
  });

  describe('fallback for unknown rules', () => {
    it('returns Minor/1 for unknown rule IDs', () => {
      const registry = new RuleWeightRegistry();
      const w = registry.getWeight('unknown-rule-id');
      expect(w.severity).toBe('Minor');
      expect(w.penalty).toBe(1);
    });

    it('preserves the ruleId in the fallback weight', () => {
      const registry = new RuleWeightRegistry();
      const w = registry.getWeight('some-new-rule');
      expect(w.ruleId).toBe('some-new-rule');
    });

    it('DEFAULT_RULE_WEIGHT is Minor/1', () => {
      expect(DEFAULT_RULE_WEIGHT.severity).toBe('Minor');
      expect(DEFAULT_RULE_WEIGHT.penalty).toBe(1);
    });
  });

  describe('has', () => {
    it('returns true for registered rules', () => {
      const registry = new RuleWeightRegistry();
      expect(registry.has('env-file-not-ignored')).toBe(true);
    });

    it('returns false for unknown rules', () => {
      const registry = new RuleWeightRegistry();
      expect(registry.has('unknown-rule')).toBe(false);
    });
  });

  describe('size', () => {
    it('returns the number of registered rules', () => {
      const registry = new RuleWeightRegistry();
      expect(registry.size).toBe(7);
    });
  });

  describe('getAll', () => {
    it('returns all registered rule weights', () => {
      const registry = new RuleWeightRegistry();
      const all = registry.getAll();
      expect(all.length).toBe(7);
      const ruleIds = all.map((w) => w.ruleId);
      expect(ruleIds).toContain('env-file-not-ignored');
      expect(ruleIds).toContain('lockfile-missing');
    });
  });

  describe('custom mappings', () => {
    it('accepts a custom mapping map', () => {
      const custom = new Map([
        ['custom-rule', { ruleId: 'custom-rule', severity: 'Critical' as const, penalty: 50 }],
      ]);
      const registry = new RuleWeightRegistry(custom);
      expect(registry.getWeight('custom-rule').penalty).toBe(50);
      // Unknown rules still fall back to default.
      expect(registry.getWeight('env-file-not-ignored').severity).toBe('Minor');
      expect(registry.getWeight('env-file-not-ignored').penalty).toBe(1);
    });
  });
});
