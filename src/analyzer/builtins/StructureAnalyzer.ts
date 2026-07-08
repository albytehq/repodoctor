/**
 * Structure Analyzer.
 *
 * Evaluates repository structure facts and produces findings:
 *   - `gitignore-missing`: The `.gitignore` file does not exist.
 *
 * Triggers: Always.
 *
 * Architectural role: analyzer/builtins — uses only the injected
 * `AnalyzerContext.factStore` (read-only). Performs NO I/O.
 */

import type { RawFinding } from '@repodoctor/core/domain/Analysis';
import type { RepositoryProfile } from '@repodoctor/core/domain/Discovery';
import type { IAnalyzer, AnalyzerContext } from '@repodoctor/analyzer/IAnalyzer';

/**
 * Analyzer that evaluates repository structure.
 */
export class StructureAnalyzer implements IAnalyzer {
  public readonly id = 'structure-analyzer';
  public readonly version = '1.0.0';

  public supports(_profile: RepositoryProfile): boolean {
    return true;
  }

  public execute(context: AnalyzerContext): Promise<RawFinding[]> {
    const findings: RawFinding[] = [];
    const { factStore } = context;

    // --- Rule: gitignore-missing ---
    // If FILE_EXISTS for .gitignore is false, emit.
    const gitignoreExists = this.getFactValue<boolean>(factStore, 'FILE_EXISTS', '.gitignore');
    if (gitignoreExists === false) {
      findings.push({
        ruleId: 'gitignore-missing',
        target: '.gitignore',
        message: 'No .gitignore file was found. A .gitignore prevents accidental commits of build artifacts and secrets.',
      });
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
}
