/**
 * Analyzer engine.
 *
 * The top-level orchestrator for the analysis pipeline. Coordinates:
 *   1. Select compatible analyzers from the registry.
 *   2. Execute them via the {@link AnalyzerExecutor}.
 *   3. Collect results into the {@link FindingStore}.
 *   4. Emit `RepositoryAnalysisCompleted`.
 *   5. Return an {@link AnalysisResult}.
 *
 * Architectural role: analyzer — may import from core, infrastructure,
 * errors, utils, scanner, discovery. This module imports the registry,
 * executor, collector, finding store, and the discovery profile type.
 */

import type { IEventBus } from '@repodoctor/core/events/IEventBus';
import type { ILogger } from '@repodoctor/core/ILogger';
import type { RepositoryProfile } from '@repodoctor/core/domain/Discovery';
import type { AnalysisResult } from '@repodoctor/core/domain/Analysis';
import type { IFactStore } from '@repodoctor/core/IFactStore';
import { FindingCollector } from '@repodoctor/analyzer/FindingCollector';
import { FindingStore } from '@repodoctor/analyzer/FindingStore';
import { AnalyzerExecutor } from '@repodoctor/analyzer/AnalyzerExecutor';
import type { AnalyzerRegistry } from '@repodoctor/analyzer/AnalyzerRegistry';
import type { AnalyzerContext } from '@repodoctor/analyzer/IAnalyzer';

/**
 * Parameters accepted by {@link AnalyzerEngine}.
 */
export interface AnalyzerEngineParams {
  readonly factStore: IFactStore;
  readonly profile: RepositoryProfile;
  readonly logger: ILogger;
  readonly eventBus: IEventBus | undefined;
  readonly registry: AnalyzerRegistry;
}

/**
 * Orchestrates the analysis pipeline.
 *
 * Constructed once per analysis. The {@link run} method is the single
 * entry point — it returns an {@link AnalysisResult} or throws (though
 * individual analyzer failures are isolated and never propagate).
 */
export class AnalyzerEngine {
  constructor(private readonly params: AnalyzerEngineParams) {}

  /**
   * Run the analysis pipeline.
   *
   * Steps:
   *   1. Select compatible analyzers.
   *   2. Build the analyzer context.
   *   3. Execute analyzers via the executor.
   *   4. Emit `RepositoryAnalysisCompleted`.
   *   5. Return `AnalysisResult`.
   */
  public async run(): Promise<AnalysisResult> {
    const { factStore, profile, logger, eventBus, registry } = this.params;

    logger.debug('Analyzer engine starting.', {
      analyzerCount: registry.size,
      repoType: profile.type,
      factCount: factStore.size,
    });

    // --- Step 1: select compatible analyzers ---
    const analyzers = registry.getCompatibleAnalyzers(profile);
    logger.debug('Compatible analyzers selected.', { count: analyzers.length });

    // --- Step 2: build context ---
    const context: AnalyzerContext = {
      profile,
      factStore,
    };

    // --- Step 3: execute ---
    const store = new FindingStore();
    const collector = new FindingCollector(store, eventBus);
    const executor = new AnalyzerExecutor(collector, eventBus);

    const executorResult = await executor.execute(analyzers, context);

    logger.debug('Analyzer engine complete.', {
      totalFindings: store.size,
      accepted: executorResult.totalFindingsAccepted,
      rejected: executorResult.totalFindingsRejected,
      failedAnalyzers: executorResult.failedCount,
    });

    // --- Step 4: emit RepositoryAnalysisCompleted ---
    if (eventBus !== undefined) {
      eventBus.emit('RepositoryAnalysisCompleted', { totalFindings: store.size });
    }

    // --- Step 5: return AnalysisResult ---
    const result: AnalysisResult = {
      schemaVersion: 1,
      patient: profile.name,
      analysisCompletedAt: new Date().toISOString(),
      findings: store.getAll(),
    };

    return result;
  }
}
