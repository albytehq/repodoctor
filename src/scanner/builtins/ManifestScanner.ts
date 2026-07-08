/**
 * Manifest Scanner.
 *
 * Reads `package.json` and extracts:
 *   - `DEPENDENCY_DECLARED` (value: array of dependency names).
 *   - `SCRIPT_DEFINED` (value: array of script names).
 *   - `PACKAGE_MANAGER_LOCKFILE_EXISTS` (value: boolean).
 *
 * Triggers: `profile.type` is `NodeApplication` or `NodeMonorepo`.
 *
 * Architectural role: scanner/builtins — uses only the injected
 * `ScannerContext.fs`. Does NOT import `fs` or `path`.
 */

import type { RawFact } from '@repodoctor/core/domain/Scan';
import type { RepositoryProfile } from '@repodoctor/core/domain/Discovery';
import type { IScanner, ScannerContext } from '@repodoctor/scanner/IScanner';
import { parseRequirementsTxt, parsePyprojectToml } from '@repodoctor/scanner/parsers/PythonManifestParser';
import { parseGoModContent } from '@repodoctor/scanner/parsers/GoModParser';
import { parseCargoTomlContent } from '@repodoctor/scanner/parsers/CargoTomlParser';

/**
 * The lockfile names checked by this scanner.
 */
const LOCKFILES: readonly string[] = [
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'package-lock.json',
];

/**
 * Scanner that reads `package.json` and emits manifest facts.
 *
 * If `package.json` does not exist or cannot be parsed, the scanner
 * returns an empty array — it does NOT throw. A missing manifest is an
 * objective fact (the file is absent), not an error.
 */
export class ManifestScanner implements IScanner {
  public readonly id = 'manifest-scanner';
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

  public async execute(context: ScannerContext): Promise<RawFact[]> {
    // Route to the correct parser based on the profile's package manager.
    const pm = context.profile.packageManager;

    if (pm === 'Npm' || pm === 'Yarn' || pm === 'Pnpm' || pm === 'Bun' || pm === 'Unknown') {
      // Node.js path — only if package.json exists.
      if (pm !== 'Unknown') {
        return this.executeNode(context);
      }
      // Unknown PM with NodeApplication type still tries package.json.
      if (context.profile.type === 'NodeApplication' || context.profile.type === 'NodeMonorepo') {
        return this.executeNode(context);
      }
      return [];
    }

    if (pm === 'Pip' || pm === 'Poetry') {
      return this.executePython(context);
    }

    if (pm === 'GoModules') {
      return this.executeGo(context);
    }

    if (pm === 'Cargo') {
      return this.executeRust(context);
    }

    return [];
  }

  /**
   * Node.js manifest scanning (existing v0.0.3 logic).
   */
  private async executeNode(context: ScannerContext): Promise<RawFact[]> {
    const hasPackageJson = await context.fs.fileExists('package.json');
    if (!hasPackageJson) {
      return [];
    }

    let contents: string;
    try {
      contents = await context.fs.readFile('package.json');
    } catch {
      return [];
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(contents);
    } catch {
      // Malformed JSON — return empty.
      return [];
    }

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return [];
    }

    const obj = parsed as Record<string, unknown>;
    const facts: RawFact[] = [];

    // --- DEPENDENCY_DECLARED ---
    const depNames = extractStringKeys(obj.dependencies);
    if (depNames.length > 0) {
      facts.push({
        type: 'DEPENDENCY_DECLARED',
        target: 'package.json',
        value: depNames,
      });
    }

    // --- SCRIPT_DEFINED ---
    const scriptNames = extractStringKeys(obj.scripts);
    if (scriptNames.length > 0) {
      facts.push({
        type: 'SCRIPT_DEFINED',
        target: 'package.json',
        value: scriptNames,
      });
    }

