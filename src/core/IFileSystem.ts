/**
 * File system interface.
 *
 * Abstracts over `fs/promises` so that consumers (the config loader and the
 * discovery engine) can be unit-tested with an in-memory mock. The
 * interface is intentionally minimal: only the operations that v0.0.1 and
 * v0.0.2 actually need.
 *
 * Architectural role: core (interface) — defined here so that the `config`
 * and `discovery` layers (which consume it) do not need to import from
 * `infrastructure`. The concrete implementor lives in
 * `@repodoctor/infrastructure/FileSystem`.
 *
 * Consumers: `config/ConfigLoader.ts`, `discovery/DiscoveryEngine.ts`.
 * Implementor: `infrastructure/FileSystem.ts`.
 */

import type { FileNotFoundError } from '@repodoctor/errors/FileNotFoundError';

/**
 * A single entry in a directory listing. Mirrors the subset of Node's
 * `fs.Dirent` that RepoDoctor actually consumes.
 */
export interface DirEntry {
  /** Entry name (e.g. `package.json` or `src`). Never contains a path separator. */
  readonly name: string;
  /** `true` if the entry is a regular file, `false` if it is a directory or other type. */
  readonly isFile: boolean;
  /** `true` if the entry is a directory, `false` otherwise. */
  readonly isDirectory: boolean;
}

/**
 * A subset of `fs.Stats` that RepoDoctor consumes. Keeping the surface
 * minimal makes mocking trivial and avoids leaking Node internals into
 * the core layer.
 */
export interface FileStats {
  /** Size of the file in bytes. */
  readonly size: number;
  /** The file's modification time in milliseconds since epoch. */
  readonly mtimeMs: number;
  /** `true` if this is a regular file. */
  readonly isFile: boolean;
  /** `true` if this is a directory. */
  readonly isDirectory: boolean;
}

/**
 * Abstract file system contract.
 *
 * Implementations MUST:
 *   - Reject with {@link FileNotFoundError} (not raw `ENOENT`) when a file
 *     does not exist.
 *   - Reject with a descriptive error (not a silent empty string) when a
 *     path resolves to a directory or other non-regular file.
 *   - Return UTF-8 decoded strings; binary reads are not supported.
 */
export interface IFileSystem {
  /**
   * Read the entire contents of a regular file as a UTF-8 string.
   *
   * @throws {FileNotFoundError} when the file does not exist.
   * @throws {Error} for any other I/O failure (permissions, EISDIR, etc.).
   */
  readFile(path: string): Promise<string>;

  /**
   * Returns `true` if a regular file exists at the given path.
   *
   * Returns `false` for directories, broken symlinks, and any other
   * non-regular file types. This is intentionally stricter than
   * `fs.existsSync` — callers should not treat a directory as "present"
   * when they expect a file.
   */
  exists(path: string): Promise<boolean>;

  /**
   * List the entries in a directory (non-recursively).
   *
   * Each entry includes its `isFile` / `isDirectory` flags so callers can
   * filter without issuing extra `stat` calls. Implementations SHOULD use
   * `fs.promises.readdir(path, { withFileTypes: true })` internally to
   * satisfy the performance requirement in section 11 of the v0.0.2 spec.
   *
   * @throws {FileNotFoundError} when the directory does not exist.
   * @throws {Error} for any other I/O failure (permissions, ENOTDIR, etc.).
   */
  readDir(path: string): Promise<readonly DirEntry[]>;

  /**
   * Stat a path, returning its size and type flags.
   *
   * @throws {FileNotFoundError} when the path does not exist.
   * @throws {Error} for any other I/O failure (permissions, etc.).
   */
  stat(path: string): Promise<FileStats>;
}

/**
 * Re-exported so consumers can type-guard against the error thrown by
 * `IFileSystem` methods without importing directly from the `errors`
 * layer (which would still be allowed, but this is more convenient).
 */
export type { FileNotFoundError };
