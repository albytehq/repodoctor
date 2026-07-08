/**
 * Path utility wrapper.
 *
 * Thin wrapper around Node's `node:path` module. Exists so that downstream
 * code does not import `path` directly — every path operation goes through
 * this object, which makes it trivial to mock in tests.
 *
 * Architectural role: infrastructure — may import from core (interfaces
 * only), errors, utils. This module is stateless and pure apart from the
 * underlying `path` calls.
 */

import { resolve as nodeResolve, join as nodeJoin, basename as nodeBasename, dirname as nodeDirname, isAbsolute as nodeIsAbsolute } from 'node:path';

/**
 * Wrapper around the `node:path` module.
 *
 * The class is intentionally simple — it exposes the operations that
 * v0.0.1 needs (`resolve`, `join`, `basename`, `dirname`, `isAbsolute`).
 * Future operations can be added as needed.
 */
export class Path {
  /**
   * Resolves a sequence of path segments into an absolute path. Behaves
   * exactly like `path.resolve`.
   */
  public resolve(...segments: readonly string[]): string {
    return nodeResolve(...segments);
  }

  /**
   * Joins path segments using the platform-appropriate separator. Behaves
   * exactly like `path.join`.
   */
  public join(...segments: readonly string[]): string {
    return nodeJoin(...segments);
  }

  /**
   * Returns the last segment of a path (the "file" or "directory" name).
   * Behaves exactly like `path.basename`.
   */
  public basename(p: string, ext?: string): string {
    if (ext !== undefined) {
      return nodeBasename(p, ext);
    }
    return nodeBasename(p);
  }

  /**
   * Returns the directory portion of a path. Behaves exactly like
   * `path.dirname`.
   */
  public dirname(p: string): string {
    return nodeDirname(p);
  }

  /**
   * Returns `true` if `p` is an absolute path.
   */
  public isAbsolute(p: string): boolean {
    return nodeIsAbsolute(p);
  }
}