    // --- PACKAGE_MANAGER_LOCKFILE_EXISTS ---
    let lockfileExists = false;
    for (const lockfile of LOCKFILES) {
      if (await context.fs.fileExists(lockfile)) {
        lockfileExists = true;
        break;
      }
    }
    facts.push({
      type: 'PACKAGE_MANAGER_LOCKFILE_EXISTS',
      target: 'package.json',
      value: lockfileExists,
    });

    return facts;
  }

  /**
   * Python manifest scanning (v0.0.9).
   */
  private async executePython(context: ScannerContext): Promise<RawFact[]> {
    const facts: RawFact[] = [];
    let deps: string[] = [];
    let manifestTarget = 'requirements.txt';

    try {
      const hasReqs = await context.fs.fileExists('requirements.txt');
      const hasPyproject = await context.fs.fileExists('pyproject.toml');

      if (hasReqs) {
        const content = await context.fs.readFile('requirements.txt');
        deps = parseRequirementsTxt(content);
        manifestTarget = 'requirements.txt';
      } else if (hasPyproject) {
        const content = await context.fs.readFile('pyproject.toml');
        deps = parsePyprojectToml(content);
        manifestTarget = 'pyproject.toml';
      }
    } catch {
      return [];
    }

    if (deps.length > 0) {
      facts.push({
        type: 'DEPENDENCY_DECLARED',
        target: manifestTarget,
        value: deps,
      });
    }

    // Lockfile check: poetry.lock for Poetry, no standard lockfile for Pip.
    let lockfileExists = false;
    if (context.profile.packageManager === 'Poetry') {
      lockfileExists = await context.fs.fileExists('poetry.lock');
    } else {
      // Pip doesn't have a standard lockfile.
      lockfileExists = false;
    }
    facts.push({
      type: 'PACKAGE_MANAGER_LOCKFILE_EXISTS',
      target: manifestTarget,
      value: lockfileExists,
    });

    return facts;
  }

  /**
   * Go manifest scanning (v0.0.9).
   */
  private async executeGo(context: ScannerContext): Promise<RawFact[]> {
    const facts: RawFact[] = [];

    try {
      if (!(await context.fs.fileExists('go.mod'))) {
        return [];
      }
      const content = await context.fs.readFile('go.mod');
      const data = parseGoModContent(content);

      if (data.dependencies.length > 0) {
        facts.push({
          type: 'DEPENDENCY_DECLARED',
          target: 'go.mod',
          value: data.dependencies,
        });
      }

      // Lockfile: go.sum
      const lockfileExists = await context.fs.fileExists('go.sum');
      facts.push({
        type: 'PACKAGE_MANAGER_LOCKFILE_EXISTS',
        target: 'go.mod',
        value: lockfileExists,
      });
    } catch {
      return [];
    }

    return facts;
  }

  /**
   * Rust manifest scanning (v0.0.9).
   */
  private async executeRust(context: ScannerContext): Promise<RawFact[]> {
    const facts: RawFact[] = [];

    try {
      if (!(await context.fs.fileExists('Cargo.toml'))) {
        return [];
      }
      const content = await context.fs.readFile('Cargo.toml');
      const data = parseCargoTomlContent(content);

      if (data.dependencies.length > 0) {
        facts.push({
          type: 'DEPENDENCY_DECLARED',
          target: 'Cargo.toml',
          value: data.dependencies,
        });
      }

      // Lockfile: Cargo.lock
      const lockfileExists = await context.fs.fileExists('Cargo.lock');
      facts.push({
        type: 'PACKAGE_MANAGER_LOCKFILE_EXISTS',
        target: 'Cargo.toml',
        value: lockfileExists,
      });
    } catch {
      return [];
    }

    return facts;
  }
}

/**
 * Extract the keys of a record whose values are strings. Used to pull
 * dependency names and script names from `package.json` sections.
 */
function extractStringKeys(raw: unknown): string[] {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return [];
  }
  const obj = raw as Record<string, unknown>;
  const out: string[] = [];
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'string') {
      out.push(key);
    }
  }
  return out;
}
