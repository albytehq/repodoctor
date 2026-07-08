/**
 * Plugin Manager.
 *
 * Discovers, loads, validates, and registers external plugins. The
 * manager reads the `plugins` array from the RepoDoctor config,
 * resolves each entry (local file or npm package), dynamically imports
 * it, validates the default export against the {@link RepoDoctorPlugin}
 * schema, and registers wrapped scanners/analyzers with the internal
 * registries.
 *
 * Architectural role: plugins — may import from core, utils, errors,
 * scanner, analyzer, config. This module imports the plugin types,
 * wrapper, error classes, and the internal registries.
 */

import { resolve as nodeResolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import type { ScannerRegistry } from '@repodoctor/scanner/ScannerRegistry';
import type { AnalyzerRegistry } from '@repodoctor/analyzer/AnalyzerRegistry';
import type { IEventBus } from '@repodoctor/core/events/IEventBus';
import type { ILogger } from '@repodoctor/core/ILogger';
import type {
  RepoDoctorPlugin,
  PluginLoadSummary,
} from '@repodoctor/plugins/types';
import { PLUGIN_API_VERSION } from '@repodoctor/plugins/types';
import { PluginScannerWrapper, PluginAnalyzerWrapper } from '@repodoctor/plugins/PluginWrapper';
import { PluginError } from '@repodoctor/errors/PluginError';
import { PluginApiVersionMismatchError } from '@repodoctor/errors/PluginApiVersionMismatchError';

/**
 * Parameters for the {@link PluginManager}.
 */
export interface PluginManagerParams {
  /** List of plugin module names or paths to load. */
  readonly pluginPaths: readonly string[];
  /** The base directory for resolving relative plugin paths. */
  readonly basePath: string;
  /** The scanner registry to register plugin scanners with. */
  readonly scannerRegistry: ScannerRegistry;
  /** The analyzer registry to register plugin analyzers with. */
  readonly analyzerRegistry: AnalyzerRegistry;
  /** Logger for debug output. */
  readonly logger: ILogger;
  /** Event bus for emitting plugin failure events. */
  readonly eventBus: IEventBus | undefined;
}

/**
 * Manages the plugin lifecycle: discovery, loading, validation, and
 * registration.
 */
export class PluginManager {
  constructor(private readonly params: PluginManagerParams) {}

  /**
   * Load all configured plugins.
   *
   * For each plugin path:
   *   1. Resolve the path (local file or npm package).
   *   2. Dynamically `import()` the module.
   *   3. Validate the default export against {@link RepoDoctorPlugin}.
   *   4. Check the `apiVersion`.
   *   5. Wrap scanners/analyzers and register them with the internal registries.
   *
   * A failure at any step does NOT prevent other plugins from loading.
   *
   * @returns A summary of loaded and failed plugins.
   */
  public async loadAll(): Promise<PluginLoadSummary> {
    const loaded: RepoDoctorPlugin[] = [];
    const failed: Array<{ name: string; error: string }> = [];

    for (const pluginPath of this.params.pluginPaths) {
      try {
        const plugin = await this.loadOne(pluginPath);
        loaded.push(plugin);
        this.registerPlugin(plugin);
        this.params.logger.debug('Plugin loaded successfully.', {
          pluginName: plugin.name,
          pluginVersion: plugin.version,
          scannerCount: plugin.scanners?.length ?? 0,
          analyzerCount: plugin.analyzers?.length ?? 0,
        });
      } catch (error) {
        const name = this.extractPluginName(pluginPath);
        // loadOne always wraps errors in PluginError (which extends Error).
        const message = error instanceof Error ? error.message : String(error);
        failed.push({ name, error: message });
        this.params.logger.warn(`Failed to load plugin '${name}': ${message}`, {});
      }
    }

    return { loaded, failed };
  }

  /**
   * Load and validate a single plugin module.
   *
   * @throws {PluginError} if the module cannot be imported or the
   *   export is invalid.
   * @throws {PluginApiVersionMismatchError} if the apiVersion does not
   *   match {@link PLUGIN_API_VERSION}.
   */
  private async loadOne(pluginPath: string): Promise<RepoDoctorPlugin> {
    const name = this.extractPluginName(pluginPath);

    // Bare specifier (npm package name) — use import() directly so Node's
    // package resolver kicks in. Wrap in a timeout so a hanging top-level
    // await in the plugin module doesn't wedge the entire loadAll() call.
    if (this.isBareSpecifier(pluginPath)) {
      let module: { default?: unknown };
      try {
        module = (await this.withTimeout(import(pluginPath) as Promise<{ default?: unknown }>, name)) as { default?: unknown };
      } catch (error) {
        throw new PluginError(name, `Failed to import module: ${error instanceof Error ? error.message : String(error)}`, {
          cause: error,
        });
      }
      let plugin: unknown = module.default ?? module;
      // Await Promise exports (e.g. module.exports = (async () => ({...}))()).
      if (plugin instanceof Promise) {
        plugin = await plugin;
      }
      if (plugin === undefined || plugin === null) {
        throw new PluginError(name, 'Module has no default export');
      }
      this.validatePlugin(plugin, pluginPath);
      return plugin as RepoDoctorPlugin;
    }

    // File path — resolve to absolute.
    const resolvedPath = this.resolvePluginPath(pluginPath);

    // Convert to a proper file:// URL for cross-platform import().
    //
    // Node's import() requires either a bare specifier, a relative
    // specifier, or a fully-qualified URL for absolute paths — a raw
    // OS path (especially "C:\..." or forward-slash "C:/..." on
    // Windows) is not a valid ES module specifier and can be
    // misinterpreted by the resolver (observed failure: a Windows
    // drive path with forward slashes collapsing to a "directory
    // import" of the drive root). pathToFileURL() produces the
    // correct "file:///C:/Users/.../plugin.js" form that Node's
    // native import() (and Vitest's module runner, which itself loads
    // test files via file:// URLs) resolves reliably on every
    // platform.
    const importUrl = pathToFileURL(resolvedPath).href;

    // Try dynamic import() first, wrapped in a 5s timeout. This handles
    // BOTH CJS (module.exports) and ESM (export default / export const)
    // correctly — Node's ESM interop sets module.default to module.exports
    // for CJS files.
    let plugin: unknown;
    try {
      const module = (await this.withTimeout(import(importUrl) as Promise<{ default?: unknown }>, name)) as { default?: unknown };
      plugin = module.default;
    } catch (importError) {
      // If import() failed, try require() as a fallback. This handles
      // edge cases where the environment's import() doesn't support
      // certain path formats. require() is the native CJS loader and
      // handles platform-native paths (backslashes on Windows).
      try {
        const req = this.getRequire();
        plugin = req(resolvedPath);
      } catch (requireError) {
        // Both import() and require() failed. Use the original import()
        // error message (it's usually more descriptive), but mention
        // both attempts so debugging is easier.
        const importMsg = importError instanceof Error ? importError.message : String(importError);
        const requireMsg = requireError instanceof Error ? requireError.message : String(requireError);
        throw new PluginError(name, `Failed to import module: ${importMsg}`, {
          cause: importError,
          context: { requireError: requireMsg },
        });
      }
    }

    // Await Promise exports (e.g. module.exports = (async () => ({...}))()).
    if (plugin instanceof Promise) {
      try {
        plugin = await plugin;
      } catch (error) {
        throw new PluginError(name, `Plugin factory rejected: ${error instanceof Error ? error.message : String(error)}`, {
          cause: error,
        });
      }
    }

    // Extract the plugin object. For CJS via import(), module.default is
    // the module.exports. For ESM, module.default is the default export.
    // For ESM without a default export, module.default is undefined.
    if (plugin === undefined || plugin === null) {
      throw new PluginError(name, 'Module has no default export');
    }

    // Validate the plugin shape.
    this.validatePlugin(plugin, pluginPath);

    return plugin as RepoDoctorPlugin;
  }

  /**
   * Race a promise against a timeout. If the timeout fires, throw a
   * PluginError with a clear message. This prevents a hanging plugin
   * module (e.g. one with a top-level `await fetch(...)` and no timeout)
   * from wedging the entire loadAll() call.
   *
   * Note: this does NOT cancel the underlying promise — the hung module
   * keeps evaluating in the background. True cancellation requires
   * worker_threads. But at least loadAll() returns and other plugins
   * can still load.
   */
  private async withTimeout<T>(promise: Promise<T>, pluginName: string, timeoutMs = 5000): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new PluginError(pluginName, `Plugin module load timed out after ${timeoutMs}ms`, {}));
      }, timeoutMs);
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }

  /**
   * Lazily construct a require() function. In CJS-compiled code, the
   * global `require` is available directly. In ESM, we use createRequire
   * with the current module's URL. We cache the result so we only do
   * this once.
   */
  private getRequire(): NodeRequire {
    if (this._require !== undefined) {
      return this._require;
    }
    // In CJS output, `require` is a global. We check at runtime to avoid
    // TypeScript errors in ESM-compiled contexts.
    if (typeof require === 'function') {
      this._require = require;
    } else {
      // ESM fallback — construct a require from the current module URL.
      this._require = createRequire(pathToFileURL(__filename).href);
    }
    return this._require;
  }

  private _require: NodeRequire | undefined;

  /**
   * Returns true if `pluginPath` is a bare module specifier (npm package
   * name) rather than a file path.
   *
   * Bare specifiers start with a letter/number and do NOT start with:
   *   - `./` or `../` (relative paths)
   *   - `/` (absolute POSIX path)
   *   - `C:\` or `C:/` (Windows drive path)
   *   - `\\` or `//` (UNC path, e.g. `\\server\share\plugin.js`)
   */
  private isBareSpecifier(p: string): boolean {
    if (p.startsWith('./') || p.startsWith('../') || p.startsWith('/')) {
      return false;
    }
    // Windows drive path: "C:\..." or "C:/..."
    if (/^[A-Za-z]:[\\/]/.test(p)) {
      return false;
    }
    // UNC path: "\\server\share\..." or "//server/share/..."
    // (backslash form — forward slash form is caught by startsWith('/') above)
    if (p.startsWith('\\\\')) {
      return false;
    }
    // Also catch "C:" without a separator (unlikely but safe).
    if (/^[A-Za-z]:$/.test(p)) {
      return false;
    }
    return true;
  }

  /**
   * Validate a plugin object against the {@link RepoDoctorPlugin} schema.
   *
   * @throws {PluginError} if the shape is invalid.
   * @throws {PluginApiVersionMismatchError} if the apiVersion does not match.
   */
  private validatePlugin(plugin: unknown, pluginPath: string): void {
    const name = this.extractPluginName(pluginPath);

    if (typeof plugin !== 'object' || plugin === null) {
      throw new PluginError(name, 'Plugin must be an object');
    }

    const obj = plugin as Record<string, unknown>;

    if (typeof obj.name !== 'string' || obj.name === '') {
      throw new PluginError(name, 'Plugin must have a non-empty "name" string');
    }

    if (typeof obj.version !== 'string' || obj.version === '') {
      throw new PluginError(obj.name, 'Plugin must have a non-empty "version" string');
    }

    if (typeof obj.apiVersion !== 'number') {
      throw new PluginError(obj.name, 'Plugin must have a numeric "apiVersion"');
    }

    if (obj.apiVersion !== PLUGIN_API_VERSION) {
      throw new PluginApiVersionMismatchError(
        obj.name,
        PLUGIN_API_VERSION,
        obj.apiVersion,
      );
    }

    // Validate scanners array if present.
    if (obj.scanners !== undefined) {
      if (!Array.isArray(obj.scanners)) {
        throw new PluginError(obj.name, '"scanners" must be an array');
      }
      for (let i = 0; i < obj.scanners.length; i++) {
        this.validateScannerDefinition(obj.scanners[i], obj.name, i);
      }
    }

    // Validate analyzers array if present.
    if (obj.analyzers !== undefined) {
      if (!Array.isArray(obj.analyzers)) {
        throw new PluginError(obj.name, '"analyzers" must be an array');
      }
      for (let i = 0; i < obj.analyzers.length; i++) {
        this.validateAnalyzerDefinition(obj.analyzers[i], obj.name, i);
      }
    }
  }

  /**
   * Validate a single scanner definition.
   */
  private validateScannerDefinition(
    def: unknown,
    pluginName: string,
    index: number,
  ): void {
    if (typeof def !== 'object' || def === null) {
      throw new PluginError(pluginName, `scanners[${index}] must be an object`);
    }
    const obj = def as Record<string, unknown>;
    if (typeof obj.id !== 'string' || obj.id === '') {
      throw new PluginError(pluginName, `scanners[${index}] must have a non-empty "id" string`);
    }
    if (typeof obj.supports !== 'function') {
      throw new PluginError(pluginName, `scanners[${index}] must have a "supports" function`);
    }
    if (typeof obj.scan !== 'function') {
      throw new PluginError(pluginName, `scanners[${index}] must have a "scan" function`);
    }
  }

  /**
   * Validate a single analyzer definition.
   */
  private validateAnalyzerDefinition(
    def: unknown,
    pluginName: string,
    index: number,
  ): void {
    if (typeof def !== 'object' || def === null) {
      throw new PluginError(pluginName, `analyzers[${index}] must be an object`);
    }
    const obj = def as Record<string, unknown>;
    if (typeof obj.id !== 'string' || obj.id === '') {
      throw new PluginError(pluginName, `analyzers[${index}] must have a non-empty "id" string`);
    }
    if (typeof obj.supports !== 'function') {
      throw new PluginError(pluginName, `analyzers[${index}] must have a "supports" function`);
    }
    if (typeof obj.analyze !== 'function') {
      throw new PluginError(pluginName, `analyzers[${index}] must have an "analyze" function`);
    }
  }

  /**
   * Register a validated plugin's scanners and analyzers with the
   * internal registries.
   */
  private registerPlugin(plugin: RepoDoctorPlugin): void {
    // Register scanners.
    if (plugin.scanners !== undefined) {
      for (const scannerDef of plugin.scanners) {
        const wrapper = new PluginScannerWrapper(scannerDef, this.params.eventBus);
        try {
          this.params.scannerRegistry.register(wrapper);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.params.logger.warn(`Failed to register scanner '${scannerDef.id}': ${message}`, {
            pluginName: plugin.name,
          });
        }
      }
    }

    // Register analyzers.
    if (plugin.analyzers !== undefined) {
      for (const analyzerDef of plugin.analyzers) {
        const wrapper = new PluginAnalyzerWrapper(analyzerDef, this.params.eventBus);
        try {
          this.params.analyzerRegistry.register(wrapper);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.params.logger.warn(`Failed to register analyzer '${analyzerDef.id}': ${message}`, {
            pluginName: plugin.name,
          });
        }
      }
    }
  }

  /**
   * Resolve a plugin path to an absolute filesystem path.
   *
   * This is only called for file paths (bare specifiers are handled
   * separately in {@link loadOne}). Relative paths (`./`, `../`) are
   * resolved against the base path; absolute paths are returned as-is.
   */
  private resolvePluginPath(pluginPath: string): string {
    if (pluginPath.startsWith('./') || pluginPath.startsWith('../')) {
      return nodeResolve(this.params.basePath, pluginPath);
    }
    // Absolute path (Unix `/` or Windows `C:\`) — return as-is.
    return pluginPath;
  }

  /**
   * Extract a human-readable plugin name from a path for error messages.
   */
  private extractPluginName(pluginPath: string): string {
    // For npm packages: use the name directly.
    // For file paths: use the basename without extension.
    if (pluginPath.startsWith('./') || pluginPath.startsWith('/') || pluginPath.startsWith('../') || /^[A-Za-z]:[\\/]/.test(pluginPath)) {
      const parts = pluginPath.split(/[/\\]/);
      // split always returns at least one element; cast to satisfy noUncheckedIndexedAccess.
      const last = parts[parts.length - 1] as string;
      return last.replace(/\.\w+$/, '');
    }
    return pluginPath;
  }
}
