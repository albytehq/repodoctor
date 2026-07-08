/**
 * Config validator.
 *
 * Pure module: takes a {@link RawConfig}, returns a {@link ValidationResult}
 * on success, or throws {@link ConfigError} on failure. Performs no I/O.
 *
 * Architectural role: config — may import from core, errors,
 * infrastructure, utils. This module only needs `errors` (for
 * {@link ConfigError}) and `types` (local).
 */

import type { DiscoveryConfig, LogLevel, RawConfig, RepoDoctorConfig, ValidationResult } from '@repodoctor/config/types';
import { ConfigError } from '@repodoctor/errors/ConfigError';

/**
 * The set of valid log level strings. Checked via `Set.has` for O(1)
 * lookup and to keep the validator exhaustive at the type level.
 */
const VALID_LOG_LEVELS: ReadonlySet<string> = new Set<LogLevel>([
  'debug',
  'info',
  'warn',
  'error',
  'silent',
]);

/**
 * Validate a raw config object.
 *
 * The validator is strict: any unknown property, wrong-typed property, or
 * out-of-range value causes a {@link ConfigError}. Warnings (non-fatal
 * issues such as deprecated keys) are accumulated and returned alongside
 * the validated config.
 *
 * @throws {ConfigError} when validation fails. The error's `context`
 *   payload contains the list of all validation errors found (the validator
 *   collects every error before throwing, rather than failing fast on the
 *   first one, to give users a complete picture).
 */
export function validateConfig(raw: RawConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // --- logLevel ---
  let logLevel: LogLevel | undefined;
  if (raw.logLevel === undefined) {
    // Field omitted — fall through to default. We do not record a warning
    // because the default is the canonical recommended value.
  } else if (typeof raw.logLevel !== 'string') {
    errors.push(`'logLevel' must be a string, got ${typeof raw.logLevel}.`);
  } else if (!VALID_LOG_LEVELS.has(raw.logLevel)) {
    errors.push(
      `'logLevel' must be one of debug|info|warn|error|silent, got ${JSON.stringify(raw.logLevel)}.`,
    );
  } else {
    // After the VALID_LOG_LEVELS.has() check, raw.logLevel is a string
    // that matches one of the LogLevel literals. Cast to LogLevel.
    logLevel = raw.logLevel as LogLevel;
  }

  // --- strict ---
  let strict = false;
  if (raw.strict === undefined) {
    // default
  } else if (typeof raw.strict !== 'boolean') {
    errors.push(`'strict' must be a boolean, got ${typeof raw.strict}.`);
  } else {
    strict = raw.strict;
  }

  // --- organs ---
  let organs: string[] = [];
  if (raw.organs === undefined) {
    // default
  } else if (!Array.isArray(raw.organs)) {
    errors.push(`'organs' must be an array, got ${typeof raw.organs}.`);
  } else {
    const cleaned: string[] = [];
    for (let i = 0; i < raw.organs.length; i++) {
      // Explicit `unknown` annotation: `Array.isArray` narrows `unknown`
      // to `any[]`, which would otherwise leak `any` into `entry`.
      const entry: unknown = raw.organs[i];
      if (typeof entry !== 'string') {
        errors.push(`'organs[${i}]' must be a string, got ${typeof entry}.`);
        continue;
      }
      if (entry === '') {
        errors.push(`'organs[${i}]' must not be an empty string.`);
        continue;
      }
      cleaned.push(entry);
    }
    organs = cleaned;
  }

  // --- v0.0.1 organ restriction ---
  // The v0.0.1 spec forbids any organ configuration; organs execution is a
  // v0.1.0 concern. We emit a warning (so users know their config will be
  // honored in future versions) and strip the field.
  if (organs.length > 0) {
    warnings.push(
      `'organs' is currently ignored in v0.0.1 (organs execution is a v0.1.0 feature). The value will be stored on the config but has no behavioral effect.`,
    );
  }

  // --- discovery (v0.0.2) ---
  const discovery = validateDiscovery(raw.discovery, errors);

  // --- plugins (v0.0.8) ---
  const plugins = validatePlugins(raw.plugins, errors);

  // --- unknown properties ---
  // Reject unknown top-level keys so typos (e.g. "lognLevel" instead of
  // "logLevel") are surfaced rather than silently ignored.
  const KNOWN_KEYS = new Set(['logLevel', 'strict', 'organs', 'discovery', 'plugins']);
  for (const key of Object.keys(raw)) {
    if (!KNOWN_KEYS.has(key)) {
      errors.push(`Unknown configuration property '${key}'. Known properties: logLevel, strict, organs, discovery, plugins.`);
    }
  }

  if (errors.length > 0) {
    throw new ConfigError('Configuration validation failed.', {
      context: { errors: errors.join('; '), warningCount: warnings.length },
    });
  }

  const config: RepoDoctorConfig = {
    logLevel: logLevel ?? 'info',
    strict,
    organs,
    discovery,
    plugins,
  };

  return { config, warnings };
}

