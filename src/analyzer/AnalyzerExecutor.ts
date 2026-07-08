/**
 * Analyzer executor.
 *
 * Runs compatible analyzers concurrently (max 5 at a time) with a hard
 * timeout per analyzer (2000ms). Error isolation: an analyzer failure
 * (throw or timeout) is caught, logged via the event bus, and does NOT
 * crash the engine.
 *
 * Architectural role: analyzer — may import from core, errors, utils.
 * This module imports `core/events/IEventBus`, `core/domain/Analysis`,
 * `errors/AnalyzerTimeoutError`, `errors/AnalyzerError`, and the local
 * `IAnalyzer` + `FindingCollector`.
 */

import type { IEventBus } from '@repodoctor/core/events/IEventBus';
import type { RawFinding } from '@repodoctor/core/domain/Analysis';
import { BaseError } from '@repodoctor/errors/BaseError';
import { AnalyzerTimeoutError } from '@repodoctor/errors/AnalyzerTimeoutError';
import { AnalyzerError } from '@repodoctor/errors/AnalyzerError';
import type { IAnalyzer, AnalyzerContext } from '@repodoctor/analyzer/IAnalyzer';
import type { FindingCollector, CollectionResult } from '@repodoctor/analyzer/FindingCollector';

/**
 * Maximum number of analyzers executing concurrently.
 */
const MAX_CONCURRENT_ANALYZERS = 5;

/**
 * Hard timeout per analyzer, in milliseconds.
 */
const ANALYZER_TIMEOUT_MS = 2000;

/**
 * Result of executing a single analyzer.
 */
export interface AnalyzerExecutionResult {
  readonly analyzerId: string;
  readonly status: 'completed' | 'failed';
  readonly collection?: CollectionResult;
  readonly error?: BaseError;
}

/**
 * Result of executing all analyzers.
 */
export interface ExecutorResult {
  readonly results: readonly AnalyzerExecutionResult[];
  readonly totalFindingsAccepted: number;
  readonly totalFindingsRejected: number;
  readonly analyzerCount: number;
  readonly failedCount: number;
}

/**
 * Runs analyzers concurrently with timeout and error isolation.
 *
 * Constructed once per analysis with the {@link FindingCollector} and
 * optional {@link IEventBus} (for emitting `AnalyzerStarted`,
 * `AnalyzerFinished`, `AnalyzerFailed` events).
 */
export class AnalyzerExecutor {
  constructor(
    private readonly collector: FindingCollector,
    private readonly eventBus: IEventBus | undefined,
  ) {}

  /**
   * Execute a list of analyzers against the given context.
   *
   * Analyzers are chunked into groups of
   * {@link MAX_CONCURRENT_ANALYZERS}. Within each chunk, analyzers run
   * via `Promise.all`. Each analyzer has a
   * {@link ANALYZER_TIMEOUT_MS} timeout.
   *
   * An analyzer that throws or times out does NOT prevent the remaining
   * analyzers from executing. Its failure is recorded in the returned
   * `ExecutorResult.results` array.
   */
  public async execute(
    analyzers: readonly IAnalyzer[],
    context: AnalyzerContext,
  ): Promise<ExecutorResult> {
    const results: AnalyzerExecutionResult[] = [];
    let totalAccepted = 0;
    let totalRejected = 0;
    let failedCount = 0;

    // Process analyzers in chunks of MAX_CONCURRENT_ANALYZERS.
    for (let i = 0; i < analyzers.length; i += MAX_CONCURRENT_ANALYZERS) {
      const chunk = analyzers.slice(i, i + MAX_CONCURRENT_ANALYZERS);
      const chunkResults = await Promise.all(
        chunk.map((analyzer) => this.executeOne(analyzer, context)),
      );
      for (const result of chunkResults) {
        results.push(result);
        if (result.collection !== undefined) {
          totalAccepted += result.collection.accepted;
          totalRejected += result.collection.rejected;
        }
        if (result.status === 'failed') {
          failedCount += 1;
        }
      }
    }

    return {
      results,
      totalFindingsAccepted: totalAccepted,
      totalFindingsRejected: totalRejected,
      analyzerCount: analyzers.length,
      failedCount,
    };
  }

  /**
   * Execute a single analyzer with timeout and error isolation.
   */
  private async executeOne(
    analyzer: IAnalyzer,
    context: AnalyzerContext,
  ): Promise<AnalyzerExecutionResult> {
    // Emit AnalyzerStarted.
    if (this.eventBus !== undefined) {
      this.eventBus.emit('AnalyzerStarted', { analyzerId: analyzer.id });
    }

    try {
      // Race the analyzer against the timeout.
      const findings = await this.withTimeout(analyzer.execute(context), analyzer.id);
      const collection = this.collector.collect(findings, analyzer.id);

      // Emit AnalyzerFinished.
      if (this.eventBus !== undefined) {
        this.eventBus.emit('AnalyzerFinished', {
          analyzerId: analyzer.id,
          findingCount: collection.accepted,
        });
      }

      return {
        analyzerId: analyzer.id,
        status: 'completed',
        collection,
      };
    } catch (error) {
      const baseError = this.toBaseError(error, analyzer.id);

      // Emit AnalyzerFailed.
      if (this.eventBus !== undefined) {
        this.eventBus.emit('AnalyzerFailed', {
          analyzerId: analyzer.id,
          error: baseError,
        });
      }

      return {
        analyzerId: analyzer.id,
        status: 'failed',
        error: baseError,
      };
    }
  }

  /**
   * Race a promise against the timeout. Throws
   * {@link AnalyzerTimeoutError} if the promise does not settle within
   * {@link ANALYZER_TIMEOUT_MS}.
   */
  private withTimeout<T>(promise: Promise<T>, analyzerId: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new AnalyzerTimeoutError(analyzerId, ANALYZER_TIMEOUT_MS));
      }, ANALYZER_TIMEOUT_MS);

      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Coerce an unknown caught value into a {@link BaseError}.
   */
  private toBaseError(error: unknown, analyzerId: string): BaseError {
    if (error instanceof BaseError) {
      return error;
    }
    // Wrap non-BaseError values.
    const message = error instanceof Error ? error.message : String(error);
    return new AnalyzerError(analyzerId, message, { cause: error });
  }
}

/**
 * Re-export RawFinding for callers that need it.
 */
export type { RawFinding };
