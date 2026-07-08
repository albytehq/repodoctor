/**
 * Repository Discovery domain model.
 *
 * Pure type definitions — no logic, no I/O. These types describe the
 * shape of a "Repository Profile" produced by the v0.0.2 discovery
 * pipeline. The actual detection logic lives in `@repodoctor/discovery/*`.
 *
 * Architectural role: core (domain) — type-only. Every layer may depend
 * on these types because every layer may depend on `core`.
 */

/**
 * The high-level classification of a repository.
 *
 * - `NodeApplication` — a single Node.js project (has `package.json`,
 *   no workspaces).
 * - `NodeMonorepo` — a Node.js project that orchestrates multiple
 *   sub-packages (has `workspaces` in `package.json`, `lerna.json`, or
 *   `pnpm-workspace.yaml`).
 * - `Unknown` — no `package.json` was found at the repository root.
 */
export type RepositoryType =
  | 'NodeApplication'
  | 'NodeMonorepo'
  | 'PythonApplication'
  | 'GoApplication'
  | 'RustApplication'
  | 'Unknown';

/**
 * The package manager in use, inferred from lockfile presence and the
 * `packageManager` field in `package.json`.
 *
 * - `Npm` — `package-lock.json` is present.
 * - `Yarn` — `yarn.lock` is present.
 * - `Pnpm` — `pnpm-lock.yaml` is present.
 * - `Bun` — `bun.lockb` is present.
 * - `Pip` — `requirements.txt` is present (Python).
 * - `Poetry` — `poetry.lock` is present (Python).
 * - `GoModules` — `go.mod` is present (Go).
 * - `Cargo` — `Cargo.toml` is present (Rust).
 * - `Unknown` — no lockfile or manifest was found.
 */
export type PackageManager =
  | 'Npm'
  | 'Yarn'
  | 'Pnpm'
  | 'Bun'
  | 'Pip'
  | 'Poetry'
  | 'GoModules'
  | 'Cargo'
  | 'Unknown';

/**
 * The primary language(s) detected at the repository root.
 *
 * - `TypeScript` — `tsconfig.json` is present.
 * - `JavaScript` — `package.json` is present but `tsconfig.json` is not.
 * - `Python` — `requirements.txt` or `pyproject.toml` is present.
 * - `Go` — `go.mod` is present.
 * - `Rust` — `Cargo.toml` is present.
 * - `Unknown` — none of the above is present.
 */
export type Language = 'TypeScript' | 'JavaScript' | 'Python' | 'Go' | 'Rust' | 'Unknown';

/**
 * A regular file discovered at the repository root.
 *
 * `size` is in bytes. `path` is always absolute.
 */
export interface DiscoveredFile {
  /** File name (e.g. `package.json`). Never contains a path separator. */
  readonly name: string;
  /** Absolute path to the file. */
  readonly path: string;
  /** File size in bytes. */
  readonly size: number;
}

/**
 * A configuration file whose presence (or absence) is meaningful for
 * discovery. Unlike {@link DiscoveredFile}, we only care whether it
 * exists — not its contents or size.
 */
export interface DiscoveredConfig {
  /** Config file name (e.g. `tsconfig.json`). */
  readonly name: string;
  /** `true` if the file exists at the repository root. */
  readonly exists: boolean;
}

/**
 * Confidence level for a framework guess.
 *
 * - `High` — the framework package was found in `dependencies`.
 * - `Low` — the framework package was found only in `devDependencies`.
 */
export type FrameworkConfidence = 'High' | 'Low';

/**
 * A single framework hint, derived from dependency presence.
 */
export interface FrameworkGuess {
  /** Human-readable framework name (e.g. `Next.js`). */
  readonly name: string;
  /** Confidence level — see {@link FrameworkConfidence}. */
  readonly confidence: FrameworkConfidence;
}

/**
 * The complete profile of a discovered repository.
 *
 * This is the v0.0.2 answer to the question "What kind of patient is
 * this?". It contains NO health scoring, NO diagnosis, and NO
 * treatment recommendations — those are future-version concerns.
 */
export interface RepositoryProfile {
  /** Repository name (from `package.json#name`, or the folder name as fallback). */
  readonly name: string;
  /** High-level classification. */
  readonly type: RepositoryType;
  /** Detected languages. May contain more than one entry. */
  readonly languages: readonly Language[];
  /** Detected package manager. */
  readonly packageManager: PackageManager;
  /** `true` if the repository is a monorepo. */
  readonly isMonorepo: boolean;
  /** Workspace glob patterns (empty unless `isMonorepo` is `true`). */
  readonly workspaces: readonly string[];
  /** Framework hints, in detection order. */
  readonly frameworks: readonly FrameworkGuess[];
  /** Regular files discovered at the root (capped at 50 entries). */
  readonly rootFiles: readonly DiscoveredFile[];
  /** Config files whose presence was probed. */
  readonly configFiles: readonly DiscoveredConfig[];
}

/**
 * A deterministic fingerprint for a repository.
 *
 * The same repository state (same name, same root file set, same package
 * manager, same monorepo flag) MUST always yield the same `hash`.
 */
export interface RepositoryFingerprint {
  /** SHA-256 hash, truncated to 16 hex characters. */
  readonly hash: string;
  /** Sorted array of strings used as the hash basis (joined with `:`). */
  readonly basis: readonly string[];
}

/**
 * The complete result of a discovery run.
 *
 * Returned by `DiscoveryEngine.run()` and emitted as the payload of the
 * `DiscoveryComplete` event.
 */
export interface DiscoveryResult {
  /** The discovered repository profile. */
  readonly profile: RepositoryProfile;
  /** The deterministic repository fingerprint. */
  readonly fingerprint: RepositoryFingerprint;
  /** ISO-8601 timestamp marking when discovery completed. */
  readonly discoveredAt: string;
}