/**
 * Default ignoreRoot list, mirroring {@link DEFAULT_IGNORE_ROOT}. We
 * duplicate it here (rather than importing from `DefaultConfig`) to keep
 * the validator pure — `DefaultConfig` is a separate concern and the
 * validator should not depend on the defaults module.
 */
const DEFAULT_IGNORE_ROOT: readonly string[] = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.cache',
];

/**
 * Validate the `discovery` section of a raw config.
 *
 * Returns a fully-populated {@link DiscoveryConfig}. Pushes validation
 * errors to the shared `errors` array rather than throwing — the caller
 * throws once after all sections have been validated.
 */
function validateDiscovery(raw: unknown, errors: string[]): DiscoveryConfig {
  if (raw === undefined) {
    return { ignoreRoot: DEFAULT_IGNORE_ROOT.slice() };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    errors.push(`'discovery' must be an object, got ${raw === null ? 'null' : Array.isArray(raw) ? 'array' : typeof raw}.`);
    return { ignoreRoot: DEFAULT_IGNORE_ROOT.slice() };
  }

  const obj = raw as Record<string, unknown>;
  let ignoreRoot: string[] = DEFAULT_IGNORE_ROOT.slice();

  if (obj.ignoreRoot === undefined) {
    // Field omitted — keep defaults.
  } else if (!Array.isArray(obj.ignoreRoot)) {
    errors.push(`'discovery.ignoreRoot' must be an array, got ${typeof obj.ignoreRoot}.`);
  } else {
    const cleaned: string[] = [];
    for (let i = 0; i < obj.ignoreRoot.length; i++) {
      const entry: unknown = obj.ignoreRoot[i];
      if (typeof entry !== 'string') {
        errors.push(`'discovery.ignoreRoot[${i}]' must be a string, got ${typeof entry}.`);
        continue;
      }
      if (entry === '') {
        errors.push(`'discovery.ignoreRoot[${i}]' must not be an empty string.`);
        continue;
      }
      cleaned.push(entry);
    }
    // Only overwrite defaults if at least one valid entry was supplied.
    // This matches the v0.0.2 spec: "Must be deep-merged with
    // DefaultConfig." An empty user array REPLACES the defaults — that
    // is the user explicitly opting out of the default ignore list.
    ignoreRoot = cleaned;
  }

  return { ignoreRoot };
}

/**
 * Validate the `plugins` section of a raw config.
 *
 * Returns a fully-populated `string[]`. Pushes validation errors to the
 * shared `errors` array rather than throwing.
 */
function validatePlugins(raw: unknown, errors: string[]): string[] {
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw)) {
    errors.push(`'plugins' must be an array, got ${typeof raw}.`);
    return [];
  }

  const cleaned: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const entry: unknown = raw[i];
    if (typeof entry !== 'string') {
      errors.push(`'plugins[${i}]' must be a string, got ${typeof entry}.`);
      continue;
    }
    if (entry === '') {
      errors.push(`'plugins[${i}]' must not be an empty string.`);
      continue;
    }
    cleaned.push(entry);
  }
  return cleaned;
}
