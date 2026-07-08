/**
 * Scanner engine.
 *
 * The top-level orchestrator for the scan pipeline. Coordinates:
 *   1. Select compatible scanners from the registry.
 *   2. Execute them via the {@link ScannerExecutor}.
 *   3. Collect results into the {@link FactStore}.
 *   4. Emit `RepositoryScanCompleted`.
 *   5. Return a {@link ScanResult}.
 *
 * Architectural role: scanner — may import from core, infrastructure,
 * errors, utils, discovery. This module imports the registry, executor,
 * collector, fact store, and the discovery profile type.
 */

import type { IEventBus } from '@repodoctor/core/events/IEventBus';
import type { ILogger } from '@repodoctor/core/ILogger';
import type { RepositoryProfile } from '@repodoctor/core/domain/Discovery';
import type { ScanResult } from '@repodoctor/core/domain/Scan';
import type { Workspace } from '@repodoctor/core/domain/Workspace';
import type { IScannerFileSystem } from '@repodoctor/core/IScannerFileSystem';
import { FactCollector } from '@repodoctor/scanner/FactCollector';
import { FactStore } from '@repodoctor/scanner/FactStore';
import { ScannerExecutor } from '@repodoctor/scanner/ScannerExecutor';
import type { ScannerRegistry } from '@repodoctor/scanner/ScannerRegistry';
import type { ScannerContext } from '@repodoctor/scanner/IScanner';

/**
 * Parameters accepted by {@link ScannerEngine}.
 */
export interface ScannerEngineParams {
  readonly fileSystem: IScannerFileSystem;
  readonly profile: RepositoryProfile;
  readonly workspace: Workspace;
  readonly logger: ILogger;
  readonly eventBus: IEventBus | undefined;
  readonly registry: ScannerRegistry;
}

/**
 * Orchestrates the scan pipeline.
 *
 * Constructed once per scan. The {@link run} method is the single entry
 * point — it returns a {@link ScanResult} or throws (though individual
 * scanner failures are isolated and never propagate).
 */
export class ScannerEngine {
  constructor(private readonly params: ScannerEngineParams) {}

  /**
   * Run the scan pipeline.
   *
   * Steps:
   *   1. Select compatible scanners.
   *   2. Build the scanner context.
   *   3. Execute scanners via the executor.
   *   4. Emit `RepositoryScanCompleted`.
   *   5. Return `ScanResult`.
   */
  public async run(): Promise<ScanResult> {
    const { fileSystem, profile, workspace, logger, eventBus, registry } = this.params;

    logger.debug('Scanner engine starting.', {
      scannerCount: registry.size,
      repoType: profile.type,
    });

    // --- Step 1: select compatible scanners ---
    const scanners = registry.getCompatibleScanners(profile);
    logger.debug('Compatible scanners selected.', { count: scanners.length });

    // --- Step 2: build context ---
    const context: ScannerContext = {
      fs: fileSystem,
      profile,
      workspace,
    };

    // --- Step 3: execute ---
    const store = new FactStore();
    const collector = new FactCollector(store, eventBus);
    const executor = new ScannerExecutor(collector, eventBus);

    const executorResult = await executor.execute(scanners, context);

    logger.debug('Scanner engine complete.', {
      totalFacts: store.size,
      accepted: executorResult.totalFactsAccepted,
      rejected: executorResult.totalFactsRejected,
      failedScanners: executorResult.failedCount,
    });

    // --- Step 4: emit RepositoryScanCompleted ---
    if (eventBus !== undefined) {
      eventBus.emit('RepositoryScanCompleted', { totalFacts: store.size });
    }

    // --- Step 5: return ScanResult ---
    const result: ScanResult = {
      schemaVersion: 1,
      patient: profile.name,
      scanCompletedAt: new Date().toISOString(),
      facts: store.getAll(),
    };

    return result;
  }
}
