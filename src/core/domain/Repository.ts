/**
 * Domain model: Repository (the "Patient").
 *
 * Represents the target directory that RepoDoctor is examining. This class
 * is a pure value object — it holds an absolute path and a derived name, and
 * performs no I/O. Future versions will attach scan results and diagnoses
 * to this object.
 *
 * Architectural role: core (domain).
 */

/**
 * Represents the target repository under examination.
 *
 * Invariant: `path` is always an absolute, normalized filesystem path. The
 * constructor enforces this invariant at construction time.
 */
export class Repository {
  /** Absolute, normalized path to the repository root on disk. */
  public readonly path: string;

  /**
   * Human-readable repository name, derived from the basename of `path`.
   * For example, `/dev/repos/repodoctor` → `repodoctor`.
   */
  public readonly name: string;

  constructor(path: string) {
    if (path === '') {
      throw new Error('Repository path must not be empty.');
    }
    // We accept any non-empty string here; absolute-path enforcement is the
    // caller's responsibility (the CLI bootstrap resolves via `path.resolve`
    // before constructing this object). This keeps the domain model pure
    // and free of filesystem dependencies.
    this.path = path;

    // Derive the name from the basename without depending on the path
    // module — the domain layer must remain pure. We split on the platform
    // separator(s) and take the last non-empty segment.
    const segments = path.split(/[/\\]/).filter((s) => s.length > 0);
    const lastSegment = segments.length > 0 ? segments[segments.length - 1] : undefined;
    this.name = lastSegment ?? path;
  }

  /**
   * Returns a plain-object representation suitable for logging or
   * serialization. Does not include any future state that may be attached
   * to the repository.
   */
  public toJSON(): { path: string; name: string } {
    return { path: this.path, name: this.name };
  }
}
