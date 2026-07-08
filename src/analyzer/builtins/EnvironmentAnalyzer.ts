/**
 * Environment Analyzer.
 *
 * Evaluates environment-file facts and produces findings about
 * environment configuration:
 *   - `env-file-not-ignored`: `.env` exists but is not in `.gitignore`.
 *   - `env-example-missing`: `.env` exists but `.env.example` does not.
 *
 * Triggers: Always.
 *
 * Architectural role: analyzer/builtins — may import from core,
 * infrastructure, errors, utils, scanner, discovery. Uses only the
 * injected `AnalyzerContext.factStore` (read-only). Performs NO I/O.
 */

import type { RawFinding } from '@repodoctor/core/domain/Analysis';
import type { RepositoryProfile } from '@repodoctor/core/domain/Discovery';
import type { IAnalyzer, AnalyzerContext } from '@repodoctor/analyzer/IAnalyzer';

/**
 * Analyzer that evaluates environment-file configuration.
 *
 * Queries the {@link IFactStore} for `FILE_EXISTS` and
 * `GITIGNORE_ENTRIES` facts. Produces findings when environment files
 * are present but not properly ignored or documented.
 */
export class EnvironmentAnalyzer implements IAnalyzer {
  public readonly id = 'environment-analyzer';
  public readonly version = '1.0.0';

  public supports(_profile: RepositoryProfile): boolean {
    // Always runs.
    return true;
  }

  public execute(context: AnalyzerContext): Promise<RawFinding[]> {
    const findings: RawFinding[] = [];
    const { factStore } = context;

    // --- Rule: env-file-not-ignored ---
    // If .env exists AND .gitignore entries do not contain .env, emit.
    const envExists = this.getFactValue<boolean>(factStore, 'FILE_EXISTS', '.env');
    if (envExists === true) {
      const gitignoreEntries = this.getFactValue<string[]>(factStore, 'GITIGNORE_ENTRIES', '.gitignore');
      if (!this.gitignoreContains(gitignoreEntries, '.env')) {
        findings.push({
          ruleId: 'env-file-not-ignored',
          target: '.env',
          message: 'The .env file is not listed in .gitignore.',
        });
      }
    }

    // --- Rule: env-example-missing ---
    // If .env exists AND .env.example does not, emit.
    if (envExists === true) {
      const envExampleExists = this.getFactValue<boolean>(factStore, 'FILE_EXISTS', '.env.example');
      if (envExampleExists === false) {
        findings.push({
          ruleId: 'env-example-missing',
          target: '.env.example',
          message: 'The .env file exists but .env.example is missing. Contributors will not know which environment variables are required.',
        });
      }
    }

    return Promise.resolve(findings);
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

  /**
   * Check whether a `.gitignore` entries array contains a pattern that
   * matches the given file name.
   *
   * We do a simple substring/equality check. A full gitignore pattern
   * matcher is out of scope for v0.0.4 — we only check if `.env`
   * appears as an entry or as a substring of an entry.
   */
  private gitignoreContains(entries: string[] | undefined, fileName: string): boolean {
    if (entries === undefined) {
      return false;
    }
    for (const entry of entries) {
      // Exact match or the entry contains the filename as a substring.
      if (entry === fileName || entry.includes(fileName)) {
        return true;
      }
    }
    return false;
  }
}
