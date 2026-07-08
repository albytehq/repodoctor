/**
 * Scanner file system interface.
 *
 * Abstracts over `fs/promises` for the scanner engine. Adds:
 *   - Content caching (a file read by 3 scanners is only read from disk once).
 *   - Path safety (paths are resolved relative to `workspace.cwd`; traversal
 *     outside `cwd` throws {@link PermissionError}).
 *   - File size limit (reads exceeding 5MB throw {@link FileSizeExceededError}).
 *   - FS read concurrency queue (prevents exceeding the OS ulimit).
 *
 * Architectural role: core (interface) — defined here so that `scanner/`
 * can depend on the contract without importing from `infrastructure/`.
 * The concrete implementor lives in `@repodoctor/infrastructure/ScannerFileSystem`.
 *
 * Consumers: `scanner/ScannerContext.ts`, built-in scanners.
 * Implementor: `infrastructure/ScannerFileSystem.ts`.
 */

/**
 * Abstract scanner file system contract.
 *
 * All paths are resolved relative to the workspace `cwd`. Path traversal
 * outside `cwd` throws {@link PermissionError}.
 */
export interface IScannerFileSystem {
  /**
   * Read the entire contents of a file as a UTF-8 string.
   *
   * Results are cached: if `readFile('package.json')` is called by
   * multiple scanners, the disk is only hit once.
   *
   * @throws {PermissionError} when the resolved path escapes `cwd`.
   * @throws {FileSizeExceededError} when the file exceeds 5MB.
   * @throws {FileNotFoundError} when the file does not exist.
   */
  readFile(path: string): Promise<string>;

  /**
   * Read a range of lines from a file (1-indexed, inclusive).
   *
   * Intended for large files where reading the entire content would
   * exceed the size limit. The caller specifies `start` and `end` line
   * numbers; the method returns the text of those lines (without
   * trailing newlines).
   *
   * @throws {PermissionError} when the resolved path escapes `cwd`.
   * @throws {FileNotFoundError} when the file does not exist.
   */
  readFileLines(path: string, start: number, end: number): Promise<string[]>;

  /**
   * Returns `true` if a regular file exists at the given path.
   *
   * Results are cached.
   */
  fileExists(path: string): Promise<boolean>;

  /**
   * Returns the size of a file in bytes.
   *
   * Results are cached.
   */
  getFileSize(path: string): Promise<number>;
}
