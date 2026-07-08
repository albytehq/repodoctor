/**
 * CLI Bootstrap.
 *
 * Owns the main execution lifecycle. Orchestrates the construction of
 * every collaborator (workspace, repository, config, logger, event bus,
 * plugin registry, lifecycle manager, error handler) and wires them into
 * an {@link ExecutionContext}.
 *
 * The bootstrap is intentionally linear: each step either succeeds or
 * throws an error that the {@link ErrorHandler} surfaces. There is no
 * retry, no fallback, no conditional branching on config values (beyond
 * the log level).
 *
 * Architectural role: cli — the top of the dependency graph. May import
 * from every other layer.
 */

import type { LogLevel, RepoDoctorConfig } from '@repodoctor/config/types';
import type { IFileSystem } from '@repodoctor/core/IFileSystem';
import type { IScannerFileSystem } from '@repodoctor/core/IScannerFileSystem';
import type { IEventBus } from '@repodoctor/core/events/IEventBus';
import type { ILogger } from '@repodoctor/core/ILogger';
import type { DiscoveryResult } from '@repodoctor/core/domain/Discovery';
import type { ScanResult } from '@repodoctor/core/domain/Scan';
import type { AnalysisResult } from '@repodoctor/core/domain/Analysis';
import type { MedicalDiagnosis } from '@repodoctor/core/domain/Health';
import { ExecutionContext } from '@repodoctor/core/context/ExecutionContext';
import { Repository } from '@repodoctor/core/domain/Repository';
import { Workspace } from '@repodoctor/core/domain/Workspace';
import { EventBus } from '@repodoctor/core/events/EventBus';
import { LifecycleManager } from '@repodoctor/core/lifecycle/LifecycleManager';
import { PluginRegistry } from '@repodoctor/core/plugins/PluginRegistry';
import { ConfigLoader } from '@repodoctor/config/ConfigLoader';
import { DiscoveryEngine } from '@repodoctor/discovery/DiscoveryEngine';
import { ScannerEngine } from '@repodoctor/scanner/ScannerEngine';
import { ScannerRegistry } from '@repodoctor/scanner/ScannerRegistry';
import { FactStore } from '@repodoctor/scanner/FactStore';
import { RootStructureScanner } from '@repodoctor/scanner/builtins/RootStructureScanner';
import { ManifestScanner } from '@repodoctor/scanner/builtins/ManifestScanner';
import { DocumentationScanner } from '@repodoctor/scanner/builtins/DocumentationScanner';
import { GitScanner } from '@repodoctor/scanner/builtins/GitScanner';
import { EnvironmentScanner } from '@repodoctor/scanner/builtins/EnvironmentScanner';
import { AnalyzerEngine } from '@repodoctor/analyzer/AnalyzerEngine';
import { AnalyzerRegistry } from '@repodoctor/analyzer/AnalyzerRegistry';
import { EnvironmentAnalyzer } from '@repodoctor/analyzer/builtins/EnvironmentAnalyzer';
import { ManifestAnalyzer } from '@repodoctor/analyzer/builtins/ManifestAnalyzer';
import { DocumentationAnalyzer } from '@repodoctor/analyzer/builtins/DocumentationAnalyzer';
import { StructureAnalyzer } from '@repodoctor/analyzer/builtins/StructureAnalyzer';
import { HealthEngine } from '@repodoctor/health/HealthEngine';
import { RuleWeightRegistry } from '@repodoctor/health/RuleWeightRegistry';
import { generateTreatments } from '@repodoctor/treatment/TreatmentEngine';
import { TreatmentRegistry } from '@repodoctor/treatment/TreatmentRegistry';
import type { FinalReport } from '@repodoctor/treatment/types';
import { formatConsoleReport } from '@repodoctor/reporter/ConsoleReporter';
import { formatMarkdownReport } from '@repodoctor/reporter/MarkdownReporter';
import { formatJsonReport } from '@repodoctor/reporter/JsonReporter';
import { ErrorHandler, type ErrorBoundaryLogger } from '@repodoctor/errors/ErrorHandler';
import { FileSystem } from '@repodoctor/infrastructure/FileSystem';
import { Path } from '@repodoctor/infrastructure/Path';
import { ScannerFileSystem } from '@repodoctor/infrastructure/ScannerFileSystem';
import { ConsoleTransport } from '@repodoctor/logger/ConsoleTransport';
import { Logger } from '@repodoctor/logger/Logger';
import { isCI, isDebug, isInteractive } from '@repodoctor/utils/environment';
import { parseArguments, HELP_TEXT, type ParsedArguments, type ShortCircuitResult } from '@repodoctor/cli/ArgumentParser';
import { formatDiscoveryResult } from '@repodoctor/cli/DiscoveryFormatter';
import { formatScanResult } from '@repodoctor/cli/ScanFormatter';
import { formatAnalysisResult } from '@repodoctor/cli/AnalyzeFormatter';
import { createCacheManager } from '@repodoctor/cache/CacheManager';
import type { FileMetadata } from '@repodoctor/cache/types';
import { PluginManager } from '@repodoctor/plugins/PluginManager';

