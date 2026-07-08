/**
 * Framework detector.
 *
 * Identifies framework hints based on dependency presence in
 * `package.json`. The v0.0.2 spec defines four frameworks:
 *
 *   - Next.js     (`next`)
 *   - React       (`react` + `react-dom`)
 *   - Express     (`express`)
 *   - NestJS      (`@nestjs/core`)
 *
 * Confidence is `High` when the package is in `dependencies`, `Low` when
 * it is only in `devDependencies`.
 *
 * Architectural role: discovery — may import from core, infrastructure,
 * errors, utils. This module imports `core/domain/Discovery` (type-only).
 */

import type { FrameworkGuess, DiscoveredFile } from '@repodoctor/core/domain/Discovery';
import type { PackageJsonData } from '@repodoctor/discovery/parsers/PackageJsonParser';

/**
 * A single framework detection rule.
 *
 * The detector checks each rule in order. A rule matches when ALL of its
 * `packages` are present in the specified dependency section.
 */
interface FrameworkRule {
  /** Human-readable framework name (e.g. `Next.js`). */
  readonly name: string;
  /** Package names that must ALL be present to match. */
  readonly packages: readonly string[];
}

/**
 * Node.js framework rules recognized by v0.0.2.
 */
const NODE_FRAMEWORK_RULES: readonly FrameworkRule[] = [
  { name: 'Next.js', packages: ['next'] },
  { name: 'React', packages: ['react', 'react-dom'] },
  { name: 'NestJS', packages: ['@nestjs/core'] },
  { name: 'Express', packages: ['express'] },
];

/**
 * Python framework rules recognized by v0.0.9.
 * Checked against requirements.txt or pyproject.toml dependency lists.
 */
const PYTHON_FRAMEWORK_RULES: readonly FrameworkRule[] = [
  { name: 'Django', packages: ['django'] },
  { name: 'FastAPI', packages: ['fastapi'] },
];

/**
 * Go framework rules recognized by v0.0.9.
 * Checked against go.mod require block.
 */
const GO_FRAMEWORK_RULES: readonly FrameworkRule[] = [
  { name: 'Gin', packages: ['github.com/gin-gonic/gin'] },
  { name: 'Echo', packages: ['github.com/labstack/echo'] },
];

/**
 * Rust framework rules recognized by v0.0.9.
 * Checked against Cargo.toml [dependencies] section.
 */
const RUST_FRAMEWORK_RULES: readonly FrameworkRule[] = [
  { name: 'Actix', packages: ['actix-web'] },
  { name: 'Axum', packages: ['axum'] },
];

/**
 * Parameters for multi-language framework detection (v0.0.9).
 */
export interface FrameworkDetectionParams {
  /** Parsed `package.json` data, or `null` when absent. */
  readonly packageJson: PackageJsonData | null;
  /** Root files discovered at the repository root. */
  readonly rootFiles: readonly DiscoveredFile[];
  /** Python dependency names extracted from requirements.txt or pyproject.toml. */
  readonly pythonDeps: readonly string[];
  /** Go dependency names extracted from go.mod require block. */
  readonly goDeps: readonly string[];
  /** Rust dependency names extracted from Cargo.toml [dependencies] section. */
  readonly rustDeps: readonly string[];
}

/**
 * Detect framework hints from all language ecosystems.
 *
 * Checks Node.js, Python, Go, and Rust frameworks. Each ecosystem is
 * checked independently — a repo can have frameworks from multiple
 * ecosystems (e.g. a full-stack monorepo with Next.js + Django).
 *
 * @returns A list of {@link FrameworkGuess} objects, in rule order. The
 *   same framework is never listed twice.
 */
export function detectFrameworks(params: FrameworkDetectionParams): readonly FrameworkGuess[] {
  const out: FrameworkGuess[] = [];

  // --- Node.js frameworks ---
  if (params.packageJson !== null) {
    const deps = params.packageJson.dependencies ?? {};
    const devDeps = params.packageJson.devDependencies ?? {};
    for (const rule of NODE_FRAMEWORK_RULES) {
      const inDeps = rule.packages.every((pkg) => deps[pkg] !== undefined);
      const inDevDeps = rule.packages.every((pkg) => devDeps[pkg] !== undefined);
      if (inDeps) {
        out.push({ name: rule.name, confidence: 'High' });
      } else if (inDevDeps) {
        out.push({ name: rule.name, confidence: 'Low' });
      }
    }
  }

  // --- Python frameworks (v0.0.9) ---
  const pythonDepSet = new Set(params.pythonDeps);
  for (const rule of PYTHON_FRAMEWORK_RULES) {
    if (rule.packages.every((pkg) => pythonDepSet.has(pkg))) {
      out.push({ name: rule.name, confidence: 'High' });
    }
  }

  // --- Go frameworks (v0.0.9) ---
  const goDepSet = new Set(params.goDeps);
  for (const rule of GO_FRAMEWORK_RULES) {
    if (rule.packages.every((pkg) => goDepSet.has(pkg))) {
      out.push({ name: rule.name, confidence: 'High' });
    }
  }

  // --- Rust frameworks (v0.0.9) ---
  const rustDepSet = new Set(params.rustDeps);
  for (const rule of RUST_FRAMEWORK_RULES) {
    if (rule.packages.every((pkg) => rustDepSet.has(pkg))) {
      out.push({ name: rule.name, confidence: 'High' });
    }
  }

  return out;
}
