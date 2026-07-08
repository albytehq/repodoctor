/**
 * Plugin Wrapper.
 *
 * Adapts external plugin definitions ({@link PluginScannerDefinition}
 * and {@link PluginAnalyzerDefinition}) to the internal
 * {@link IScanner} and {@link IAnalyzer} interfaces.
 *
 * The wrapper enforces:
 *   - A strict 1000ms timeout (tighter than the internal 3000ms/2000ms).
 *   - Error isolation: a crashing plugin returns `[]`, never throws.
 *   - Output validation: the returned `RawFact[]`/`RawFinding[]` is
 *     validated before being passed to the collector.
 *
 * Architectural role: plugins — may import from core, utils, errors,
 * scanner, analyzer, config. This module imports the internal
 * IScanner/IAnalyzer interfaces, the plugin context factory, and the
 * core validators.
 */

import type { IScanner, ScannerContext } from '@repodoctor/scanner/IScanner';
import type { IAnalyzer, AnalyzerContext } from '@repodoctor/analyzer/IAnalyzer';
import type { RepositoryProfile } from '@repodoctor/core/domain/Discovery';
import type { RawFact } from '@repodoctor/core/domain/Scan';
import type { RawFinding } from '@repodoctor/core/domain/Analysis';
import type { IEventBus } from '@repodoctor/core/events/IEventBus';
import type {
  PluginScannerDefinition,
  PluginAnalyzerDefinition,
} from '@repodoctor/plugins/types';
import { createPluginScannerContext, createPluginAnalyzerContext } from '@repodoctor/plugins/PluginContext';
import { validateFact } from '@repodoctor/scanner/FactValidator';
import { validateFinding } from '@repodoctor/analyzer/FindingValidator';
import { BaseError } from '@repodoctor/errors/BaseError';
import { ScannerError } from '@repodoctor/errors/ScannerError';
import { AnalyzerError } from '@repodoctor/errors/AnalyzerError';

/**
 * The hard timeout for plugin scanner/analyzer execution, in milliseconds.
 * Tighter than the internal 3000ms/2000ms limits.
 */
const PLUGIN_TIMEOUT_MS = 1000;

/**
 * Wrap a {@link PluginScannerDefinition} as an internal {@link IScanner}.
 *
 * The wrapped scanner:
 *   - Reports its ID as the plugin scanner's ID.
 *   - Reports version `1.0.0` (plugin version is tracked at the plugin level).
 *   - Delegates `supports()` to the plugin definition.
 *   - Wraps `execute()` with timeout + error isolation + output validation.
 */
export class PluginScannerWrapper implements IScanner {
  public readonly id: string;
  public readonly version: string;

  constructor(
    private readonly definition: PluginScannerDefinition,
    private readonly eventBus: IEventBus | undefined,
  ) {
    this.id = definition.id;
    this.version = '1.0.0';
  }

  public supports(profile: RepositoryProfile): boolean {
    try {
      return this.definition.supports(profile);
    } catch {
      // If the plugin's supports() throws, treat as unsupported.
      return false;
    }
  }

  public async execute(context: ScannerContext): Promise<RawFact[]> {
    // Build the sandboxed plugin context.
    const pluginContext = createPluginScannerContext(context.fs, context.profile);

    try {
      // Race against the timeout.
      const rawFacts = await this.withTimeout(
        this.definition.scan(pluginContext),
        this.id,
      );

      // Validate each fact before returning.
      const validated: RawFact[] = [];
      for (const fact of rawFacts) {
        const result = validateFact(fact);
        if (result.valid) {
          validated.push(result.fact);
        }
      }
      return validated;
    } catch (error) {
      // Emit PluginFailed event (via the ScannerFailed channel so the
      // existing event infrastructure picks it up).
      if (this.eventBus !== undefined) {
        const baseError = this.toBaseError(error, this.id);
        this.eventBus.emit('ScannerFailed', {
          scannerId: this.id,
          error: baseError,
        });
      }
      // Return empty — a crashing plugin MUST NOT crash the pipeline.
      return [];
    }
  }

  private withTimeout<T>(promise: Promise<T>, scannerId: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new ScannerError(scannerId, `Plugin timed out after ${PLUGIN_TIMEOUT_MS}ms`));
      }, PLUGIN_TIMEOUT_MS);

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

  private toBaseError(error: unknown, scannerId: string): BaseError {
    if (error instanceof BaseError) {
      return error;
    }
    const message = error instanceof Error ? error.message : String(error);
    return new ScannerError(scannerId, message, { cause: error });
  }
}

/**
 * Wrap a {@link PluginAnalyzerDefinition} as an internal {@link IAnalyzer}.
 *
 * The wrapped analyzer:
 *   - Reports its ID as the plugin analyzer's ID.
 *   - Reports version `1.0.0`.
 *   - Delegates `supports()` to the plugin definition.
 *   - Wraps `execute()` with timeout + error isolation + output validation.
 */
export class PluginAnalyzerWrapper implements IAnalyzer {
  public readonly id: string;
  public readonly version: string;

  constructor(
    private readonly definition: PluginAnalyzerDefinition,
    private readonly eventBus: IEventBus | undefined,
  ) {
    this.id = definition.id;
    this.version = '1.0.0';
  }

  public supports(profile: RepositoryProfile): boolean {
    try {
      return this.definition.supports(profile);
    } catch {
      return false;
    }
  }

  public async execute(context: AnalyzerContext): Promise<RawFinding[]> {
    // Build the sandboxed plugin context.
    const pluginContext = createPluginAnalyzerContext(context.factStore, context.profile);

    try {
      // Race against the timeout.
      const rawFindings = await this.withTimeout(
        this.definition.analyze(pluginContext),
        this.id,
      );

      // Validate each finding before returning.
      const validated: RawFinding[] = [];
      for (const finding of rawFindings) {
        const result = validateFinding(finding);
        if (result.valid) {
          validated.push(result.finding);
        }
      }
      return validated;
    } catch (error) {
      if (this.eventBus !== undefined) {
        const baseError = this.toBaseError(error, this.id);
        this.eventBus.emit('AnalyzerFailed', {
          analyzerId: this.id,
          error: baseError,
        });
      }
      return [];
    }
  }

  private withTimeout<T>(promise: Promise<T>, analyzerId: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new AnalyzerError(analyzerId, `Plugin timed out after ${PLUGIN_TIMEOUT_MS}ms`));
      }, PLUGIN_TIMEOUT_MS);

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

  private toBaseError(error: unknown, analyzerId: string): BaseError {
    if (error instanceof BaseError) {
      return error;
    }
    const message = error instanceof Error ? error.message : String(error);
    return new AnalyzerError(analyzerId, message, { cause: error });
  }
}

/**
 * Re-export for convenience.
 */
export { PLUGIN_TIMEOUT_MS };