/**
 * Result of a successful bootstrap.
 *
 * Returned to the entry point so that tests can inspect the constructed
 * context, discovery result, and scan result without depending on
 * private fields.
 */
export interface BootstrapResult {
  readonly context: ExecutionContext;
  readonly discoveryResult: DiscoveryResult | undefined;
  readonly scanResult: ScanResult | undefined;
  readonly analysisResult: AnalysisResult | undefined;
  readonly diagnosisResult: MedicalDiagnosis | undefined;
  readonly finalReport: FinalReport | undefined;
  readonly exitCode: number;
  readonly durationMs: number;
}

/**
 * Parameters accepted by {@link CliBootstrap.run}.
 *
 * Every collaborator that the bootstrap would normally construct itself
 * is injectable for testability. When a parameter is omitted, the
 * bootstrap constructs the production default.
 */
export interface BootstrapParams {
  /**
   * Raw argv (typically `process.argv.slice(2)`). The bootstrap does NOT
   * read `process.argv` itself so that tests can inject arbitrary
   * argument vectors.
   */
  readonly argv: readonly string[];
  /**
   * Current working directory (typically `process.cwd()`). The bootstrap
   * does NOT read `process.cwd()` itself so that tests can inject a
   * sandbox directory.
   */
  readonly cwd: string;
  /**
   * RepoDoctor version string (typically read from `package.json`).
   */
  readonly version: string;
  /** Override the file system (for tests). */
  readonly fileSystem?: IFileSystem;
  /** Override the scanner file system (for tests). */
  readonly scannerFileSystem?: IScannerFileSystem;
  /** Override the event bus (for tests). */
  readonly eventBus?: IEventBus;
  /** Override the logger (for tests). */
  readonly logger?: ILogger;
  /** Override the error handler (for tests). */
  readonly errorHandler?: ErrorHandler;
  /**
   * Hook invoked when the bootstrap would normally call `process.exit`.
   * Tests can inject a hook that records the exit code and throws to
   * short-circuit the rest of the run.
   */
  readonly exitHook?: (code: number) => void;
  /**
   * Hook invoked when the bootstrap wants to print output (the version
   * string, the help text). Defaults to writing to `process.stdout`.
   */
  readonly stdoutWrite?: (text: string) => void;
  /**
   * Environment flag overrides (for tests). When omitted, the bootstrap
   * reads from `utils/environment`.
   */
  readonly environment?: { isCI: boolean; isInteractive: boolean; isDebug: boolean };
}

/**
 * Owns the main execution lifecycle.
 *
 * Constructed once at process startup. The {@link run} method is the
 * single entry point — it never returns normally. It either resolves to
 * a {@link BootstrapResult} (in which case the entry point should
 * `process.exit(0)`) or throws (in which case the entry point should
 * route the error through the {@link ErrorHandler}).
 */
