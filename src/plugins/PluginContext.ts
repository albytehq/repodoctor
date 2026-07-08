/**
 * Plugin context factory.
 *
 * Creates sandboxed {@link PluginScannerContext} and
 * {@link PluginAnalyzerContext} objects that are passed to external
 * plugin code. These contexts strictly do NOT expose the EventBus,
 * Logger, or ExecutionContext.
 *
 * Architectural role: plugins — may import from core, utils, errors,
 * scanner, analyzer, config. This module imports core interfaces and
 * the infrastructure path-safe filesystem.
 */

import type { PluginScannerContext, PluginAnalyzerContext, PluginFileSystem } from '@repodoctor/plugins/types';
import type { RepositoryProfile } from '@repodoctor/core/domain/Discovery';
import type { IFactStore } from '@repodoctor/core/IFactStore';
import type { IScannerFileSystem } from '@repodoctor/core/IScannerFileSystem';

/**
 * Create a sandboxed {@link PluginScannerContext} from an internal
 * {@link IScannerFileSystem} and a {@link RepositoryProfile}.
 *
 * The resulting context exposes a restricted {@link PluginFileSystem}
 * that delegates to the internal scanner filesystem (which already
 * enforces path traversal protection and file size limits). The plugin
 * cannot access the EventBus, Logger, or ExecutionContext.
 */
export function createPluginScannerContext(
  fs: IScannerFileSystem,
  profile: RepositoryProfile,
): PluginScannerContext {
  const pluginFs: PluginFileSystem = {
    readFile: (path: string) => fs.readFile(path),
    fileExists: (path: string) => fs.fileExists(path),
    getFileSize: (path: string) => fs.getFileSize(path),
    readFileLines: (path: string, start: number, end: number) =>
      fs.readFileLines(path, start, end),
  };

  return Object.freeze({
    fs: pluginFs,
    profile,
  });
}

/**
 * Create a sandboxed {@link PluginAnalyzerContext} from a read-only
 * {@link IFactStore} and a {@link RepositoryProfile}.
 *
 * The resulting context exposes the fact store (which is already
 * read-only — it only has query methods) and the profile. The plugin
 * cannot access the EventBus, Logger, or ExecutionContext.
 */
export function createPluginAnalyzerContext(
  factStore: IFactStore,
  profile: RepositoryProfile,
): PluginAnalyzerContext {
  return Object.freeze({
    factStore,
    profile,
  });
}
