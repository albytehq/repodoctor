/**
 * Manifest Analyzer.
 *
 * Evaluates `package.json` manifest facts and produces findings about
 * project configuration:
 *   - `lockfile-missing`: Dependencies are declared but no lockfile exists.
 *   - `script-missing-build`: The `build` script is not defined.
 *
 * Triggers: `profile.type` is `NodeApplication` or `NodeMonorepo`.
 *
 * Architectural role: analyzer/builtins — uses only the injected
 * `AnalyzerContext.factStore` (read-only). Performs NO I/O.
 */

import type { RawFinding } from '@repodoctor/core/domain/Analysis';
import type { RepositoryProfile } from '@repodoctor/core/domain/Discovery';
import type { IAnalyzer, AnalyzerContext } from '@repodoctor/analyzer/IAnalyzer';

/**
 * Analyzer that evaluates manifest (package.json) configuration.
 */
export class ManifestAnalyzer implements IAnalyzer {
  public readonly id = 'manifest-analyzer';
  public readonly version = '1.0.0';

  public supports(profile: RepositoryProfile): boolean {
    return (
      profile.type === 'NodeApplication' ||
      profile.type === 'NodeMonorepo' ||
      profile.type === 'PythonApplication' ||
      profile.type === 'GoApplication' ||
      profile.type === 'RustApplication'
    );
  }

  public execute(context: AnalyzerContext): Promise<RawFinding[]> {
    const findings: RawFinding[] = [];
    const { factStore, profile } = context;

    // Determine which manifest target to look for based on the profile.
    const manifestTargets = this.getManifestTargets(profile);

    for (const target of manifestTargets) {
      // --- Rule: lockfile-missing ---
      const deps = this.getFactValue<string[]>(factStore, 'DEPENDENCY_DECLARED', target);
      const lockfileExists = this.getFactValue<boolean>(factStore, 'PACKAGE_MANAGER_LOCKFILE_EXISTS', target);

      if (deps !== undefined && deps.length > 0 && lockfileExists === false) {
        findings.push({
          ruleId: 'lockfile-missing',
          target,
          message: `Dependencies are declared in ${target} but no lockfile was found. Commit a lockfile for reproducible installs.`,
          metadata: { dependencyCount: deps.length },
        });
      }
    }

    // --- Rule: script-missing-build (Node.js only) ---
    if (profile.type === 'NodeApplication' || profile.type === 'NodeMonorepo') {
      const scripts = this.getFactValue<string[]>(factStore, 'SCRIPT_DEFINED', 'package.json');
      if (scripts !== undefined && !scripts.includes('build')) {
        findings.push({
          ruleId: 'script-missing-build',
          target: 'package.json',
          message: 'The "build" script is not defined in package.json. A build script ensures consistent production builds.',
        });
      }
    }

    return Promise.resolve(findings);
  }

  /**
   * Get the manifest file targets to check based on the profile.
   */
  private getManifestTargets(profile: RepositoryProfile): string[] {
    const targets: string[] = [];
    if (profile.type === 'NodeApplication' || profile.type === 'NodeMonorepo') {
      targets.push('package.json');
    }
    if (profile.type === 'PythonApplication') {
      targets.push('requirements.txt', 'pyproject.toml');
    }
    if (profile.type === 'GoApplication') {
      targets.push('go.mod');
    }
    if (profile.type === 'RustApplication') {
      targets.push('Cargo.toml');
    }
    return targets;
  }

  /**
   * Extract the `value` of a fact with the given type and target.
   * Returns `undefined` if the fact does not exist.
   */
  private getFactValue<T>(factStore: AnalyzerContext['factStore'], type: string, target: string): T | undefined {
    const facts = factStore.getByType(type);
    for (const fact of facts) {
      if (fact.target === target) {
        return fact.value as T;
      }
    }
    return undefined;
  }
}
