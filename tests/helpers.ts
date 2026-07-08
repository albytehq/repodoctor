/**
 * Test helper: in-memory file system mock.
 *
 * Implements the {@link IFileSystem} interface using an in-memory Map.
 * Tests use this to inject controlled file contents without touching
 * the real disk.
 */

import type { DirEntry, FileStats, IFileSystem } from '@repodoctor/core/IFileSystem';
import { FileNotFoundError } from '@repodoctor/errors/FileNotFoundError';

/**
 * Normalize a path to a canonical forward-slash form.
 *
 * The in-memory file system stores paths with forward slashes, but on
 * Windows the `Path` helper produces backslash paths via `path.resolve`
 * and `path.join`, AND `path.resolve` prepends the current drive letter
 * (e.g. `D:`) when given a "Unix-absolute" path like `/foo/bar`. Tests
 * store keys without a drive prefix (e.g. `/repo/repodoctor.config.json`),
 * so without stripping the drive prefix on Windows, lookups would always
 * miss. Normalizing both the stored keys and the lookup keys — backslashes
 * to forward slashes, then strip a leading drive letter — keeps the mock
 * path-agnostic so the same tests pass on every platform.
 */
function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^[a-zA-Z]:/, '');
}

/**
 * Metadata for a file in the in-memory file system.
 */
interface InMemoryFile {
  readonly contents: string;
  readonly size: number;
}

/**
 * In-memory file system. Backed by a `Map<string, InMemoryFile>` keyed by
 * absolute path.
 *
 * Files are added via the constructor or {@link addFile}; the `readFile`,
 * `exists`, `readDir`, and `stat` methods satisfy {@link IFileSystem}.
 */
export class InMemoryFileSystem implements IFileSystem {
  private readonly files: Map<string, InMemoryFile> = new Map();

  constructor(initial: Record<string, string> = {}) {
    for (const [path, contents] of Object.entries(initial)) {
      this.files.set(normalizePath(path), { contents, size: contents.length });
    }
  }

  /**
   * Add a file to the in-memory file system. Overwrites any existing
   * file at the same path.
   */
  public addFile(path: string, contents: string): void {
    this.files.set(normalizePath(path), { contents, size: contents.length });
  }

  /**
   * Remove a file from the in-memory file system. No-op if the file
   * does not exist.
   */
  public removeFile(path: string): void {
    this.files.delete(normalizePath(path));
  }

  public readFile(path: string): Promise<string> {
    const file = this.files.get(normalizePath(path));
    if (file === undefined) {
      return Promise.reject(new FileNotFoundError(path));
    }
    return Promise.resolve(file.contents);
  }

  public exists(path: string): Promise<boolean> {
    return Promise.resolve(this.files.has(normalizePath(path)));
  }

  /**
   * List the entries in a directory (non-recursively).
   *
   * Derives entries from the file map: any file whose path starts with
   * `<path>/` is considered a child. This is a flat approximation —
   * nested directories are not modeled, but that's sufficient for
   * RepoDoctor's tests (discovery only reads the root).
   */
  public readDir(path: string): Promise<readonly DirEntry[]> {
    const normalizedPath = normalizePath(path);
    const prefix = normalizedPath.endsWith('/') ? normalizedPath : normalizedPath + '/';
    const entries: DirEntry[] = [];
    const seen = new Set<string>();
    for (const filePath of this.files.keys()) {
      const normalizedFile = normalizePath(filePath);
      if (!normalizedFile.startsWith(prefix)) {
        continue;
      }
      const remainder = normalizedFile.slice(prefix.length);
      // Only direct children (no further separators).
      const slashIndex = remainder.indexOf('/');
      if (slashIndex !== -1) {
        // This file is in a subdirectory — the subdirectory itself is
        // a child entry.
        const dirName = remainder.slice(0, slashIndex);
        if (!seen.has(dirName)) {
          seen.add(dirName);
          entries.push({ name: dirName, isFile: false, isDirectory: true });
        }
      } else {
        entries.push({ name: remainder, isFile: true, isDirectory: false });
      }
    }
    return Promise.resolve(entries);
  }

  public stat(path: string): Promise<FileStats> {
    const file = this.files.get(normalizePath(path));
    if (file === undefined) {
      return Promise.reject(new FileNotFoundError(path));
    }
    return Promise.resolve({
      size: file.size,
      mtimeMs: Date.now(),
      isFile: true,
      isDirectory: false,
    });
  }
}

/**
 * Test helper: a logger that captures every call for assertions.
 *
 * Implements the {@link ILogger} shape via structural typing.
 */
export class CapturingLogger {
  public readonly calls: Array<{
    level: 'debug' | 'info' | 'warn' | 'error';
    message: string;
    context: object | undefined;
  }> = [];

  public debug(message: string, context?: object): void {
    this.calls.push({ level: 'debug', message, context });
  }
  public info(message: string, context?: object): void {
    this.calls.push({ level: 'info', message, context });
  }
  public warn(message: string, context?: object): void {
    this.calls.push({ level: 'warn', message, context });
  }
  public error(message: string, context?: object): void {
    this.calls.push({ level: 'error', message, context });
  }
}

/**
 * Test helper: a console-like object that captures every write.
 *
 * Used as the `consoleLike` injection for {@link ConsoleTransport} in
 * tests that need to inspect formatted output without touching the real
 * stdout/stderr streams.
 */
export class CapturingConsole {
  public readonly stdout: string[] = [];
  public readonly stderr: string[] = [];

  public log(message: string): void {
    this.stdout.push(message);
  }
  public info(message: string): void {
    this.stdout.push(message);
  }
  public warn(message: string): void {
    this.stderr.push(message);
  }
  public error(message: string): void {
    this.stderr.push(message);
  }
}
