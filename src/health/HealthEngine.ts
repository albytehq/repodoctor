/**
 * Health Engine.
 *
 * The top-level orchestrator for the health calculation pipeline.
 * Coordinates:
 *   1. Emit `HealthCalculationStarted`.
 *   2. Run the {@link diagnose} function (which calls the
 *      ScoreCalculator and applies the Critical Floor).
 *   3. Emit `OrganDiagnosed` for each organ.
 *   4. Emit `HealthCalculationCompleted`.
 *   5. Return the {@link MedicalDiagnosis}.
 *
 * Architectural role: health — may import from core, utils, errors,
 * analyzer, discovery. This module imports the RuleWeightRegistry,
 * DiagnosisEngine, and core domain types. It performs NO I/O.
 */

import type { IEventBus } from '@repodoctor/core/events/IEventBus';
import type { ILogger } from '@repodoctor/core/ILogger';
import type { RepositoryProfile } from '@repodoctor/core/domain/Discovery';
import type { MedicalDiagnosis } from '@repodoctor/core/domain/Health';
import type { ValidatedFinding } from '@repodoctor/core/domain/Analysis';
import type { RuleWeightRegistry } from '@repodoctor/health/RuleWeightRegistry';
import { diagnose } from '@repodoctor/health/DiagnosisEngine';

/**
 * Parameters accepted by {@link HealthEngine}.
 */
export interface HealthEngineParams {
  readonly findings: readonly ValidatedFinding[];
  readonly profile: RepositoryProfile;
  readonly logger: ILogger;
  readonly eventBus: IEventBus | undefined;
  readonly registry: RuleWeightRegistry;
}

/**
 * Orchestrates the health calculation pipeline.
 *
 * Constructed once per diagnosis. The {@link run} method is the single
 * entry point — it returns a {@link MedicalDiagnosis}.
 */
export class HealthEngine {
  constructor(private readonly params: HealthEngineParams) {}

  /**
   * Run the health calculation pipeline.
   */
  public run(): MedicalDiagnosis {
    const { findings, profile, logger, eventBus, registry } = this.params;

    logger.debug('Health engine starting.', {
      findingCount: findings.length,
      patient: profile.name,
    });

    // --- Step 1: emit HealthCalculationStarted ---
    if (eventBus !== undefined) {
      eventBus.emit('HealthCalculationStarted', { findingCount: findings.length });
    }

    // --- Step 2: diagnose ---
    const diagnosis = diagnose({
      patient: profile.name,
      findings,
      registry,
    });

    // --- Step 3: emit OrganDiagnosed for each organ ---
    if (eventBus !== undefined) {
      for (const organ of diagnosis.organs) {
        eventBus.emit('OrganDiagnosed', {
          organName: organ.organName,
          score: organ.score,
          status: organ.status,
        });
      }
    }

    logger.debug('Health engine complete.', {
      overallScore: diagnosis.overallScore,
      overallStatus: diagnosis.overallStatus,
      organCount: diagnosis.organs.length,
    });

    // --- Step 4: emit HealthCalculationCompleted ---
    if (eventBus !== undefined) {
      eventBus.emit('HealthCalculationCompleted', {
        overallScore: diagnosis.overallScore,
        status: diagnosis.overallStatus,
      });
    }

    return diagnosis;
  }
}
