/**
 * Scanner executor.
 *
 * Runs compatible scanners concurrently (max 5 at a time) with a hard
 * timeout per scanner (3000ms). Error isolation: a scanner failure
 * (throw or timeout) is caught, logged via the event bus, and does NOT
 * crash the engine.
 *
 * Architectural role: scanner — may import from core, errors, utils.
 * This module imports `core/events/IEventBus`, `core/domain/Scan`,
 * `errors/ScannerTimeoutError`, and the local `IScanner` + `FactCollector`.
 */

import type { IEventBus } from '@repodoctor/core/events/IEventBus';
import type { RawFact } from '@repodoctor/core/domain/Scan';
import { BaseError } from '@repodoctor/errors/BaseError';
import { ScannerTimeoutError } from '@repodoctor/errors/ScannerTimeoutError';
import { ScannerError } from '@repodoctor/errors/ScannerError';
import type { IScanner, ScannerContext } from '@repodoctor/scanner/IScanner';
import type { FactCollector, CollectionResult } from '@repodoctor/scanner/FactCollector';

/**
 * Maximum number of scanners executing concurrently.
 */
const MAX_CONCURRENT_SCANNERS = 5;

/**
 * Hard timeout per scanner, in milliseconds.
 */
const SCANNER_TIMEOUT_MS = 3000;

/**
 * Result of executing a single scanner.
 */
export interface ScannerExecutionResult {
  readonly scannerId: string;
  readonly status: 'completed' | 'failed' | 'skipped';
  readonly collection?: CollectionResult;
  readonly error?: BaseError;
}

/**
 * Result of executing all scanners.
 */
export interface ExecutorResult {
  readonly results: readonly ScannerExecutionResult[];
  readonly totalFactsAccepted: number;
  readonly totalFactsRejected: number;
  readonly scannerCount: number;
  readonly failedCount: number;
}

/**
 * Runs scanners concurrently with timeout and error isolation.
 *
 * Constructed once per scan with the {@link FactCollector} and optional
 * {@link IEventBus} (for emitting `ScannerStarted`, `ScannerFinished`,
 * `ScannerFailed` events).
 */
export class ScannerExecutor {
  constructor(
    private readonly collector: FactCollector,
    private readonly eventBus: IEventBus | undefined,
  ) {}

  /**
   * Execute a list of scanners against the given context.
   *
   * Scanners are chunked into groups of {@link MAX_CONCURRENT_SCANNERS}.
   * Within each chunk, scanners run via `Promise.all`. Each scanner has
   * a {@link SCANNER_TIMEOUT_MS} timeout.
   *
   * A scanner that throws or times out does NOT prevent the remaining
   * scanners from executing. Its failure is recorded in the returned
   * `ExecutorResult.results` array.
   */
  public async execute(
    scanners: readonly IScanner[],
    context: ScannerContext,
  ): Promise<ExecutorResult> {
    const results: ScannerExecutionResult[] = [];
    let totalAccepted = 0;
    let totalRejected = 0;
    let failedCount = 0;

    // Process scanners in chunks of MAX_CONCURRENT_SCANNERS.
    for (let i = 0; i < scanners.length; i += MAX_CONCURRENT_SCANNERS) {
      const chunk = scanners.slice(i, i + MAX_CONCURRENT_SCANNERS);
      const chunkResults = await Promise.all(
        chunk.map((scanner) => this.executeOne(scanner, context)),
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
      totalFactsAccepted: totalAccepted,
      totalFactsRejected: totalRejected,
      scannerCount: scanners.length,
      failedCount,
    };
  }

  /**
   * Execute a single scanner with timeout and error isolation.
   */
  private async executeOne(
    scanner: IScanner,
    context: ScannerContext,
  ): Promise<ScannerExecutionResult> {
    // Emit ScannerStarted.
    if (this.eventBus !== undefined) {
      this.eventBus.emit('ScannerStarted', { scannerId: scanner.id });
    }

    try {
      // Race the scanner against the timeout.
      const facts = await this.withTimeout(scanner.execute(context), scanner.id);
      const collection = this.collector.collect(facts, scanner.id);

      // Emit ScannerFinished.
      if (this.eventBus !== undefined) {
        this.eventBus.emit('ScannerFinished', {
          scannerId: scanner.id,
          factCount: collection.accepted,
        });
      }

      return {
        scannerId: scanner.id,
        status: 'completed',
        collection,
      };
    } catch (error) {
      const baseError = this.toBaseError(error, scanner.id);

      // Emit ScannerFailed.
      if (this.eventBus !== undefined) {
        this.eventBus.emit('ScannerFailed', {
          scannerId: scanner.id,
          error: baseError,
        });
      }

      return {
        scannerId: scanner.id,
        status: 'failed',
        error: baseError,
      };
    }
  }

  /**
   * Race a promise against the timeout. Throws {@link ScannerTimeoutError}
   * if the promise does not settle within {@link SCANNER_TIMEOUT_MS}.
   */
  private withTimeout<T>(promise: Promise<T>, scannerId: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new ScannerTimeoutError(scannerId, SCANNER_TIMEOUT_MS));
      }, SCANNER_TIMEOUT_MS);

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
  private toBaseError(error: unknown, scannerId: string): BaseError {
    if (error instanceof BaseError) {
      return error;
    }
    // Wrap non-BaseError values.
    const message = error instanceof Error ? error.message : String(error);
    return new ScannerError(scannerId, message, { cause: error });
  }
}

/**
 * Re-export RawFact for callers that need it.
 */
export type { RawFact };
