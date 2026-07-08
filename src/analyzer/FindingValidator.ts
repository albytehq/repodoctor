/**
 * Finding validator.
 *
 * Inspects every {@link RawFinding} before it enters the
 * {@link FindingStore}. Invalid findings are rejected (the caller logs
 * a {@link FindingValidationError} and discards them).
 *
 * Validation rules (per the v0.0.4 spec):
 *   - `ruleId` must be a non-empty string matching
 *     `^[a-z0-9]+(-[a-z0-9]+)*$` (kebab-case).
 *   - `target` must be a non-empty string.
 *   - `message` must be a non-empty string.
 *   - `metadata` is optional but, when present, must be a record
 *     (non-null object, non-array).
 *
 * Architectural role: analyzer — pure module. No I/O, no side effects.
 */

import type { RawFinding } from '@repodoctor/core/domain/Analysis';

/**
 * Regex that valid rule IDs must match: kebab-case (lowercase letters
 * and digits, separated by single hyphens). Examples:
 *   - `env-file-not-ignored` ✓
 *   - `lockfile-missing` ✓
 *   - `EnvFileNotIgnored` ✗ (uppercase)
 *   - `env_file_not_ignored` ✗ (underscores)
 *   - `-env` ✗ (leading hyphen)
 *   - `env-` ✗ (trailing hyphen)
 *   - `env--file` ✗ (double hyphen)
 */
const RULE_ID_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Result of validating a raw finding.
 *
 * - `valid: true` — the finding passed validation.
 * - `valid: false` — the finding was rejected; `reason` explains why.
 */
export type ValidationResult =
  | { readonly valid: true; readonly finding: RawFinding }
  | { readonly valid: false; readonly reason: string; readonly field: string };

/**
 * Validate a single raw finding.
 *
 * This is a pure function — it does not throw, does not log, and does
 * not touch the {@link FindingStore}. The caller decides what to do
 * with the result.
 */
export function validateFinding(finding: RawFinding): ValidationResult {
  // --- ruleId ---
  if (typeof finding.ruleId !== 'string') {
    return { valid: false, field: 'ruleId', reason: `must be a string, got ${typeof finding.ruleId}` };
  }
  if (finding.ruleId === '') {
    return { valid: false, field: 'ruleId', reason: 'must not be empty' };
  }
  if (!RULE_ID_REGEX.test(finding.ruleId)) {
    return {
      valid: false,
      field: 'ruleId',
      reason: `must be kebab-case matching ${RULE_ID_REGEX.source}, got ${JSON.stringify(finding.ruleId)}`,
    };
  }

  // --- target ---
  if (typeof finding.target !== 'string') {
    return { valid: false, field: 'target', reason: `must be a string, got ${typeof finding.target}` };
  }
  if (finding.target === '') {
    return { valid: false, field: 'target', reason: 'must not be empty' };
  }

  // --- message ---
  if (typeof finding.message !== 'string') {
    return { valid: false, field: 'message', reason: `must be a string, got ${typeof finding.message}` };
  }
  if (finding.message === '') {
    return { valid: false, field: 'message', reason: 'must not be empty' };
  }

  // --- metadata (optional) ---
  if (finding.metadata !== undefined) {
    if (finding.metadata === null) {
      return { valid: false, field: 'metadata', reason: 'must not be null (omit if unused)' };
    }
    if (typeof finding.metadata !== 'object' || Array.isArray(finding.metadata)) {
      return {
        valid: false,
        field: 'metadata',
        reason: `must be a record (object), got ${Array.isArray(finding.metadata) ? 'array' : typeof finding.metadata}`,
      };
    }
  }

  return { valid: true, finding };
}
