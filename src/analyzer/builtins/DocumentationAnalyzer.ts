/**
 * Documentation Analyzer.
 *
 * Evaluates documentation facts and produces findings:
 *   - `readme-too-short`: README.md exists but is less than 100 bytes.
 *   - `license-missing`: The LICENSE file does not exist.
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
 * The minimum acceptable README.md size, in bytes. Below this, the
 * README is considered too short to provide meaningful documentation.
 */
const MIN_README_SIZE_BYTES = 100;

/**
 * Analyzer that evaluates documentation configuration.
 */
export class DocumentationAnalyzer implements IAnalyzer {
  public readonly id = 'documentation-analyzer';
  public readonly version = '1.0.0';

  public supports(_profile: RepositoryProfile): boolean {
    return true;
  }

  public execute(context: AnalyzerContext): Promise<RawFinding[]> {
    const findings: RawFinding[] = [];
    const { factStore } = context;

    // --- Rule: readme-too-short ---
    // If FILE_SIZE_BYTES for README.md exists and is < 100, emit.
    const readmeSize = this.getFactValue<number>(factStore, 'FILE_SIZE_BYTES', 'README.md');
    if (readmeSize !== undefined && readmeSize < MIN_README_SIZE_BYTES) {
      findings.push({
        ruleId: 'readme-too-short',
        target: 'README.md',
        message: `The README.md file is only ${readmeSize} bytes, which is below the recommended minimum of ${MIN_README_SIZE_BYTES} bytes.`,
        metadata: { size: readmeSize, minimum: MIN_README_SIZE_BYTES },
      });
    }

    // --- Rule: license-missing ---
    // If FILE_EXISTS for LICENSE is false, emit.
    const licenseExists = this.getFactValue<boolean>(factStore, 'FILE_EXISTS', 'LICENSE');
    if (licenseExists === false) {
      findings.push({
        ruleId: 'license-missing',
        target: 'LICENSE',
        message: 'No LICENSE file was found. Adding a LICENSE clarifies how others may use your code.',
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
