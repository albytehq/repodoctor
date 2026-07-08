/**
 * Safe `package.json` parser.
 *
 * Reads a `package.json` file via the injected {@link IFileSystem}, parses
 * it as JSON, and returns a typed subset of the fields that the v0.0.2
 * detectors consume. Throws {@link MalformedJsonError} when the file is
 * not valid JSON, and never throws for missing fields (the detectors
 * treat missing fields as "not present").
 *
 * Architectural role: discovery — may import from core, infrastructure,
 * errors, utils. This module imports `core/IFileSystem`,
 * `errors/MalformedJsonError`, and `core/domain/Discovery` (type-only).
 */

import type { IFileSystem } from '@repodoctor/core/IFileSystem';
import { MalformedJsonError } from '@repodoctor/errors/MalformedJsonError';

/**
 * The subset of `package.json` fields that the v0.0.2 detectors consume.
 *
 * Every field is optional — real-world `package.json` files omit fields
 * freely. Consumers MUST use optional chaining / nullish coalescing when
 * reading from this object.
 */
export interface PackageJsonData {
  /** The `name` field, or `undefined` when absent. */
  readonly name?: string;
  /** The `type` field (e.g. `"module"` for ESM), or `undefined`. */
  readonly type?: string;
  /** The `packageManager` field (e.g. `"yarn@3.2.1"`), or `undefined`. */
  readonly packageManager?: string;
  /** The `workspaces` field, or `undefined`. May be an array or an object with a `packages` array. */
  readonly workspaces?: readonly string[] | { readonly packages?: readonly string[] };
  /** The `dependencies` object, or `undefined`. Keys are package names, values are version strings. */
  readonly dependencies?: Readonly<Record<string, string>>;
  /** The `devDependencies` object, or `undefined`. */
  readonly devDependencies?: Readonly<Record<string, string>>;
}

/**
 * Mutable builder type used internally during parsing. The fields are
 * mutable so we can populate them one at a time; the result is returned
 * as the readonly {@link PackageJsonData}.
 */
type MutablePackageJsonData = {
  -readonly [K in keyof PackageJsonData]: PackageJsonData[K];
};

/**
 * Parse a `package.json` file from disk.
 *
 * @param fileSystem The filesystem to read from.
 * @param path Absolute path to the `package.json` file.
 * @returns The parsed {@link PackageJsonData}, or `null` when the file
 *   does not exist (callers should treat a missing `package.json` as
 *   "not a Node.js project" rather than an error).
 * @throws {MalformedJsonError} when the file exists but is not valid
 *   JSON, or when the top-level value is not a JSON object.
 */
export async function parsePackageJson(
  fileSystem: IFileSystem,
  path: string,
): Promise<PackageJsonData | null> {
  let contents: string;
  try {
    contents = await fileSystem.readFile(path);
  } catch (error) {
    // A missing package.json is NOT an error per the v0.0.2 spec — we
    // return null and let the caller decide what to do.
    if (isFileNotFoundError(error)) {
      return null;
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch (error) {
    throw new MalformedJsonError(path, { cause: error });
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new MalformedJsonError(path, {
      context: {
        reason:
          parsed === null
            ? 'top-level value is null'
            : Array.isArray(parsed)
              ? 'top-level value is an array'
              : `top-level value is ${typeof parsed}`,
      },
    });
  }

  // Extract the fields we care about, with runtime type guards so that
  // malformed values (e.g. `name: 42`) are silently dropped rather than
  // crashing downstream detectors.
  const obj = parsed as Record<string, unknown>;
  const data: MutablePackageJsonData = {};
  if (typeof obj.name === 'string') {
    data.name = obj.name;
  }
  if (typeof obj.type === 'string') {
    data.type = obj.type;
  }
  if (typeof obj.packageManager === 'string') {
    data.packageManager = obj.packageManager;
  }
  if (Array.isArray(obj.workspaces)) {
    // `workspaces` may be `string[]` or `{ packages: string[] }`. Both
    // are valid per the npm spec. We normalize to the array form.
    data.workspaces = normalizeWorkspaces(obj.workspaces);
  } else if (obj.workspaces !== null && typeof obj.workspaces === 'object') {
    const ws = obj.workspaces as { packages?: unknown };
    if (Array.isArray(ws.packages)) {
      data.workspaces = normalizeWorkspaces(ws.packages);
    }
  }
  if (obj.dependencies !== null && typeof obj.dependencies === 'object' && !Array.isArray(obj.dependencies)) {
    data.dependencies = filterStringRecord(obj.dependencies as Record<string, unknown>);
  }
  if (obj.devDependencies !== null && typeof obj.devDependencies === 'object' && !Array.isArray(obj.devDependencies)) {
    data.devDependencies = filterStringRecord(obj.devDependencies as Record<string, unknown>);
  }
  return data;
}

/**
 * Normalize a `workspaces` array into a clean `string[]`. Non-string
 * entries are dropped.
 */
function normalizeWorkspaces(raw: unknown[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i];
    if (typeof entry === 'string') {
      out.push(entry);
    }
  }
  return out;
}

/**
 * Filter a `Record<string, unknown>` down to a `Record<string, string>`,
 * dropping entries whose value is not a string. Used for `dependencies`
 * and `devDependencies`.
 */
function filterStringRecord(raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(raw)) {
    const value = raw[key];
    if (typeof value === 'string') {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Type guard for `FileNotFoundError`. We check the `code` field rather
 * than using `instanceof` to avoid importing the class (which would
 * create a runtime dependency from `discovery` to `errors` — allowed,
 * but unnecessary here since we only need the discriminator).
 */
function isFileNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'FILE_NOT_FOUND'
  );
}
