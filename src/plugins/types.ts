/**
 * Plugin public API types.
 *
 * This is the public contract that 3rd-party plugin authors implement.
 * It defines the shape of a RepoDoctor plugin, including scanner and
 * analyzer definitions, and the sandboxed contexts they receive.
 *
 * Architectural role: plugins — type-only. May be imported by `core/`,
 * `cli/`, and external plugin authors.
 */

import type { RepositoryProfile } from '@repodoctor/core/domain/Discovery';
import type { RawFact } from '@repodoctor/core/domain/Scan';
import type { RawFinding } from '@repodoctor/core/domain/Analysis';
import type { IFactStore } from '@repodoctor/core/IFactStore';

/**
 * The API version that plugins must target. Currently `1`.
 *
 * If a plugin's `apiVersion` does not match this value, it is rejected
 * with a `PluginApiVersionMismatchError`.
 */
export const PLUGIN_API_VERSION = 1;

/**
 * A sandboxed, read-only filesystem interface for plugin scanners.
 *
 * All paths are resolved relative to the repository root. Path
 * traversal outside the root throws {@link PermissionError}.
 */
export interface PluginFileSystem {
  /** Read a file as UTF-8 string. Path is resolved against repo root. */
  readFile(path: string): Promise<string>;
  /** Check if a file exists. Path is resolved against repo root. */
  fileExists(path: string): Promise<boolean>;
  /** Get file size in bytes. Path is resolved against repo root. */
  getFileSize(path: string): Promise<number>;
  /** Read a range of lines (1-indexed, inclusive). */
  readFileLines(path: string, start: number, end: number): Promise<string[]>;
}

/**
 * The sandboxed context passed to a plugin scanner's `scan` function.
 *
 * Strictly does NOT expose:
 *   - The EventBus
 *   - The Logger
 *   - The ExecutionContext
 *   - Any write capabilities
 */
export interface PluginScannerContext {
  /** Read-only, path-traversal-protected filesystem. */
  readonly fs: PluginFileSystem;
  /** The repository profile from v0.0.2 discovery. */
  readonly profile: RepositoryProfile;
}

/**
 * The sandboxed context passed to a plugin analyzer's `analyze` function.
 *
 * Strictly does NOT expose:
 *   - The EventBus
 *   - The Logger
 *   - The ExecutionContext
 *   - Any write capabilities
 */
export interface PluginAnalyzerContext {
  /** Read-only fact store (immutable, mutation attempts throw). */
  readonly factStore: IFactStore;
  /** The repository profile from v0.0.2 discovery. */
  readonly profile: RepositoryProfile;
}

/**
 * A scanner definition provided by a plugin.
 */
export interface PluginScannerDefinition {
  /** Unique scanner ID (kebab-case recommended). */
  readonly id: string;
  /** Determines if this scanner should run for the given profile. */
  supports(profile: RepositoryProfile): boolean;
  /** Execute the scan. Must return an array of {@link RawFact}. */
  scan(context: PluginScannerContext): Promise<RawFact[]>;
}

/**
 * An analyzer definition provided by a plugin.
 */
export interface PluginAnalyzerDefinition {
  /** Unique analyzer ID (kebab-case recommended). */
  readonly id: string;
  /** Determines if this analyzer should run for the given profile. */
  supports(profile: RepositoryProfile): boolean;
  /** Execute the analysis. Must return an array of {@link RawFinding}. */
  analyze(context: PluginAnalyzerContext): Promise<RawFinding[]>;
}

/**
 * The complete plugin definition that 3rd-party authors export as the
 * default export of their module.
 */
export interface RepoDoctorPlugin {
  /** Unique kebab-case name (e.g. `repodoctor-nextjs`). */
  readonly name: string;
  /** Semantic version string (e.g. `1.0.0`). */
  readonly version: string;
  /** Must match {@link PLUGIN_API_VERSION}. */
  readonly apiVersion: number;
  /** Optional scanner definitions provided by this plugin. */
  readonly scanners?: readonly PluginScannerDefinition[];
  /** Optional analyzer definitions provided by this plugin. */
  readonly analyzers?: readonly PluginAnalyzerDefinition[];
}

/**
 * Result of loading a single plugin.
 */
export interface PluginLoadResult {
  readonly plugin: RepoDoctorPlugin;
  readonly status: 'loaded' | 'failed';
  readonly error?: string;
}

/**
 * Result of loading all plugins.
 */
export interface PluginLoadSummary {
  readonly loaded: readonly RepoDoctorPlugin[];
  readonly failed: ReadonlyArray<{ name: string; error: string }>;
}
