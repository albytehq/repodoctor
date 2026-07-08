/**
 * Config loader.
 *
 * Orchestrates discovery, reading, parsing, validation, and merging of the
 * RepoDoctor configuration. The loader is the single entry point for all
 * config-related I/O.
 *
 * Architectural role: config — may import from core, errors,
 * infrastructure, utils. This module imports the {@link IFileSystem}
 * interface (core) so that tests can inject an in-memory mock.
 */

import type { IFileSystem } from '@repodoctor/core/IFileSystem';
import type { RepoDoctorConfig } from '@repodoctor/config/types';
import type { Path } from '@repodoctor/infrastructure/Path';
import { createRequire } from 'node:module';
import { DEFAULT_CONFIG, cloneDefaultConfig } from '@repodoctor/config/DefaultConfig';
import { validateConfig } from '@repodoctor/config/ConfigValidator';
import { ConfigError } from '@repodoctor/errors/ConfigError';
import { FileNotFoundError } from '@repodoctor/errors/FileNotFoundError';

/**
 * Built-in config file names searched (in order) when no `--config` flag
 * is supplied.
 */
const CONFIG_FILE_CANDIDATES: readonly string[] = [
  'repodoctor.config.json',
  'repodoctor.config.js',
] as const;

/**
 * Parameters accepted by {@link ConfigLoader.load}.
 */
export interface ConfigLoaderParams {
  /**
   * Absolute path to a config file explicitly requested via `--config`.
   * When set, the loader skips discovery and loads only this file.
   */
  readonly explicitPath?: string;
  /** Absolute path of the working directory to search for config files. */
  readonly cwd: string;
}

/**
 * Internal result of locating a config file.
 */
interface LocatedConfig {
  readonly path: string;
  readonly kind: 'json' | 'js';
}

/**
 * Orchestrates config discovery, parsing, validation, and merging.
 *
 * The loader is constructed once at CLI startup with its collaborators
 * (filesystem + path helper). It exposes a single `load` method that
 * returns a validated {@link RepoDoctorConfig}.
 */
export class ConfigLoader {
  constructor(
    private readonly fileSystem: IFileSystem,
    private readonly pathHelper: Path,
  ) {}

  /**
   * Discover, read, parse, validate, and merge the RepoDoctor config.
   *
   * Resolution priority (highest first):
   *   1. `params.explicitPath` (the `--config` CLI flag).
   *   2. `repodoctor.config.json` in `params.cwd`.
   *   3. `repodoctor.config.js` in `params.cwd`.
   *   4. The built-in {@link DEFAULT_CONFIG}.
   *
   * @throws {ConfigError} when:
   *   - `explicitPath` is set but the file does not exist (the loader
   *     surfaces this as a `ConfigError`, not a `FileNotFoundError`,
   *     because the user explicitly requested this path — the
   *     distinction matters for error reporting),
   *   - the file exists but cannot be parsed,
   *   - the parsed value fails validation.
   */
  public async load(params: ConfigLoaderParams): Promise<RepoDoctorConfig> {
    const located = await this.locateConfig(params);

    if (located === undefined) {
      // No config file found — return a fresh copy of the default.
      return cloneDefaultConfig();
    }

    const raw = await this.readAndParse(located);
    const result = validateConfig(raw);
    // We discard warnings in v0.0.1 (no logger is plumbed through to the
    // loader). The CLI bootstrap can re-validate later if it wants to
    // surface warnings; here we just return the validated config.
    return this.mergeWithDefault(result.config);
  }

  /**
   * Locate the config file based on resolution priority.
   *
   * Returns `undefined` when no file is found at any candidate location
   * and no explicit path was supplied.
   */
  private async locateConfig(params: ConfigLoaderParams): Promise<LocatedConfig | undefined> {
    if (params.explicitPath !== undefined && params.explicitPath !== '') {
      // Resolve the explicit path against the provided cwd so relative
      // paths behave as callers expect (matching how discovery resolves
      // candidates via pathHelper.join(cwd, candidate)). Absolute paths
      // are unaffected — path.resolve ignores earlier segments when a
      // later segment is absolute.
      const resolved = this.pathHelper.resolve(params.cwd, params.explicitPath);
      const kind = this.inferKind(resolved);
      // We do NOT check `exists` here — if the user explicitly asked for a
      // file and it's missing, we want to fail loudly with a ConfigError,
      // not silently fall back to defaults. The readFile call below will
      // surface the FileNotFoundError, which we translate.
      return { path: resolved, kind };
    }

    for (const candidate of CONFIG_FILE_CANDIDATES) {
      const full = this.pathHelper.join(params.cwd, candidate);
      if (await this.fileSystem.exists(full)) {
        const kind = candidate.endsWith('.js') ? 'js' : 'json';
        return { path: full, kind };
      }
    }

    return undefined;
  }

  /**
   * Infer the file kind from the file extension. Defaults to `json` for
   * unknown extensions (matching Node's historical behavior for
   * `require()` of files without a recognized extension).
   */
  private inferKind(p: string): 'json' | 'js' {
    if (p.toLowerCase().endsWith('.js')) {
      return 'js';
    }
    return 'json';
  }

