/**
 * File system wrapper.
 *
 * Implements {@link IFileSystem} by delegating to `node:fs/promises`. The
 * wrapper translates raw Node errors (notably `ENOENT`) into RepoDoctor's
 * {@link FileNotFoundError} so that the rest of the codebase never sees a
 * raw errno string.
 *
 * Architectural role: infrastructure — may import from core (interfaces
 * only), errors, utils.
 */

import { readFile as nodeReadFile, stat as nodeStat, readdir as nodeReaddir } from 'node:fs/promises';
import type { Dirent, Stats } from 'node:fs';
import type { DirEntry, FileStats, IFileSystem } from '@repodoctor/core/IFileSystem';
import { FileNotFoundError } from '@repodoctor/errors/FileNotFoundError';
import { PermissionError } from '@repodoctor/errors/PermissionError';

/**
 * Concrete implementation of {@link IFileSystem} backed by `node:fs/promises`.
 *
 * The class is intentionally stateless: every method is a thin wrapper
 * around a Node fs function with error translation layered on top.
 */
export class FileSystem implements IFileSystem {
  /**
   * Read the entire contents of a regular file as a UTF-8 string.
   *
   * @throws {FileNotFoundError} when the file does not exist.
   * @throws {Error} with a descriptive message for any other I/O failure
   *   (EISDIR, EACCES, etc.). The original Node error is attached as
   *   `cause`.
   */
  public async readFile(path: string): Promise<string> {
    try {
      const buffer = await nodeReadFile(path, { encoding: 'utf8', flag: 'r' });
      return buffer;
    } catch (error) {
      throw this.translateError(path, error);
    }
  }

  /**
   * Returns `true` if a regular file exists at `path`. Returns `false` for
   * directories, broken symlinks, and any other non-regular file types.
   *
   * Never throws for missing files — that case is the "false" answer. Any
   * other I/O failure (e.g. EACCES) is re-thrown.
   */
  public async exists(path: string): Promise<boolean> {
    try {
      const stats = await nodeStat(path);
      return stats.isFile();
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return false;
      }
      // Re-throw non-ENOENT errors as a generic Error.
      throw new Error(`Failed to stat file: ${path}`, { cause: error });
    }
  }

  /**
   * List the entries in a directory (non-recursively).
   *
   * Uses `fs.promises.readdir(path, { withFileTypes: true })` per the
   * v0.0.2 performance requirement — this avoids one `stat` syscall per
   * entry on most platforms.
   *
   * @throws {FileNotFoundError} when the directory does not exist.
   * @throws {Error} for any other I/O failure (permissions, ENOTDIR, etc.).
   */
  public async readDir(path: string): Promise<readonly DirEntry[]> {
    let dirents: Dirent[];
    try {
      dirents = await nodeReaddir(path, { withFileTypes: true });
    } catch (error) {
      throw this.translateError(path, error);
    }
    // Map Node's `Dirent` into our layer-neutral `DirEntry`. We copy the
    // boolean flags eagerly so the consumer never touches a Node type.
    const out: DirEntry[] = [];
    for (let i = 0; i < dirents.length; i++) {
      const d = dirents[i];
      if (d === undefined) continue;
      out.push({
        name: d.name,
        isFile: d.isFile(),
        isDirectory: d.isDirectory(),
      });
    }
    return out;
  }

  /**
   * Stat a path, returning its size and type flags.
   *
   * @throws {FileNotFoundError} when the path does not exist.
   * @throws {Error} for any other I/O failure (permissions, etc.).
   */
  public async stat(path: string): Promise<FileStats> {
    let stats: Stats;
    try {
      stats = await nodeStat(path);
    } catch (error) {
      throw this.translateError(path, error);
    }
    return {
      size: stats.size,
      mtimeMs: stats.mtimeMs,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
    };
  }

  /**
   * Translate a raw Node fs error into a RepoDoctor error, where applicable.
   *
   * - `ENOENT` → {@link FileNotFoundError}
   * - `EACCES` / `EPERM` → {@link PermissionError}
   * - `EISDIR` → descriptive Error
   * - everything else → descriptive Error with original `cause`
   */
  private translateError(path: string, error: unknown): Error {
    if (this.isNotFoundError(error)) {
      return new FileNotFoundError(path, { cause: error });
    }
    if (this.isPermissionError(error)) {
      return new PermissionError(path, { cause: error });
    }
    if (this.isDirError(error)) {
      return new Error(`Path is a directory, not a file: ${path}`, { cause: error });
    }
    const message = error instanceof Error ? error.message : String(error);
    return new Error(`Failed to read file: ${path} (${message})`, { cause: error });
  }

  private isNotFoundError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'ENOENT'
    );
  }

  private isPermissionError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      ((error as { code?: unknown }).code === 'EACCES' ||
        (error as { code?: unknown }).code === 'EPERM')
    );
  }

  private isDirError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'EISDIR'
    );
  }
}
