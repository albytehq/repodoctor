/**
 * Treatment Registry.
 *
 * Holds the static mapping of `ruleId` to {@link TreatmentAction}. The
 * {@link TreatmentEngine} looks up each finding's ruleId here to
 * produce a {@link Treatment}.
 *
 * Unknown rules default to a generic `info` treatment.
 *
 * Architectural role: treatment — pure data module. No I/O.
 */

import type { TreatmentAction } from '@repodoctor/treatment/types';

/**
 * The default treatment for a rule that has no explicit mapping.
 *
 * Per the v0.0.6 spec: "Any finding without a mapping defaults to:
 * `info`, 'Review this issue and apply best practices.'"
 */
export const DEFAULT_TREATMENT_ACTION: TreatmentAction = Object.freeze({
  type: 'info',
  description: 'Review this issue and apply best practices.',
});

/**
 * The default rule-to-treatment mappings for v0.0.6.
 *
 * Defined statically per the spec. Each entry maps a `ruleId` (produced
 * by a built-in analyzer) to its treatment action.
 */
const DEFAULT_MAPPINGS: ReadonlyMap<string, TreatmentAction> = new Map<string, TreatmentAction>(
  Object.entries({
    'env-file-not-ignored': {
      type: 'manual',
      description: 'Add `.env` to your `.gitignore` file immediately to prevent secret leakage.',
    },
    'lockfile-missing': {
      type: 'command',
      description:
        'Run `{lockfileCommand}` to generate a lockfile and ensure deterministic dependency resolution.',
      command: '{lockfileCommand}',
    },
    'license-missing': {
      type: 'manual',
      description: 'Add a LICENSE file to define the legal usage of your project.',
    },
    'readme-too-short': {
      type: 'manual',
      description:
        'Expand your README.md to include installation, usage, and contribution instructions.',
    },
    'gitignore-missing': {
      type: 'command',
      description: 'Run `git init` or manually create a `.gitignore` file.',
      command: 'git init',
    },
    'env-example-missing': {
      type: 'manual',
      description:
        'Create an `.env.example` file with placeholder values to help onboard new developers.',
    },
    'script-missing-build': {
      type: 'manual',
      description: 'Add a `build` script to your package.json.',
    },
  }),
);

/**
 * Registry that maps rule IDs to their {@link TreatmentAction}.
 */
export class TreatmentRegistry {
  private readonly mappings: Map<string, TreatmentAction>;

  constructor(mappings: ReadonlyMap<string, TreatmentAction> = DEFAULT_MAPPINGS) {
    this.mappings = new Map(mappings);
  }

  /**
   * Look up the treatment action for a given rule ID.
   *
   * Returns the explicit mapping if one exists. Otherwise returns
   * {@link DEFAULT_TREATMENT_ACTION}.
   */
  public getAction(ruleId: string): TreatmentAction {
    const action = this.mappings.get(ruleId);
    if (action !== undefined) {
      return action;
    }
    return DEFAULT_TREATMENT_ACTION;
  }

  /**
   * Returns `true` if an explicit mapping exists for the given rule ID.
   */
  public has(ruleId: string): boolean {
    return this.mappings.has(ruleId);
  }

  /**
   * Returns the number of explicitly registered treatments.
   */
  public get size(): number {
    return this.mappings.size;
  }
}
