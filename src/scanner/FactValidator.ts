/**
 * Fact validator.
 *
 * Inspects every {@link RawFact} before it enters the {@link FactStore}.
 * Invalid facts are rejected (the caller logs a {@link FactValidationError}
 * and discards them).
 *
 * Validation rules (per the v0.0.3 spec):
 *   - `type` must be a non-empty string matching `/^[A-Z_]+$/`.
 *   - `target` must be a non-empty string.
 *   - `value` must not be `undefined` or `null`.
 *   - If `value` is an array, it must not contain `undefined` or `null`.
 *
 * Architectural role: scanner — pure module. No I/O, no side effects.
 */

import type { RawFact } from '@repodoctor/core/domain/Scan';

/**
 * Regex that valid fact types must match: uppercase letters and
 * underscores only, at least one character.
 */
const TYPE_REGEX = /^[A-Z_]+$/;

/**
 * Result of validating a raw fact.
 *
 * - `valid: true` — the fact passed validation.
 * - `valid: false` — the fact was rejected; `reason` explains why.
 */
export type ValidationResult =
  | { readonly valid: true; readonly fact: RawFact }
  | { readonly valid: false; readonly reason: string; readonly field: string };

/**
 * Validate a single raw fact.
 *
 * This is a pure function — it does not throw, does not log, and does
 * not touch the {@link FactStore}. The caller decides what to do with
 * the result.
 */
export function validateFact(fact: RawFact): ValidationResult {
  // --- type ---
  if (typeof fact.type !== 'string') {
    return { valid: false, field: 'type', reason: `must be a string, got ${typeof fact.type}` };
  }
  if (fact.type === '') {
    return { valid: false, field: 'type', reason: 'must not be empty' };
  }
  if (!TYPE_REGEX.test(fact.type)) {
    return {
      valid: false,
      field: 'type',
      reason: `must match ${TYPE_REGEX.source}, got ${JSON.stringify(fact.type)}`,
    };
  }

  // --- target ---
  if (typeof fact.target !== 'string') {
    return { valid: false, field: 'target', reason: `must be a string, got ${typeof fact.target}` };
  }
  if (fact.target === '') {
    return { valid: false, field: 'target', reason: 'must not be empty' };
  }

  // --- value ---
  if (fact.value === undefined) {
    return { valid: false, field: 'value', reason: 'must not be undefined' };
  }
  if (fact.value === null) {
    return { valid: false, field: 'value', reason: 'must not be null' };
  }

  // --- array elements ---
  if (Array.isArray(fact.value)) {
    for (let i = 0; i < fact.value.length; i++) {
      const element: unknown = fact.value[i];
      if (element === undefined) {
        return {
          valid: false,
          field: 'value',
          reason: `array element at index ${i} must not be undefined`,
        };
      }
      if (element === null) {
        return {
          valid: false,
          field: 'value',
          reason: `array element at index ${i} must not be null`,
        };
      }
    }
  }

  return { valid: true, fact };
}
