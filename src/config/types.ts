/**
 * Configuration types.
 *
 * Defines the public shape of the `RepoDoctorConfig` object that every
 * module in the codebase consumes.
 *
 * Architectural role: config (types) — type-only. No runtime exports.
 */

/**
 * Log levels recognized by the logger.
 *
 * `silent` suppresses all output (useful for tests and CI runs that only
 * care about the exit code).
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

/**
 * Discovery-specific configuration.
 *
 * Introduced in v0.0.2. Controls the behavior of the
 * {@link DiscoveryEngine} when scanning the repository root.
 */
export interface DiscoveryConfig {
  /**
   * Directory names to ignore when reading the repository root.
   *
   * The discovery engine filters directories out of `readDir` results
   * anyway (it only captures regular files), so this list is a secondary
   * safeguard against directories that some filesystems report as files
   * (e.g. via symlinks). It also documents the user's intent to ignore
   * certain paths.
   */
  readonly ignoreRoot: readonly string[];
}

/**
 * The complete RepoDoctor configuration object.
 *
 * Every field is `readonly` to make the immutable contract explicit: once
 * a config is loaded and validated, it does not change for the lifetime
 * of the process.
 */
export interface RepoDoctorConfig {
  /** Minimum log level to emit. Lower-priority messages are discarded. */
  readonly logLevel: LogLevel;

  /**
   * If `true`, warnings are promoted to errors during validation. In
   * v0.0.1 this flag is plumbed through but has no behavioral effect
   * beyond being stored on the config object.
   */
  readonly strict: boolean;

  /**
   * List of organ names to enable. In v0.0.1 this MUST be an empty array
   * — organ execution is a v0.1.0 concern. The validator enforces this.
   */
  readonly organs: readonly string[];

  /**
   * Discovery-specific configuration. Introduced in v0.0.2.
   */
  readonly discovery: DiscoveryConfig;

  /**
   * List of plugin module names or paths to load. Introduced in v0.0.8.
   * Default: empty array (no plugins).
   */
  readonly plugins: readonly string[];
}

/**
 * Shape of a raw config value as read from a config file, BEFORE
 * validation. Every field is optional and may be of the wrong type; the
 * validator's job is to either accept and coerce it into a
 * {@link RepoDoctorConfig} or throw a {@link ConfigError}.
 */
export type RawConfig = Partial<{
  logLevel: unknown;
  strict: unknown;
  organs: unknown;
  discovery: unknown;
  plugins: unknown;
}>;

/**
 * Result of a successful validation: the cleaned, typed config plus the
 * list of validation warnings (non-fatal issues that did not block
 * loading but should be surfaced to the user).
 */
export interface ValidationResult {
  readonly config: RepoDoctorConfig;
  readonly warnings: readonly string[];
}
