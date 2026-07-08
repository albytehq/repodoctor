/**
 * Scan result formatter.
 *
 * Converts a {@link ScanResult} into either a human-readable terminal
 * string or a JSON string. Used by the CLI bootstrap when the `--json`
 * flag is (or is not) present.
 *
 * Architectural role: cli — may import from every other layer.
 */

import type { ScanResult, ValidatedFact } from '@repodoctor/core/domain/Scan';

/**
 * Format a {@link ScanResult} as a human-readable terminal string.
 *
 * The format matches the v0.0.3 spec section 14:
 *
 * ```text
 * RepoDoctor — Scanner Engine
 * Patient: my-saas-app | Profile: NodeApplication (TypeScript)
 *
 * Total Facts Collected: 9
 * ```
 */
export function formatScanResult(result: ScanResult): string {
  const lines: string[] = [];

  lines.push('RepoDoctor — Scanner Engine');
  lines.push(`Patient: ${result.patient}`);
  lines.push('');
  lines.push(`Total Facts Collected: ${result.facts.length}`);
  lines.push('');

  // List facts grouped by type.
  const byType = groupByType(result.facts);
  for (const [type, facts] of byType) {
    lines.push(`${type} (${facts.length}):`);
    for (const fact of facts) {
      const valueStr = formatValue(fact.value);
      lines.push(`  ${fact.target} = ${valueStr}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format a {@link ScanResult} as a JSON string.
 *
 * The output strictly matches the `ScanResult` interface — no extra
 * wrapper fields. Pretty-printed with 2-space indentation.
 */
export function formatScanResultJson(result: ScanResult): string {
  return JSON.stringify(result, null, 2);
}

/**
 * Group facts by their `type` field, preserving insertion order.
 */
function groupByType(facts: readonly ValidatedFact[]): Map<string, ValidatedFact[]> {
  const map = new Map<string, ValidatedFact[]>();
  for (const fact of facts) {
    let list = map.get(fact.type);
    if (list === undefined) {
      list = [];
      map.set(fact.type, list);
    }
    list.push(fact);
  }
  return map;
}

/**
 * Format a fact value for terminal display.
 */
function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => JSON.stringify(v)).join(', ')}]`;
  }
  return JSON.stringify(value);
}
