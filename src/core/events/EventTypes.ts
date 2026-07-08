/**
 * Strict union of all event names that may be emitted on the {@link EventBus}.
 *
 * The event bus enforces this union at the type level — arbitrary strings
 * cannot be emitted. This is the foundation of the future plugin lifecycle:
 * future "Organ Doctors" will listen for these events to coordinate their
 * work.
 *
 * Architectural role: core (events).
 */

import type { DiscoveryResult } from '@repodoctor/core/domain/Discovery';
import type { BaseError } from '@repodoctor/errors/BaseError';

/**
 * Strict union of event names recognized by the {@link EventBus}.
 *
 * Adding a new event requires extending this union; the type system then
 * forces every `emit`/`on` call site to update.
 */
export type EventName =
  /**
   * Emitted once, immediately after {@link ExecutionContext} has been
   * constructed and wired with all its collaborators.
   */
  | 'ContextInitialized'

  /**
   * Emitted once, after the {@link ConfigLoader} has produced a validated
   * `RepoDoctorConfig`. The payload is the config object itself.
   */
  | 'ConfigLoaded'

  /**
   * Emitted once, at the very end of a successful bootstrap, immediately
   * before the process exits with code 0. Payload is `undefined`.
   */
  | 'BootstrapComplete'

  /**
   * Emitted once, after the {@link DiscoveryEngine} has produced a
   * {@link DiscoveryResult}. The payload is the discovery result itself.
   *
   * Introduced in v0.0.2.
   */
  | 'DiscoveryComplete'

  /**
   * Emitted when a scanner begins execution. Payload identifies the
   * scanner by its ID.
   *
   * Introduced in v0.0.3.
   */
  | 'ScannerStarted'

  /**
   * Emitted when a scanner completes successfully. Payload includes the
   * scanner ID and the number of facts it produced.
   *
   * Introduced in v0.0.3.
   */
  | 'ScannerFinished'

  /**
   * Emitted when a scanner fails (throws or times out). Payload includes
   * the scanner ID and the error.
   *
   * Introduced in v0.0.3.
   */
  | 'ScannerFailed'

  /**
   * Emitted when a raw fact passes validation and enters the
   * {@link FactStore}. Payload is the fact's deterministic ID.
   *
   * Introduced in v0.0.3.
   */
  | 'FactValidated'

  /**
   * Emitted once, at the end of a successful scan, with the total fact
   * count.
   *
   * Introduced in v0.0.3.
   */
  | 'RepositoryScanCompleted'

  /**
   * Emitted when an analyzer begins execution. Payload identifies the
   * analyzer by its ID.
   *
   * Introduced in v0.0.4.
   */
  | 'AnalyzerStarted'

  /**
   * Emitted when an analyzer completes successfully. Payload includes
   * the analyzer ID and the number of findings it produced.
   *
   * Introduced in v0.0.4.
   */
  | 'AnalyzerFinished'

  /**
   * Emitted when an analyzer fails (throws or times out). Payload
   * includes the analyzer ID and the error.
   *
   * Introduced in v0.0.4.
   */
  | 'AnalyzerFailed'

  /**
   * Emitted when a raw finding passes validation and enters the
   * {@link FindingStore}. Payload is the finding's deterministic ID.
   *
   * Introduced in v0.0.4.
   */
  | 'FindingValidated'

  /**
   * Emitted once, at the end of a successful analysis, with the total
   * finding count.
   *
   * Introduced in v0.0.4.
   */
  | 'RepositoryAnalysisCompleted'

  /**
   * Emitted when the health engine begins its calculation.
   *
   * Introduced in v0.0.5.
   */
  | 'HealthCalculationStarted'

  /**
   * Emitted when a single organ has been diagnosed. Payload includes
   * the organ name, its score, and its status.
   *
   * Introduced in v0.0.5.
   */
  | 'OrganDiagnosed'

  /**
   * Emitted once, at the end of a successful health calculation, with
   * the overall score and status.
   *
   * Introduced in v0.0.5.
   */
  | 'HealthCalculationCompleted';

/**
 * Maps each {@link EventName} to the type of payload that handlers may
 * expect. Future events should extend this map.
 */
export interface EventPayloadMap {
  ContextInitialized: { workspace: { cwd: string; isCI: boolean; isInteractive: boolean } };
  ConfigLoaded: { logLevel: string; strict: boolean; organsCount: number };
  BootstrapComplete: undefined;
  DiscoveryComplete: DiscoveryResult;
  ScannerStarted: { scannerId: string };
  ScannerFinished: { scannerId: string; factCount: number };
  ScannerFailed: { scannerId: string; error: BaseError };
  FactValidated: { factId: string };
  RepositoryScanCompleted: { totalFacts: number };
  AnalyzerStarted: { analyzerId: string };
  AnalyzerFinished: { analyzerId: string; findingCount: number };
  AnalyzerFailed: { analyzerId: string; error: BaseError };
  FindingValidated: { findingId: string };
  RepositoryAnalysisCompleted: { totalFindings: number };
  HealthCalculationStarted: { findingCount: number };
  OrganDiagnosed: { organName: string; score: number; status: string };
  HealthCalculationCompleted: { overallScore: number; status: string };
}

/**
 * Type-level helper that extracts the payload type for a given event name.
 */
export type PayloadFor<E extends EventName> = EventPayloadMap[E];