export class CliBootstrap {
  /**
   * Execute the bootstrap lifecycle.
   *
   * Steps (mirroring the spec's section 6.1):
   *   1. Parse raw argv via {@link parseArguments}.
   *   2. Instantiate {@link ErrorHandler} and attach to process events.
   *   3. Instantiate {@link Workspace}.
   *   4. Instantiate {@link EventBus} and {@link PluginRegistry}.
   *   5. Instantiate {@link Logger}.
   *   6. Use {@link ConfigLoader} to discover, read, validate, merge.
   *   7. Instantiate {@link ExecutionContext}.
   *   8. Emit `ContextInitialized`.
   *   9. Log success.
   *   10. Emit `BootstrapComplete` and resolve.
   *
   * `--version` and `--help` short-circuit the flow: the bootstrap prints
   * the requested output and resolves with a sentinel result.
   */
  public async run(params: BootstrapParams): Promise<BootstrapResult> {
    const startedAt = Date.now();

    // --- Step 1: parse argv ---
    const parsed = parseArguments(params.argv, { version: params.version });

    // --- Short-circuit: --version / --help ---
    if (parsed.kind === 'version' || parsed.kind === 'help') {
      this.handleShortCircuit(parsed, params);
      return {
        context: this.buildSkeletonContext(params),
        discoveryResult: undefined,
        scanResult: undefined,
        analysisResult: undefined,
        diagnosisResult: undefined,
        finalReport: undefined,
        exitCode: 0,
        durationMs: Date.now() - startedAt,
      };
    }

    // After the short-circuit check, `parsed` is narrowed to ParsedArguments.
    const parsedArgs: ParsedArguments = parsed;

    // --- Step 2: error handler (constructed before anything that can throw) ---
    const errorHandler = params.errorHandler ?? this.buildErrorHandler(params, parsedArgs);

    try {
      // --- Step 3: workspace ---
      const env = params.environment ?? {
        isCI: isCI(),
        isInteractive: isInteractive(),
        isDebug: parsedArgs.debug || isDebug(),
      };
      const workspace = new Workspace({
        cwd: params.cwd,
        isCI: env.isCI,
        isInteractive: env.isInteractive,
      });

      // --- Step 4: event bus + plugin registry ---
      const eventBus = params.eventBus ?? this.buildEventBus(params);
      const pluginRegistry = new PluginRegistry();
      const lifecycleManager = new LifecycleManager(eventBus);

      // --- Step 5: logger ---
      // In --json mode, suppress all logger output except error so the
      // JSON output is the only thing on stdout.
      const initialLogLevel: LogLevel = parsedArgs.json
        ? 'error'
        : env.isDebug
          ? 'debug'
          : 'info';
      const logger = params.logger ?? this.buildLogger(initialLogLevel);

      // --- Step 6: config ---
      const fileSystem = params.fileSystem ?? new FileSystem();
      const pathHelper = new Path();
      const loader = new ConfigLoader(fileSystem, pathHelper);
      const config: RepoDoctorConfig = await loader.load({
        explicitPath: parsedArgs.configPath,
        cwd: workspace.cwd,
      });

      // Rebuild the logger if the config-supplied log level differs from
      // the initial level (the initial level was a CLI-flag-based guess;
      // the config level is authoritative). In --json mode, we keep the
      // 'error' level regardless of config — JSON output must not be
      // polluted by info/warn messages.
      const configLogLevel: LogLevel = parsedArgs.json ? 'error' : config.logLevel;
      const effectiveLogger: ILogger =
        params.logger !== undefined
          ? params.logger
          : configLogLevel !== initialLogLevel
            ? this.buildLogger(configLogLevel)
            : logger;

      // --- Step 7: execution context ---
      const repository = new Repository(workspace.cwd);
      const context = new ExecutionContext({
        workspace,
        repository,
        config,
        logger: effectiveLogger,
        eventBus,
        pluginRegistry,
        lifecycleManager,
      });

      // --- Step 8: emit ContextInitialized ---
      eventBus.emit('ContextInitialized', {
        workspace: workspace.toJSON(),
      });

      // --- Step 9: log foundation success ---
      effectiveLogger.info('RepoDoctor foundation initialized successfully.', {
        version: params.version,
        cwd: workspace.cwd,
        configLogLevel: config.logLevel,
        pluginCount: pluginRegistry.size,
      });

      // --- Step 10: run discovery (v0.0.2) ---
      // The default command is 'discover'. We instantiate the
      // DiscoveryEngine with the context's collaborators and run it.

      // --- Step 11b: handle --clear-cache (v0.0.7) ---
      // Run before discovery to avoid wasted I/O when only clearing the cache.
      if (parsedArgs.clearCache) {
        const cacheManager = createCacheManager(workspace.cwd, false);
        await cacheManager.clear();
        const clearWrite = params.stdoutWrite ?? ((text: string) => process.stdout.write(text));
        clearWrite(parsedArgs.json ? JSON.stringify({ cleared: true }) + '\n' : 'Cache cleared.\n');
        eventBus.emit('BootstrapComplete', undefined);
        return {
          context,
          discoveryResult: undefined,
          scanResult: undefined,
          analysisResult: undefined,
          diagnosisResult: undefined,
          finalReport: undefined,
          exitCode: 0,
          durationMs: Date.now() - startedAt,
        };
      }

      // --- Step 11c: handle completions command (v0.1.0) ---
      // Run before discovery — completions output does not use discovery
      // results, so running discovery first is pure waste.
      if (parsedArgs.command === 'completions') {
        const { generateCompletions } = await import('@repodoctor/cli/Completions');
        const shell = parsedArgs.completionsShell ?? 'bash';
        const script = generateCompletions(shell);
        const completionsWrite = params.stdoutWrite ?? ((text: string) => process.stdout.write(text));
        completionsWrite(script);
        eventBus.emit('BootstrapComplete', undefined);
        return {
          context,
          discoveryResult: undefined,
          scanResult: undefined,
          analysisResult: undefined,
          diagnosisResult: undefined,
          finalReport: undefined,
          exitCode: 0,
          durationMs: Date.now() - startedAt,
        };
      }

      const discoveryEngine = new DiscoveryEngine({
        fileSystem,
        repository: context.repository,
        logger: effectiveLogger,
        ignoreRoot: config.discovery.ignoreRoot,
      });
      const discoveryResult = await discoveryEngine.run();

      // --- Step 11: emit DiscoveryComplete ---
      eventBus.emit('DiscoveryComplete', discoveryResult);

      // --- Step 12: run scanner if command needs it (v0.0.3+) ---
      const isDiscoverCommand = parsedArgs.command === 'discover' || parsedArgs.command === 'inspect';
      const isScanCommand = parsedArgs.command === 'scan' || parsedArgs.command === 'facts';
      const isAnalyzeCommand = parsedArgs.command === 'analyze';
      const isDiagnoseCommand = parsedArgs.command === 'diagnose' || parsedArgs.command === 'health';
      const isReportCommand = parsedArgs.command === 'report';
      const needsScan = isScanCommand || isAnalyzeCommand || isDiagnoseCommand || isReportCommand;
      void isDiscoverCommand;
      let scanResult: ScanResult | undefined = undefined;
      let analysisResult: AnalysisResult | undefined = undefined;
      let cacheHit = false;
      const write = params.stdoutWrite ?? ((text: string) => process.stdout.write(text));

      // --- Step 12a: check cache (v0.0.7) ---
      if (needsScan && !parsedArgs.noCache && (isAnalyzeCommand || isDiagnoseCommand || isReportCommand)) {
        const cacheManager = createCacheManager(workspace.cwd, parsedArgs.noCache);
        // Collect file metadata for cache validation.
        const fileMetadata: FileMetadata[] = [];
        for (const f of discoveryResult.profile.rootFiles) {
          try {
            const stats = await fileSystem.stat(f.path);
            fileMetadata.push({ name: f.name, mtimeMs: stats.mtimeMs, size: stats.size });
          } catch {
            // Skip files we can't stat.
          }
        }
        const lookup = await cacheManager.lookup(discoveryResult.fingerprint.hash, fileMetadata);
        if (lookup.hit) {
          scanResult = lookup.entry.scanResult;
          analysisResult = lookup.entry.analysisResult;
          cacheHit = true;
          effectiveLogger.debug('Cache hit — skipping scanner and analyzer engines.', {});
        }
      }

      if (needsScan && !cacheHit) {
        const scannerFs = params.scannerFileSystem ?? new ScannerFileSystem(workspace.cwd);
        const registry = new ScannerRegistry();
        // Register built-in scanners.
        registry.register(new RootStructureScanner());
        registry.register(new ManifestScanner());
        registry.register(new DocumentationScanner());
        registry.register(new GitScanner());
        registry.register(new EnvironmentScanner());

        // Load and register plugin scanners (v0.0.8).
        if (config.plugins.length > 0) {
          const analyzerRegistry = new AnalyzerRegistry();
          const pluginManager = new PluginManager({
            pluginPaths: config.plugins,
            basePath: workspace.cwd,
            scannerRegistry: registry,
            analyzerRegistry,
            logger: effectiveLogger,
            eventBus,
          });
          const pluginSummary = await pluginManager.loadAll();
          if (pluginSummary.failed.length > 0) {
            for (const f of pluginSummary.failed) {
              effectiveLogger.warn(`Failed to load plugin '${f.name}': ${f.error}`, {});
            }
          }
          for (const p of pluginSummary.loaded) {
            effectiveLogger.info(`Plugin loaded: ${p.name} (${p.version})`, {});
          }
        }

        const scannerEngine = new ScannerEngine({
          fileSystem: scannerFs,
          profile: discoveryResult.profile,
          workspace,
          logger: effectiveLogger,
          eventBus,
          registry,
        });
        scanResult = await scannerEngine.run();
      }

      // --- Step 12b: run analyzer if command needs it and no cache hit (v0.0.4+) ---
      const needsAnalysis = isAnalyzeCommand || isDiagnoseCommand || isReportCommand;
      if (needsAnalysis && scanResult !== undefined && !cacheHit) {
        // Build a FactStore from the scan result so analyzers can query it.
        const factStore = new FactStore();
        for (const fact of scanResult.facts) {
          factStore.add(
            { type: fact.type, target: fact.target, value: fact.value },
            fact.scannerIds[0] ?? 'unknown',
          );
        }

        const analyzerRegistry = new AnalyzerRegistry();
        analyzerRegistry.register(new EnvironmentAnalyzer());
        analyzerRegistry.register(new ManifestAnalyzer());
        analyzerRegistry.register(new DocumentationAnalyzer());
        analyzerRegistry.register(new StructureAnalyzer());

        // Load and register plugin analyzers (v0.0.8).
        if (config.plugins.length > 0) {
          const pluginManager = new PluginManager({
            pluginPaths: config.plugins,
            basePath: workspace.cwd,
            scannerRegistry: new ScannerRegistry(), // unused here, but required
            analyzerRegistry,
            logger: effectiveLogger,
            eventBus,
          });
          await pluginManager.loadAll();
        }

        const analyzerEngine = new AnalyzerEngine({
          factStore,
          profile: discoveryResult.profile,
          logger: effectiveLogger,
          eventBus,
          registry: analyzerRegistry,
        });
        analysisResult = await analyzerEngine.run();

        // --- Step 12b-2: write to cache (v0.0.7) ---
        if (!parsedArgs.noCache && scanResult !== undefined && analysisResult !== undefined) {
          try {
            const cacheManager = createCacheManager(workspace.cwd, false);
            const fileMetadata: FileMetadata[] = [];
            for (const f of discoveryResult.profile.rootFiles) {
              try {
                const stats = await fileSystem.stat(f.path);
                fileMetadata.push({ name: f.name, mtimeMs: stats.mtimeMs, size: stats.size });
              } catch {
                // Skip files we can't stat.
              }
            }
            await cacheManager.write(
              discoveryResult.fingerprint.hash,
              fileMetadata,
              scanResult,
              analysisResult,
            );
          } catch {
            // Cache write failure is non-fatal — the pipeline result
            // is still valid, we just can't cache it for next time.
            effectiveLogger.debug('Cache write failed (non-fatal).', {});
          }
        }
      }

      // --- Step 12c: run health engine if command needs it (v0.0.5+) ---
      const needsDiagnosis = isDiagnoseCommand || isReportCommand;
      let diagnosisResult: MedicalDiagnosis | undefined = undefined;
      if (needsDiagnosis && analysisResult !== undefined) {
        const healthRegistry = new RuleWeightRegistry();
        const healthEngine = new HealthEngine({
          findings: analysisResult.findings,
          profile: discoveryResult.profile,
          logger: effectiveLogger,
          eventBus,
          registry: healthRegistry,
        });
        diagnosisResult = healthEngine.run();
      }

      // --- Step 12d: generate treatments + final report (v0.0.6) ---
      let finalReport: FinalReport | undefined = undefined;
      if (isReportCommand && diagnosisResult !== undefined) {
        const treatmentRegistry = new TreatmentRegistry();
        const treatments = generateTreatments({
          diagnosis: diagnosisResult,
          profile: discoveryResult.profile,
          registry: treatmentRegistry,
        });
        finalReport = {
          diagnosis: diagnosisResult,
          treatments,
          generatedAt: new Date().toISOString(),
        };
      }

      // --- Step 13: output ---
      // Color output respects the de-facto standards:
      //   - `--ci` flag always disables color (no exceptions).
      //   - `NO_COLOR` env var (any non-empty value) disables color.
      //   - `FORCE_COLOR` env var (0/false = off; 1/true = on; 2/3 = on+256/truecolor).
      //   - Otherwise, color is enabled only when stdout is a TTY.
      const useColor = (() => {
        if (parsedArgs.ci) return false;
        if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '') return false;
        if (process.env.FORCE_COLOR !== undefined) {
          const v = process.env.FORCE_COLOR.toLowerCase();
          if (v === '0' || v === 'false' || v === '') return false;
          return true; // any non-zero/non-false value enables color
        }
        return env.isInteractive;
      })();

      if (finalReport !== undefined) {
        // Report command: use the new reporters.
        if (parsedArgs.json) {
          write(formatJsonReport(finalReport) + '\n');
        } else if (parsedArgs.markdown) {
          write(formatMarkdownReport(finalReport) + '\n');
        } else {
          write(formatConsoleReport(finalReport, useColor));
        }
      } else if (diagnosisResult !== undefined) {
        // Diagnose command (legacy output for backward compat).
        if (parsedArgs.json) {
          write(JSON.stringify(diagnosisResult, null, 2) + '\n');
        } else {
          // Use the console report format for diagnosis too.
          const tempReport: FinalReport = {
            diagnosis: diagnosisResult,
            treatments: [],
            generatedAt: new Date().toISOString(),
          };
          write(formatConsoleReport(tempReport, useColor));
        }
      } else if (analysisResult !== undefined) {
        if (parsedArgs.json) {
          write(JSON.stringify(analysisResult, null, 2) + '\n');
        } else {
          write(formatAnalysisResult(analysisResult));
        }
      } else if (scanResult !== undefined) {
        if (parsedArgs.json) {
          write(JSON.stringify(scanResult, null, 2) + '\n');
        } else {
          write(formatScanResult(scanResult));
        }
      } else {
        if (parsedArgs.json) {
          write(JSON.stringify(discoveryResult, null, 2) + '\n');
        } else {
          write(formatDiscoveryResult(discoveryResult));
        }
      }

      // --- Step 14: calculate exit code (v0.0.6 CI logic) ---
      let exitCode = 0;
      if (parsedArgs.threshold !== undefined && diagnosisResult !== undefined) {
        // --threshold takes precedence.
        exitCode = diagnosisResult.overallScore < parsedArgs.threshold ? 1 : 0;
      } else if (parsedArgs.ci || !env.isInteractive) {
        // CI mode: exit 1 if status is not Excellent/Healthy.
        if (diagnosisResult !== undefined) {
          const status = diagnosisResult.overallStatus;
          if (status !== 'Excellent' && status !== 'Healthy') {
            exitCode = 1;
          }
        }
      }

      // --- Step 15: emit BootstrapComplete ---
      eventBus.emit('BootstrapComplete', undefined);

      return {
        context,
        discoveryResult,
        scanResult,
        analysisResult,
        diagnosisResult,
        finalReport,
        exitCode,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      // Defer to the error handler. It never returns.
      errorHandler.handle(error);
      // errorHandler.handle is typed as `never`, but TypeScript cannot
      // always infer this through the catch-block. The throw below is
      // unreachable but satisfies the type system.
      throw error;
    }
  }

