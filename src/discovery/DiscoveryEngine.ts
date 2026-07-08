/**
 * Discovery Engine.
 *
 * Orchestrates the repository discovery pipeline:
 *   1. Read the root directory (non-recursively).
 *   2. Map entries to {@link DiscoveredFile} objects (fetching sizes).
 *   3. Identify and parse `package.json` (if present).
 *   4. Run the four detectors in parallel.
 *   5. Assemble a {@link RepositoryProfile}.
 *   6. Generate a {@link RepositoryFingerprint}.
 *   7. Return a {@link DiscoveryResult}.
 *
 * Architectural role: discovery — may import from core, infrastructure,
 * errors, utils. This module imports `core/IFileSystem`,
 * `core/domain/Discovery`, `core/domain/Repository`, the four detectors,
 * the package.json parser, and the fingerprint generator.
 */

import type { DirEntry, IFileSystem } from '@repodoctor/core/IFileSystem';
import type { IScannerFileSystem } from '@repodoctor/core/IScannerFileSystem';
import type { ILogger } from '@repodoctor/core/ILogger';
import type {
  DiscoveredConfig,
  DiscoveredFile,
  DiscoveryResult,
  FrameworkGuess,
  Language,
  PackageManager,
  RepositoryProfile,
  RepositoryType,
} from '@repodoctor/core/domain/Discovery';
import type { Repository } from '@repodoctor/core/domain/Repository';
import { parsePackageJson, type PackageJsonData } from '@repodoctor/discovery/parsers/PackageJsonParser';
import { detectPackageManager } from '@repodoctor/discovery/detectors/PackageManagerDetector';
import { detectLanguage } from '@repodoctor/discovery/detectors/LanguageDetector';
import { detectMonorepo } from '@repodoctor/discovery/detectors/MonorepoDetector';
import { detectFrameworks } from '@repodoctor/discovery/detectors/FrameworkDetector';
import { generateFingerprint } from '@repodoctor/discovery/FingerprintGenerator';

/**
 * Maximum number of root files to capture. Per the v0.0.2 spec, this
 * prevents memory bloat on malformed directories.
 */
const MAX_ROOT_FILES = 50;

/**
 * Config files whose presence is probed during discovery. The list is
 * intentionally short — we only probe files that the detectors or the
 * CLI output reference.
 */
const PROBED_CONFIG_FILES: readonly string[] = [
  'tsconfig.json',
  'package.json',
  'pnpm-workspace.yaml',
  'lerna.json',
  'requirements.txt',
  'pyproject.toml',
  'go.mod',
  'Cargo.toml',
];

/**
 * Parameters accepted by {@link DiscoveryEngine}.
 */
export interface DiscoveryEngineParams {
  /** File system to read from. */
  readonly fileSystem: IFileSystem;
  /** The repository to discover (provides the root path and name). */
  readonly repository: Repository;
  /** Logger for `--debug` step-by-step output. May be a no-op logger. */
  readonly logger: ILogger;
  /** List of root-level directory names to ignore (from config). */
  readonly ignoreRoot: readonly string[];
}

/**
 * Orchestrates the repository discovery pipeline.
 *
 * Constructed once per CLI invocation. The {@link run} method is the
 * single entry point — it returns a {@link DiscoveryResult} or throws
 * an error (e.g. {@link MalformedJsonError}) for the caller to surface.
 */
export class DiscoveryEngine {
  constructor(private readonly params: DiscoveryEngineParams) {}

