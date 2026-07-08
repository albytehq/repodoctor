/**
 * Treatment Engine.
 *
 * Iterates over all findings in a {@link MedicalDiagnosis} and produces
 * a {@link Treatment} for each one, using the {@link TreatmentRegistry}
 * to look up the appropriate action.
 *
 * The engine also substitutes placeholders in treatment descriptions
 * (e.g. `{packageManager}`) with values from the repository profile.
 *
 * Architectural role: treatment — may import from core, utils, errors,
 * analyzer, health. This module imports the registry, types, and core
 * domain types. It performs NO I/O.
 */

import type { MedicalDiagnosis } from '@repodoctor/core/domain/Health';
import type { RepositoryProfile } from '@repodoctor/core/domain/Discovery';
import type { Treatment, TreatmentAction } from '@repodoctor/treatment/types';
import type { TreatmentRegistry } from '@repodoctor/treatment/TreatmentRegistry';

/**
 * Parameters for the treatment engine.
 */
export interface TreatmentEngineParams {
  readonly diagnosis: MedicalDiagnosis;
  readonly profile: RepositoryProfile;
  readonly registry: TreatmentRegistry;
}

/**
 * Generate treatments for all findings in a diagnosis.
 *
 * This is a pure function: it takes a diagnosis + profile + registry
 * and returns an array of treatments. No I/O, no side effects.
 */
export function generateTreatments(params: TreatmentEngineParams): readonly Treatment[] {
  const { diagnosis, profile, registry } = params;
  const treatments: Treatment[] = [];

  // Collect all findings from all organs.
  for (const organ of diagnosis.organs) {
    for (const finding of organ.findings) {
      const action = registry.getAction(finding.ruleId);
      const substitutedAction = substitutePlaceholders(action, profile);
      treatments.push({
        findingId: finding.id,
        ruleId: finding.ruleId,
        action: substitutedAction,
      });
    }
  }

  return treatments;
}

/**
 * Map a package manager to its lockfile generation command.
 */
function getLockfileCommand(packageManager: string): string {
  switch (packageManager) {
    case 'Npm':
      return 'npm install';
    case 'Yarn':
      return 'yarn install';
    case 'Pnpm':
      return 'pnpm install';
    case 'Bun':
      return 'bun install';
    case 'Pip':
      return 'pip freeze > requirements.txt';
    case 'Poetry':
      return 'poetry lock';
    case 'GoModules':
      return 'go mod tidy';
    case 'Cargo':
      return 'cargo generate-lockfile';
    default:
      return '';
  }
}

/**
 * Substitute placeholders in a treatment action with values from the
 * repository profile.
 *
 * Currently supports:
 *   - `{packageManager}` → the lowercase package manager name (e.g. `npm`, `pnpm`).
 *   - `{lockfileCommand}` → the language-specific lockfile generation command.
 */
function substitutePlaceholders(
  action: TreatmentAction,
  profile: RepositoryProfile,
): TreatmentAction {
  const packageManager = profile.packageManager.toLowerCase();
  const lockfileCommand = getLockfileCommand(profile.packageManager);

  let description = action.description.replaceAll('{packageManager}', packageManager);
  description = description.replaceAll('{lockfileCommand}', lockfileCommand);

  let command = action.command;
  if (command !== undefined) {
    command = command.replaceAll('{packageManager}', packageManager);
    command = command.replaceAll('{lockfileCommand}', lockfileCommand);
  }

  return {
    type: action.type,
    description,
    command,
  };
}
