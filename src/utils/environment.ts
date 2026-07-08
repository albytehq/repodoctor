/**
 * Environment detection utilities.
 *
 * These helpers are 100% pure: they only read from process.env / process.stdout
 * and return primitive values. No I/O, no side effects, no allocations beyond
 * the return value. They are safe to call from any architectural layer.
 *
 * Architectural role: utils (lowest layer) — may only use Node built-ins.
 */

/**
 * Set of environment variable names that, when present and truthy, indicate the
 * process is running inside a Continuous Integration runner. We check both the
 * generic `CI` flag and the well-known vendor-specific flags.
 */
const CI_ENVIRONMENT_VARS: readonly string[] = [
  'CI',
  'GITHUB_ACTIONS',
  'GITLAB_CI',
  'CIRCLECI',
  'JENKINS_URL',
  'BUILDKITE',
  'DRONE',
] as const;

/**
 * Returns true when the process is running inside a CI runner.
 *
 * Detection is performed by checking for the presence of well-known CI
 * environment variables. Any non-empty value is treated as a positive signal
 * (CI runners typically set these to "true", but some set them to other
 * truthy strings such as a build identifier).
 *
 * @returns `true` if any known CI environment variable is set to a truthy value.
 */
export function isCI(): boolean {
  for (const key of CI_ENVIRONMENT_VARS) {
    const value = process.env[key];
    if (value !== undefined && value !== '' && value !== 'false' && value !== '0') {
      return true;
    }
  }
  return false;
}

/**
 * Returns true when the CLI is attached to an interactive TTY.
 *
 * An interactive TTY means the user can see colored output and respond to
 * prompts. In CI environments, pipes, redirects, and test runners, this is
 * typically false. We rely on Node's `process.stdout.isTTY` flag, which is
 * `undefined` when stdout is not a TTY.
 *
 * @returns `true` if stdout is attached to an interactive terminal.
 */
export function isInteractive(): boolean {
  return Boolean(process.stdout?.isTTY);
}

/**
 * Returns true when debug mode is enabled.
 *
 * Debug mode is enabled when:
 *   - the `--debug` flag is present anywhere in `process.argv`, OR
 *   - the `DEBUG` environment variable is set to a truthy value.
 *
 * Note: this function performs a shallow scan of `process.argv`; deeper
 * argument parsing is the responsibility of the CLI ArgumentParser.
 *
 * @returns `true` if debug output should be emitted.
 */
export function isDebug(): boolean {
  if (process.argv.includes('--debug')) {
    return true;
  }
  const debugEnv = process.env.DEBUG;
  return debugEnv !== undefined && debugEnv !== '' && debugEnv !== 'false' && debugEnv !== '0';
}