  /**
   * Run the discovery pipeline.
   *
   * @returns A {@link DiscoveryResult} describing the repository.
   * @throws {MalformedJsonError} when `package.json` exists but is not
   *   valid JSON.
   * @throws {Error} for any other I/O failure (permissions, etc.).
   */
  public async run(): Promise<DiscoveryResult> {
    const { fileSystem, repository, logger } = this.params;
    const root = repository.path;

    logger.debug('Discovery starting.', { root });

    // --- Step 1: read root directory ---
    const entries = await fileSystem.readDir(root);
    logger.debug('Root directory read.', { entryCount: entries.length });

    // --- Step 2: map to DiscoveredFile[] ---
    const rootFiles = await this.collectRootFiles(entries, root);
    logger.debug('Root files collected.', { count: rootFiles.length });

    // --- Step 3: parse package.json ---
    const packageJsonPath = rootFiles.find((f) => f.name === 'package.json')?.path;
    const packageJson = packageJsonPath !== undefined
      ? await parsePackageJson(fileSystem, packageJsonPath)
      : null;
    logger.debug('package.json parsed.', { found: packageJson !== null });

    // --- Step 4: run detectors in parallel ---
    // For v0.0.9, we need to pre-extract non-Node dependencies for
    // framework detection. We do this with quick reads.
    const fileNames = new Set(rootFiles.map((f) => f.name));
    let pythonDeps: string[] = [];
    let goDeps: string[] = [];
    let rustDeps: string[] = [];

    if (fileNames.has('requirements.txt') || fileNames.has('pyproject.toml')) {
      try {
        const { parsePythonManifest } = await import('@repodoctor/scanner/parsers/PythonManifestParser');
        const scannerFs = this.createQuickScannerFs(fileSystem, root);
        const pyData = await parsePythonManifest(scannerFs);
        if (pyData !== null) pythonDeps = [...pyData.dependencies];
      } catch { /* non-fatal */ }
    }
    if (fileNames.has('go.mod')) {
      try {
        const { parseGoMod } = await import('@repodoctor/scanner/parsers/GoModParser');
        const scannerFs = this.createQuickScannerFs(fileSystem, root);
        const goData = await parseGoMod(scannerFs);
        if (goData !== null) goDeps = [...goData.dependencies];
      } catch { /* non-fatal */ }
    }
    if (fileNames.has('Cargo.toml')) {
      try {
        const { parseCargoToml } = await import('@repodoctor/scanner/parsers/CargoTomlParser');
        const scannerFs = this.createQuickScannerFs(fileSystem, root);
        const rustData = await parseCargoToml(scannerFs);
        if (rustData !== null) rustDeps = [...rustData.dependencies];
      } catch { /* non-fatal */ }
    }

    const [pmResult, langResult, monoResult, frameworks] = await Promise.all([
      Promise.resolve(detectPackageManager(rootFiles, packageJson)),
      Promise.resolve(detectLanguage(rootFiles, packageJson)),
      Promise.resolve(detectMonorepo(rootFiles, packageJson)),
      Promise.resolve(detectFrameworks({ packageJson, rootFiles, pythonDeps, goDeps, rustDeps })),
    ]);
    logger.debug('Detectors completed.', {
      packageManager: pmResult.packageManager,
      languages: langResult.languages.join(','),
      isMonorepo: monoResult.isMonorepo,
      frameworkCount: frameworks.length,
    });

    // --- Step 5: assemble profile ---
    const profile = this.assembleProfile(
      rootFiles,
      packageJson,
      pmResult.packageManager,
      langResult.languages,
      monoResult.isMonorepo,
      monoResult.workspaces,
      frameworks,
      pythonDeps,
      goDeps,
      rustDeps,
    );

    // --- Step 6: fingerprint ---
    const fingerprint = generateFingerprint(profile);
    logger.debug('Fingerprint generated.', { hash: fingerprint.hash });

    // --- Step 7: return result ---
    const result: DiscoveryResult = {
      profile,
      fingerprint,
      discoveredAt: new Date().toISOString(),
    };
    logger.debug('Discovery complete.', { discoveredAt: result.discoveredAt });
    return result;
  }

  /**
   * Convert directory entries into {@link DiscoveredFile} objects.
   *
   * Filters out directories (and entries in the `ignoreRoot` list, as a
   * secondary safeguard). Caps the result at {@link MAX_ROOT_FILES}
   * entries. Fetches the size of each file via `IFileSystem.stat`.
   */
  private async collectRootFiles(
    entries: readonly DirEntry[],
    root: string,
  ): Promise<DiscoveredFile[]> {
    const { fileSystem, ignoreRoot } = this.params;
    const ignoreSet = new Set(ignoreRoot);

    // Sort entries by name BEFORE applying the cap. `readdir` order is
    // non-deterministic across platforms (ext4/NTFS/APFS return different
    // orders), so without sorting, the 50-file cap can silently exclude
    // manifest files (package.json, requirements.txt, etc.) on some
    // platforms — causing total repo misclassification.
    const sortedEntries = [...entries].sort((a, b) => a.name.localeCompare(b.name));

    const files: DiscoveredFile[] = [];
    for (const entry of sortedEntries) {
      if (!entry.isFile) {
        // Skip directories and other non-file types.
        continue;
      }
      if (ignoreSet.has(entry.name)) {
        // Secondary safeguard: even if a directory somehow reports as a
        // file (e.g. via a symlink), honor the ignore list.
        continue;
      }
      if (files.length >= MAX_ROOT_FILES) {
        // Cap reached — stop processing to bound memory usage.
        break;
      }
      const fullPath = this.joinPath(root, entry.name);
      const stats = await fileSystem.stat(fullPath);
      files.push({
        name: entry.name,
        path: fullPath,
        size: stats.size,
      });
    }
    return files;
  }

