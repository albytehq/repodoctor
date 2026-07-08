/**
 * Finding store.
 *
 * The in-memory, immutable database of validated findings. Findings are
 * keyed by their deterministic ID (SHA-256 hash of ruleId+target). When
 * a duplicate finding arrives from a different analyzer, the store
 * merges the `analyzerIds` arrays — it never mutates the existing entry.
 *
 * Architectural role: analyzer — pure module aside from internal Map
 * mutation (which is confined to this class). No I/O.
 */

import { createHash } from 'node:crypto';
import type { RawFinding, ValidatedFinding } from '@repodoctor/core/domain/Analysis';

/**
 * The number of hex characters to retain from the full SHA-256 hash for
 * finding IDs. 16 hex chars = 64 bits — sufficient for collision-free
 * deduplication in any practical repository.
 */
const FINDING_ID_LENGTH = 16;

/**
 * Generate a deterministic finding ID from a raw finding.
 *
 * The ID is the SHA-256 hash of `${ruleId}:${target}`, truncated to 16
 * hex characters. The same input always yields the same ID — this is
 * the basis for deduplication.
 *
 * Note: `message` and `metadata` are NOT part of the hash basis. Two
 * findings with the same `ruleId` and `target` but different messages
 * are considered the same finding (the first one wins; the second is
 * merged). This matches the spec: "If two analyzers produce the exact
 * same `RawFinding` (same `ruleId` and `target`), the `FindingStore`
 * merges them."
 */
export function generateFindingId(finding: RawFinding): string {
  const basis = `${finding.ruleId}:${finding.target}`;
  return createHash('sha256').update(basis, 'utf8').digest('hex').slice(0, FINDING_ID_LENGTH);
}

/**
 * The immutable finding store.
 *
 * Findings are added via {@link add}. Once added, a finding's fields
 * never change. When a duplicate (same ID) arrives, a NEW
 * `ValidatedFinding` is created with the merged `analyzerIds` array,
 * replacing the old entry in the internal map.
 */
export class FindingStore {
  private readonly findings: Map<string, ValidatedFinding> = new Map();

  /**
   * Add a raw finding to the store, attributing it to `analyzerId`.
   *
   * If a finding with the same ID already exists (same ruleId and
   * target), the `analyzerId` is appended to the existing finding's
   * `analyzerIds` array (if not already present). The store creates a
   * new `ValidatedFinding` object for the merge — it never mutates the
   * existing one.
   *
   * @returns The `ValidatedFinding` as it exists in the store after this
   *   operation.
   */
  public add(finding: RawFinding, analyzerId: string): ValidatedFinding {
    const id = generateFindingId(finding);
    const existing = this.findings.get(id);

    if (existing === undefined) {
      // New finding.
      const validated: ValidatedFinding = Object.freeze({
        id,
        analyzerIds: Object.freeze([analyzerId]),
        ruleId: finding.ruleId,
        target: finding.target,
        message: finding.message,
        metadata: finding.metadata !== undefined ? Object.freeze({ ...finding.metadata }) : undefined,
      });
      this.findings.set(id, validated);
      return validated;
    }

    // Duplicate finding — merge analyzerIds.
    if (existing.analyzerIds.includes(analyzerId)) {
      // This analyzer already produced this finding. No change needed.
      return existing;
    }

    const merged: ValidatedFinding = Object.freeze({
      ...existing,
      analyzerIds: Object.freeze([...existing.analyzerIds, analyzerId]),
    });
    this.findings.set(id, merged);
    return merged;
  }

  /**
   * Returns all validated findings in the store.
   *
   * The order is insertion order (the Map's natural iteration order).
   * Callers that need deterministic ordering should sort the result.
   */
  public getAll(): readonly ValidatedFinding[] {
    return Array.from(this.findings.values());
  }

  /**
   * Returns all validated findings produced by the given rule ID.
   */
  public getByRule(ruleId: string): readonly ValidatedFinding[] {
    return Array.from(this.findings.values()).filter((f) => f.ruleId === ruleId);
  }

  /**
   * Returns all validated findings targeting the given entity.
   */
  public getByTarget(target: string): readonly ValidatedFinding[] {
    return Array.from(this.findings.values()).filter((f) => f.target === target);
  }

  /**
   * Returns the finding with the given ID, or `undefined` if not found.
   */
  public getById(id: string): ValidatedFinding | undefined {
    return this.findings.get(id);
  }

  /**
   * Returns the number of findings in the store.
   */
  public get size(): number {
    return this.findings.size;
  }
}
