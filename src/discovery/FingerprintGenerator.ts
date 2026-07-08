/**
 * Repository fingerprint generator.
 *
 * Produces a deterministic SHA-256-based fingerprint for a repository.
 * The same repository state (same name, same root file set, same package
 * manager, same monorepo flag) MUST always yield the same hash.
 *
 * Architectural role: discovery — may import from core, infrastructure,
 * errors, utils. This module imports `node:crypto` (a Node built-in,
 * allowed everywhere) and `core/domain/Discovery` (type-only).
 */

import { createHash } from 'node:crypto';
import type {
  RepositoryFingerprint,
  RepositoryProfile,
} from '@repodoctor/core/domain/Discovery';

/**
 * The number of hex characters to retain from the full SHA-256 hash.
 *
 * 16 hex chars = 64 bits of entropy, which is more than enough to
 * distinguish repositories in any practical use case while keeping the
 * fingerprint short and human-readable.
 */
const FINGERPRINT_LENGTH = 16;

/**
 * Generate a deterministic fingerprint for a repository profile.
 *
 * Basis array (per the v0.0.2 spec):
 *   `[repositoryName, ...sortedRootFileNames, packageManager, isMonorepo.toString()]`
 *
 * The basis is joined with `:` and hashed with SHA-256. The first 16 hex
 * characters of the digest are returned as `hash`.
 *
 * @param profile The discovered repository profile.
 * @returns A {@link RepositoryFingerprint} containing the hash and the
 *   sorted basis array.
 */
export function generateFingerprint(profile: RepositoryProfile): RepositoryFingerprint {
  const rootFileNames = profile.rootFiles.map((f) => f.name).sort();
  const basis: string[] = [
    profile.name,
    ...rootFileNames,
    profile.packageManager,
    profile.isMonorepo.toString(),
  ];

  const input = JSON.stringify(basis);
  const fullHash = createHash('sha256').update(input, 'utf8').digest('hex');
  const hash = fullHash.slice(0, FINGERPRINT_LENGTH);

  return {
    hash,
    basis,
  };
}
