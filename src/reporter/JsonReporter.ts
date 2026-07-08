/**
 * JSON Reporter.
 *
 * Formats a {@link FinalReport} as a strict JSON string. The output
 * matches the {@link FinalReport} schema exactly — no extra wrapper
 * fields.
 *
 * Architectural role: reporter — may import from core, utils, health,
 * treatment. This module imports only type definitions.
 */

import type { FinalReport } from '@repodoctor/treatment/types';

/**
 * A replacer function for `JSON.stringify` that handles circular
 * references by replacing them with `"[Circular]"`. This prevents
 * `TypeError: Converting circular structure to JSON` from crashing the
 * JSON reporter when a plugin analyzer returns a finding with circular
 * metadata.
 */
function circularReplacer(): (this: unknown, key: string, value: unknown) => unknown {
  const seen = new WeakSet<object>();
  return function (this: unknown, _key: string, value: unknown): unknown {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    return value;
  };
}

/**
 * Format a {@link FinalReport} as a JSON string.
 *
 * Pretty-printed with 2-space indentation for readability. Circular
 * references in plugin-supplied finding metadata are replaced with
 * `"[Circular]"` instead of crashing.
 */
export function formatJsonReport(report: FinalReport): string {
  return JSON.stringify(report, circularReplacer(), 2);
}
