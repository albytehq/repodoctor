/**
 * Fact store.
 *
 * The in-memory, immutable database of validated facts. Facts are keyed
 * by their deterministic ID (SHA-256 hash of type+target+value). When a
 * duplicate fact arrives from a different scanner, the store merges the
 * `scannerIds` arrays — it never mutates the existing entry.
 *
 * Architectural role: scanner — pure module aside from internal Map
 * mutation (which is confined to this class). No I/O.
 */

import { createHash } from 'node:crypto';
import type { RawFact, ValidatedFact } from '@repodoctor/core/domain/Scan';

/**
 * The number of hex characters to retain from the full SHA-256 hash for
 * fact IDs. 16 hex chars = 64 bits — sufficient for collision-free
 * deduplication in any practical repository.
 */
const FACT_ID_LENGTH = 16;

/**
 * Generate a deterministic fact ID from a raw fact.
 *
 * The ID is the SHA-256 hash of `${type}:${target}:${stableStringify(value)}`,
 * truncated to 16 hex characters. The same input always yields the same
 * ID — this is the basis for deduplication.
 *
 * We use `stableStringify` (which sorts object keys) instead of
 * `JSON.stringify` (which uses insertion order) so that two facts with
 * the same logical value but different key insertion order produce the
 * same ID and are correctly deduplicated.
 */
export function generateFactId(fact: RawFact): string {
  const basis = `${fact.type}:${fact.target}:${stableStringify(fact.value)}`;
  return createHash('sha256').update(basis, 'utf8').digest('hex').slice(0, FACT_ID_LENGTH);
}

/**
 * Recursively freeze an object (and all nested objects/arrays) so it
 * cannot be mutated after being stored in the {@link FactStore}.
 *
 * Includes cycle detection to prevent stack overflow on cyclic fact
 * values (which can be produced by buggy plugins).
 */
function deepFreeze<T>(obj: T, seen: WeakSet<object> = new WeakSet()): T {
  if (obj === null || typeof obj !== 'object') return obj;
  const objAsObject = obj as object;
  if (seen.has(objAsObject)) return obj; // cycle — don't recurse again
  seen.add(objAsObject);
  if (Array.isArray(obj)) {
    (obj as unknown[]).forEach((item: unknown) => deepFreeze(item, seen));
    return Object.freeze(obj) as T;
  }
  const record = obj as Record<string, unknown>;
  Object.keys(record).forEach(key => {
    deepFreeze(record[key], seen);
  });
  return Object.freeze(obj) as T;
}

/**
 * Deterministic JSON serialization. Object keys are sorted alphabetically
 * at every level, so two objects with the same keys/values but different
 * insertion order produce the same string. This is essential for
 * deterministic fact IDs.
 *
 * Circular references are replaced with `"[Circular]"` to prevent
 * infinite recursion.
 */
function stableStringify(value: unknown, seen: WeakSet<object> = new WeakSet()): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  // After the guard above, `value` is narrowed to `object`.
  if (seen.has(value)) {
    return '"[Circular]"';
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const items = value.map((v) => stableStringify(v, seen));
      return `[${items.join(',')}]`;
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const pairs = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(record[k], seen)}`);
    return `{${pairs.join(',')}}`;
  } finally {
    seen.delete(value);
  }
}

/**
 * The immutable fact store.
 *
 * Facts are added via {@link add}. Once added, a fact's fields never
 * change. When a duplicate (same ID) arrives, a NEW `ValidatedFact` is
 * created with the merged `scannerIds` array, replacing the old entry
 * in the internal map.
 */
export class FactStore {
  private readonly facts: Map<string, ValidatedFact> = new Map();

  /**
   * Add a raw fact to the store, attributing it to `scannerId`.
   *
   * If a fact with the same ID already exists (same type, target, value),
   * the `scannerId` is appended to the existing fact's `scannerIds` array
   * (if not already present). The store creates a new `ValidatedFact`
   * object for the merge — it never mutates the existing one.
   *
   * @returns The `ValidatedFact` as it exists in the store after this
   *   operation.
   */
  public add(fact: RawFact, scannerId: string): ValidatedFact {
    const id = generateFactId(fact);
    const existing = this.facts.get(id);
    const observedAt = new Date().toISOString();

    if (existing === undefined) {
      // New fact.
      const validated: ValidatedFact = Object.freeze({
        id,
        scannerIds: Object.freeze([scannerId]),
        type: fact.type,
        target: fact.target,
        value: deepFreeze(fact.value),
        observedAt,
      });
      this.facts.set(id, validated);
      return validated;
    }

    // Duplicate fact — merge scannerIds.
    if (existing.scannerIds.includes(scannerId)) {
      // This scanner already contributed this fact. No change needed.
      return existing;
    }

    const merged: ValidatedFact = Object.freeze({
      ...existing,
      scannerIds: Object.freeze([...existing.scannerIds, scannerId]),
    });
    this.facts.set(id, merged);
    return merged;
  }

  /**
   * Returns all validated facts in the store.
   *
   * The order is insertion order (the Map's natural iteration order).
   * Callers that need deterministic ordering should sort the result.
   */
  public getAll(): readonly ValidatedFact[] {
    return Array.from(this.facts.values());
  }

  /**
   * Returns all validated facts of the given type.
   */
  public getByType(type: string): readonly ValidatedFact[] {
    return Array.from(this.facts.values()).filter((f) => f.type === type);
  }

  /**
   * Returns all validated facts whose `target` matches the given value.
   *
   * Introduced in v0.0.4 to support the {@link IFactStore} interface
   * consumed by analyzers.
   */
  public getByTarget(target: string): readonly ValidatedFact[] {
    return Array.from(this.facts.values()).filter((f) => f.target === target);
  }

  /**
   * Returns `true` if at least one fact with the given `type` and
   * `target` exists in the store.
   *
   * Introduced in v0.0.4 to support the {@link IFactStore} interface
   * consumed by analyzers. Short-circuits on the first match.
   */
  public hasFact(type: string, target: string): boolean {
    for (const fact of this.facts.values()) {
      if (fact.type === type && fact.target === target) {
        return true;
      }
    }
    return false;
  }

  /**
   * Returns the fact with the given ID, or `undefined` if not found.
   */
  public getById(id: string): ValidatedFact | undefined {
    return this.facts.get(id);
  }

  /**
   * Returns the number of facts in the store.
   */
  public get size(): number {
    return this.facts.size;
  }
}