  /**
   * Assemble a {@link RepositoryProfile} from the detector outputs.
   */
  private assembleProfile(
    rootFiles: readonly DiscoveredFile[],
    packageJson: PackageJsonData | null,
    packageManager: PackageManager,
    languages: readonly Language[],
    isMonorepo: boolean,
    workspaces: readonly string[],
    frameworks: readonly FrameworkGuess[],
    _pythonDeps: readonly string[],
    _goDeps: readonly string[],
    _rustDeps: readonly string[],
  ): RepositoryProfile {
    const name = this.resolveName(packageJson, rootFiles);
    const type = this.resolveType(packageJson, isMonorepo, packageManager);
    const configFiles = this.probeConfigFiles(rootFiles);

    return {
      name,
      type,
      languages,
      packageManager,
      isMonorepo,
      workspaces,
      frameworks,
      rootFiles,
      configFiles,
    };
  }

  /**
   * Resolve the repository name. Priority:
   *   1. `package.json#name` (if present and non-empty).
   *   2. The repository folder name (from {@link Repository.name}).
   */
  private resolveName(
    packageJson: PackageJsonData | null,
    _rootFiles: readonly DiscoveredFile[],
  ): string {
    if (packageJson?.name !== undefined && packageJson.name.length > 0) {
      return packageJson.name;
    }
    return this.params.repository.name;
  }

  /**
   * Resolve the {@link RepositoryType}.
   *
   * - No `package.json` -> `Unknown`.
   * - `package.json` + monorepo signal -> `NodeMonorepo`.
   * - `package.json` + no monorepo signal -> `NodeApplication`.
   */
  private resolveType(
    packageJson: PackageJsonData | null,
    isMonorepo: boolean,
    packageManager: PackageManager,
  ): RepositoryType {
    if (packageJson !== null) {
      return isMonorepo ? 'NodeMonorepo' : 'NodeApplication';
    }
    // v0.0.9: Non-Node ecosystems.
    if (packageManager === 'Pip' || packageManager === 'Poetry') {
      return 'PythonApplication';
    }
    if (packageManager === 'GoModules') {
      return 'GoApplication';
    }
    if (packageManager === 'Cargo') {
      return 'RustApplication';
    }
    return 'Unknown';
  }

  /**
   * Probe the {@link PROBED_CONFIG_FILES} list against the discovered
   * root files.
   */
  private probeConfigFiles(rootFiles: readonly DiscoveredFile[]): DiscoveredConfig[] {
    const present = new Set(rootFiles.map((f) => f.name));
    return PROBED_CONFIG_FILES.map((name) => ({
      name,
      exists: present.has(name),
    }));
  }

  /**
   * Join a root path and a file name. We use a simple string check
   * rather than importing `node:path` to keep the discovery layer
   * testable and platform-independent (the `Repository` already provides
   * an absolute path with the correct separator).
   */
  private joinPath(root: string, name: string): string {
    if (root.endsWith('/') || root.endsWith('\\')) {
      return root + name;
    }
    return `${root}/${name}`;
  }

  /**
   * Create a minimal IScannerFileSystem adapter for the discovery engine
   * to read manifest files during the detection phase (v0.0.9).
   *
   * This adapter delegates to the injected IFileSystem, translating
   * relative paths to absolute paths against the repository root.
   */
  private createQuickScannerFs(
    fileSystem: IFileSystem,
    root: string,
  ): IScannerFileSystem {
    const joinPath = (p: string) => {
      if (root.endsWith('/') || root.endsWith('\\')) return root + p;
      return `${root}/${p}`;
    };
    return {
      readFile: (p: string) => fileSystem.readFile(joinPath(p)),
      fileExists: (p: string) => fileSystem.exists(joinPath(p)),
      getFileSize: async (p: string) => {
        const stats = await fileSystem.stat(joinPath(p));
        return stats.size;
      },
      readFileLines: async (p: string, start: number, end: number) => {
        const content = await fileSystem.readFile(joinPath(p));
        const lines = content.split('\n');
        return lines.slice(Math.max(0, start - 1), end);
      },
    };
  }
}
