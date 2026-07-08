/**
 * Scanner registry.
 *
 * Holds all registered {@link IScanner} instances. Built-in scanners are
 * registered synchronously during CLI bootstrap. The registry filters
 * scanners by compatibility with a given {@link RepositoryProfile}.
 *
 * Architectural role: scanner — pure module. No I/O.
 */

import type { RepositoryProfile } from '@repodoctor/core/domain/Discovery';
import type { IScanner } from '@repodoctor/scanner/IScanner';

/**
 * Internal registry of scanners.
 *
 * Backed by a `Map<string, IScanner>` keyed by scanner ID. Duplicate
 * registrations throw — two scanners with the same ID is almost always a
 * bug.
 */
export class ScannerRegistry {
  private readonly scanners: Map<string, IScanner> = new Map();

  /**
   * Register a scanner. Throws if a scanner with the same ID is already
   * registered.
   */
  public register(scanner: IScanner): void {
    if (scanner.id === '') {
      throw new Error('Scanner ID must not be empty.');
    }
    if (this.scanners.has(scanner.id)) {
      throw new Error(`Scanner already registered: ${scanner.id}`);
    }
    this.scanners.set(scanner.id, scanner);
  }

  /**
   * Returns all registered scanners, sorted alphabetically by ID.
   *
   * The sort ensures deterministic execution order (the spec requires
   * alphabetical ordering even though scanners run in parallel).
   */
  public getAll(): readonly IScanner[] {
    // Deterministic lexicographic comparison (localeCompare is
    // locale-dependent and non-deterministic across environments).
    // Equal IDs are impossible (register throws on duplicates).
    return Array.from(this.scanners.values()).sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );
  }

  /**
   * Returns the subset of scanners whose `supports(profile)` method
   * returns `true`, sorted alphabetically by ID.
   */
  public getCompatibleScanners(profile: RepositoryProfile): readonly IScanner[] {
    return this.getAll().filter((s) => s.supports(profile));
  }

  /**
   * Returns the number of registered scanners.
   */
  public get size(): number {
    return this.scanners.size;
  }
}
