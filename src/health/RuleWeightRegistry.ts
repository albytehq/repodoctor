/**
 * Rule Weight Registry.
 *
 * Holds the default mapping of `ruleId` to {@link RuleWeight} (severity
 * + penalty). Unknown rules default to `Minor` with penalty 1.
 *
 * Architectural role: health — pure data module. No I/O, no side effects.
 */

import type { RuleWeight, FindingSeverity } from '@repodoctor/core/domain/Health';

/**
 * The default weight for a rule that has no explicit mapping.
 *
 * Per the v0.0.5 spec: "Any finding encountered that does not have a
 * mapping in the registry defaults to Severity: Minor, Penalty: 1."
 */
export const DEFAULT_RULE_WEIGHT: RuleWeight = Object.freeze({
  ruleId: '__default__',
  severity: 'Minor' as FindingSeverity,
  penalty: 1,
});

/**
 * The default rule-to-weight mappings for v0.0.5.
 *
 * Defined statically per the spec. Each entry maps a `ruleId` (produced
 * by a built-in analyzer) to its severity and penalty.
 */
const DEFAULT_MAPPINGS: ReadonlyMap<string, RuleWeight> = new Map<string, RuleWeight>(
  Object.entries({
    'env-file-not-ignored': { ruleId: 'env-file-not-ignored', severity: 'Critical', penalty: 25 },
    'lockfile-missing': { ruleId: 'lockfile-missing', severity: 'Critical', penalty: 25 },
    'license-missing': { ruleId: 'license-missing', severity: 'Warning', penalty: 10 },
    'readme-too-short': { ruleId: 'readme-too-short', severity: 'Minor', penalty: 2 },
    'gitignore-missing': { ruleId: 'gitignore-missing', severity: 'Critical', penalty: 25 },
    'env-example-missing': { ruleId: 'env-example-missing', severity: 'Warning', penalty: 10 },
    'script-missing-build': { ruleId: 'script-missing-build', severity: 'Minor', penalty: 2 },
  }).map(([k, v]) => [k, Object.freeze(v) as RuleWeight]),
);

/**
 * Registry that maps rule IDs to their {@link RuleWeight}.
 *
 * Constructed once during CLI bootstrap with the default mappings.
 * Future versions may allow user-supplied overrides via config.
 */
export class RuleWeightRegistry {
  private readonly mappings: Map<string, RuleWeight>;

  constructor(mappings: ReadonlyMap<string, RuleWeight> = DEFAULT_MAPPINGS) {
    this.mappings = new Map(mappings);
  }

  /**
   * Look up the weight for a given rule ID.
   *
   * Returns a FROZEN copy of the explicit mapping if one exists.
   * Otherwise returns a new object based on {@link DEFAULT_RULE_WEIGHT}.
   * Returning frozen objects prevents accidental mutation of the shared
   * default mappings.
   */
  public getWeight(ruleId: string): RuleWeight {
    const weight = this.mappings.get(ruleId);
    if (weight !== undefined) {
      return Object.freeze({ ...weight });
    }
    return Object.freeze({ ...DEFAULT_RULE_WEIGHT, ruleId });
  }

  /**
   * Returns `true` if an explicit mapping exists for the given rule ID.
   */
  public has(ruleId: string): boolean {
    return this.mappings.has(ruleId);
  }

  /**
   * Returns the number of explicitly registered rules.
   */
  public get size(): number {
    return this.mappings.size;
  }

  /**
   * Returns a readonly iterator over all registered rule weights.
   */
  public getAll(): readonly RuleWeight[] {
    return Array.from(this.mappings.values());
  }
}
