/**
 * Default configuration.
 *
 * The baseline that user-supplied config files are deep-merged over. In
 * v0.0.1 the default is the canonical "empty repo, just initialize the
 * foundation" configuration: `info` log level, non-strict mode, no organs.
 *
 * Architectural role: config — pure data, no logic. Per the engineering
 * standards, this module MUST be 100% pure data (no functions, no I/O).
 */

import type { RepoDoctorConfig } from '@repodoctor/config/types';

/**
 * The default list of root-level directories that discovery ignores.
 *
 * These are the directories that essentially every Node.js repository
 * contains and that no one wants to see in a root-file listing.
 */
export const DEFAULT_IGNORE_ROOT: readonly string[] = Object.freeze([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.cache',
]);

/**
 * The built-in default configuration.
 *
 * Exported as a `const` (not a function) so callers can reference it
 * directly. The object is frozen to make the immutability contract
 * explicit at runtime, not just at the type level.
 */
export const DEFAULT_CONFIG: Readonly<RepoDoctorConfig> = Object.freeze({
  logLevel: 'info',
  strict: false,
  organs: Object.freeze([]) as readonly string[],
  discovery: Object.freeze({
    ignoreRoot: DEFAULT_IGNORE_ROOT,
  }),
  plugins: Object.freeze([]) as readonly string[],
});

/**
 * Returns a fresh deep copy of the default config.
 *
 * Callers that intend to mutate the config (e.g. during a merge) should
 * use this helper to avoid accidentally mutating the shared frozen
 * {@link DEFAULT_CONFIG} object.
 */
export function cloneDefaultConfig(): RepoDoctorConfig {
  return {
    logLevel: DEFAULT_CONFIG.logLevel,
    strict: DEFAULT_CONFIG.strict,
    organs: [],
    discovery: {
      ignoreRoot: DEFAULT_IGNORE_ROOT.slice(),
    },
    plugins: [],
  };
}
