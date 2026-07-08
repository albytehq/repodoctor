/**
 * Domain model: Workspace (the operating environment).
 *
 * Represents the runtime environment that RepoDoctor is operating in.
 * Captures the current working directory plus a few CI/interactivity flags
 * that downstream modules use to tailor their behavior.
 *
 * Architectural role: core (domain).
 */

/**
 * Represents the environment the doctor is operating in.
 *
 * Construction is explicit (no hidden reads from `process`) so that the
 * object can be unit-tested deterministically. The CLI bootstrap is
 * responsible for sourcing `cwd`, `isCI`, and `isInteractive` from the
 * appropriate `utils/` helpers and passing them in.
 */
export class Workspace {
  /** Current working directory where the CLI was invoked. */
  public readonly cwd: string;
  /** Whether the process is running inside a CI runner. */
  public readonly isCI: boolean;
  /** Whether stdout is attached to an interactive TTY. */
  public readonly isInteractive: boolean;

  constructor(params: { cwd: string; isCI: boolean; isInteractive: boolean }) {
    if (params.cwd === '') {
      throw new Error('Workspace cwd must not be empty.');
    }
    this.cwd = params.cwd;
    this.isCI = params.isCI;
    this.isInteractive = params.isInteractive;
  }

  /**
   * Returns a plain-object representation suitable for logging or
   * serialization.
   */
  public toJSON(): { cwd: string; isCI: boolean; isInteractive: boolean } {
    return {
      cwd: this.cwd,
      isCI: this.isCI,
      isInteractive: this.isInteractive,
    };
  }
}