  /**
   * Read the file from disk and parse it according to its kind.
   */
  private async readAndParse(located: LocatedConfig): Promise<Record<string, unknown>> {
    let contents: string;
    try {
      contents = await this.fileSystem.readFile(located.path);
    } catch (error) {
      if (error instanceof FileNotFoundError) {
        // Translate to ConfigError — the user explicitly asked for this
        // file (either via --config or by placing it in their cwd where
        // our discovery logic picked it up). In either case the right
        // surface error is a config error, not a file-not-found.
        throw new ConfigError(`Config file not found: ${located.path}`, {
          context: { path: located.path },
          cause: error,
        });
      }
      // Re-throw other I/O errors as ConfigError too.
      throw new ConfigError(`Failed to read config file: ${located.path}`, {
        context: { path: located.path },
        cause: error,
      });
    }

    if (located.kind === 'json') {
      return this.parseJson(located.path, contents);
    }
    return this.parseJs(located.path, contents);
  }

  /**
   * Parse a JSON config file. Throws {@link ConfigError} on parse failure.
   *
   * The parsed value must be a plain object — arrays and primitives are
   * rejected.
   */
  private parseJson(path: string, contents: string): Record<string, unknown> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(contents);
    } catch (error) {
      throw new ConfigError(`Config file is not valid JSON: ${path}`, {
        context: { path },
        cause: error,
      });
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ConfigError(
        `Config file must contain a JSON object at top level, got ${parsed === null ? 'null' : Array.isArray(parsed) ? 'array' : typeof parsed}: ${path}`,
        { context: { path } },
      );
    }
    // `parsed` is now narrowed to `object` (non-array). Cast to the
    // expected shape; the validator will check each field.
    return parsed as Record<string, unknown>;
  }

  /**
   * Parse a JS config file by evaluating it in a CommonJS-like scope.
   *
   * We use `Module.createRequire` to construct a require function that
   * resolves relative modules from the CONFIG FILE's directory (not from
   * this loader's directory). The config file is then evaluated in a
   * function scope with `module`, `exports`, `require`, `__dirname`, and
   * `__filename` exposed — matching Node's CommonJS module environment.
   *
   * SECURITY WARNING: This is NOT a sandbox. The `require` function has
   * full access to Node built-ins (`node:fs`, `node:child_process`, etc.).
   * A JS config file can execute arbitrary code with the privileges of
   * the RepoDoctor process. Only use `.js` configs in repositories you
   * trust. For untrusted repos, delete or ignore `repodoctor.config.js`
   * before running RepoDoctor.
   *
   * Future versions may move to a true sandbox (`worker_threads` with
   * restricted APIs, or `isolated-vm`).
   */
  private parseJs(path: string, contents: string): Record<string, unknown> {
    const moduleObj: { exports: unknown } = { exports: {} };
    // Create a require function that resolves from the config file's
    // directory. This fixes the bug where `require('./helper')` in a JS
    // config resolved relative to ConfigLoader.ts instead of the config
    // file.
    const configRequire: NodeRequire = createRequire(path);
    try {
      // We construct a function from source. The `no-implied-eval` lint
      // rule is intentionally disabled for this single statement: this
      // is the standard pattern for evaluating CJS module source in a
      // controlled scope.
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const factory = new Function(
        'module',
        'exports',
        'require',
        '__dirname',
        '__filename',
        `'use strict';\n${contents}`,
      ) as (
        module: { exports: unknown },
        exports: unknown,
        require: NodeRequire,
        dirname: string,
        filename: string,
      ) => void;
      factory(moduleObj, moduleObj.exports, configRequire, this.pathHelper.dirname(path), path);
    } catch (error) {
      throw new ConfigError(`Failed to evaluate JS config file: ${path}`, {
        context: { path },
        cause: error,
      });
    }
    const result = moduleObj.exports;
    if (result === null || typeof result !== 'object' || Array.isArray(result)) {
      throw new ConfigError(
        `JS config file must export an object, got ${result === null ? 'null' : Array.isArray(result) ? 'array' : typeof result}: ${path}`,
        { context: { path } },
      );
    }
    return result as Record<string, unknown>;
  }

  /**
   * Deep-merge a validated user config over the default config.
   *
   * "Deep" in v0.0.1 means: arrays are replaced wholesale (not
   * concatenated), primitives are overwritten, and the merge happens at
   * the top level only (the config schema is flat). This is sufficient
   * for the v0.0.1 schema; deeper merging will be added when nested
   * config sections arrive in v0.1.0.
   */
  private mergeWithDefault(validated: RepoDoctorConfig): RepoDoctorConfig {
    return {
      logLevel: validated.logLevel,
      strict: validated.strict,
      organs: validated.organs.slice(),
      discovery: {
        ignoreRoot: validated.discovery.ignoreRoot.slice(),
      },
      plugins: validated.plugins.slice(),
    };
  }

  /**
   * Returns the built-in default config without performing any I/O.
   * Useful for callers that want to bypass discovery (e.g. when the
   * `--config` flag was explicitly set to a path that doesn't exist but
   * the caller wants to fall back gracefully).
   */
  public getDefault(): RepoDoctorConfig {
    return cloneDefaultConfig();
  }
}

/**
 * Re-export the default config for callers that want to reference it
 * without constructing a loader.
 */
export { DEFAULT_CONFIG };