  /**
   * Handle `--version` or `--help` short-circuit.
   *
   * The short-circuit path does NOT go through the ErrorHandler — it
   * always exits 0. It also does NOT touch the config or filesystem,
   * so it works even in a broken repo.
   */
  private handleShortCircuit(parsed: ShortCircuitResult, params: BootstrapParams): void {
    const write = params.stdoutWrite ?? ((text: string) => process.stdout.write(text));
    if (parsed.kind === 'version') {
      write(parsed.version + '\n');
    } else {
      write(HELP_TEXT);
    }
    const exit = params.exitHook ?? ((code: number) => process.exit(code));
    exit(0);
  }

  private buildSkeletonContext(params: BootstrapParams): ExecutionContext {
    // For short-circuit results we still need to return *something* to
    // satisfy the BootstrapResult type. We construct a minimal context
    // with default collaborators. This is safe because the entry point
    // will not use it (short-circuits always exit before returning).
    const env = params.environment ?? {
      isCI: isCI(),
      isInteractive: isInteractive(),
      isDebug: isDebug(),
    };
    const workspace = new Workspace({
      cwd: params.cwd,
      isCI: env.isCI,
      isInteractive: env.isInteractive,
    });
    const eventBus = params.eventBus ?? new EventBus();
    const logger = params.logger ?? this.buildLogger('silent');
    return new ExecutionContext({
      workspace,
      repository: new Repository(workspace.cwd),
      config: { logLevel: 'silent', strict: false, organs: [], discovery: { ignoreRoot: [] }, plugins: [] },
      logger,
      eventBus,
      pluginRegistry: new PluginRegistry(),
      lifecycleManager: new LifecycleManager(eventBus),
    });
  }

  private buildErrorHandler(params: BootstrapParams, _parsed: ParsedArguments): ErrorHandler {
    // Prefer the injected logger (when present, e.g. in tests) so that
    // error output is captured by the same logger that captures info
    // output. Fall back to a minimal stderr-only logger that is never
    // silenced by config — error reporting must always reach the user.
    const logger: ErrorBoundaryLogger =
      params.logger ?? this.buildLogger('error');
    return new ErrorHandler(logger, {
      exitHook: params.exitHook,
    });
  }

  private buildLogger(level: LogLevel): Logger {
    return new Logger(level, new ConsoleTransport());
  }

  private buildEventBus(_params: BootstrapParams): EventBus {
    // The event bus needs an error reporter so that handler failures
    // during dispatch are surfaced somewhere. We construct a minimal
    // stderr logger lazily — the reporter itself must not throw, so we
    // wrap it in a try/catch.
    const fallbackLogger = this.buildLogger('warn');
    return new EventBus({
      errorReporter: (_eventName, error) => {
        try {
          fallbackLogger.warn('Event handler threw.', {
            eventName: _eventName,
            error: error instanceof Error ? error.message : String(error),
          });
        } catch {
          // Swallow — the reporter must never throw.
        }
      },
    });
  }
}
