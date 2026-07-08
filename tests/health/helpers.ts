/**
 * Test helper: create ValidatedFinding objects for health tests.
 */

import type { ValidatedFinding } from '@repodoctor/core/domain/Analysis';

export function makeFinding(
  ruleId: string,
  target: string,
  analyzerId: string = 'test-analyzer',
  message: string = 'test message',
): ValidatedFinding {
  return {
    id: `${ruleId}:${target}`,
    analyzerIds: [analyzerId],
    ruleId,
    target,
    message,
  };
}
