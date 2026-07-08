/**
 * CLI argument parser.
 *
 * Parses raw `process.argv` into a strongly-typed DTO. The parser
 * recognizes:
 *   - Commands: `discover` (alias: `inspect`). When no command is
 *     supplied, the parser defaults to `discover` (per the v0.0.2 spec).
 *   - Flags: `--version`, `--help`, `--config <path>`, `--debug`,
 *     `--json`.
 *
 * Architectural role: cli — may import from core, config, logger, errors,
 * utils. This module only needs `errors` (for {@link CLIArgumentError}).
 */

import { CLIArgumentError } from '@repodoctor/errors/CLIArgumentError';

/**
 * The command that the user explicitly invoked (or `'discover'` as the
 * default).
 *
 * - `discover`  — run the repository discovery pipeline.
 * - `inspect`   — alias for `discover`.
 * - `scan`      — run discovery + scanner engine (collect raw facts).
 * - `facts`     — alias for `scan`.
 * - `analyze`   — run discovery + scan + analyzer engine (produce findings).
 * - `diagnose`  — run discovery + scan + analyze + health engine (produce diagnosis).
 * - `health`    — alias for `diagnose`.
 * - `report`    — run the full pipeline and output a report (default).
 *
 * Future versions will add more commands (e.g. `treat`).
 */
export type Command = 'discover' | 'inspect' | 'scan' | 'facts' | 'analyze' | 'diagnose' | 'health' | 'report' | 'completions';

/**
 * Strongly-typed DTO representing parsed CLI arguments.
 *
 * Every field is `readonly` to make the immutable contract explicit: once
 * parsed, the arguments do not change for the lifetime of the process.
 *
 * Carries a `kind: 'parsed'` discriminator so callers can distinguish a
 * fully-parsed argv from a short-circuit result (`--version` / `--help`)
 * via a single narrowing check.
 */
export interface ParsedArguments {
  readonly kind: 'parsed';
  /** `true` when `--version` was passed. Always `false` here — `--version`
   *  produces a {@link ShortCircuitResult} instead. */
  readonly version: false;
  /** `true` when `--help` was passed. Always `false` here — `--help`
   *  produces a {@link ShortCircuitResult} instead. */
  readonly help: false;
  /** `true` when `--debug` was passed. */
  readonly debug: boolean;
  /**
   * Path supplied via `--config <path>`, or `undefined` when the flag was
   * not supplied. The path is NOT resolved here — resolution happens
   * later in the bootstrap flow, after the workspace is known.
   */
  readonly configPath: string | undefined;
  /**
   * The command to run. Defaults to `'discover'` when no command is
   * supplied. `inspect` is an alias for `discover` and is normalized to
   * `'discover'` in the {@link command} field (use {@link rawCommand} to
   * see which alias the user typed, if needed).
   */
  readonly command: Command;
  /** `true` when `--json` was passed. */
  readonly json: boolean;
  /** `true` when `--markdown` was passed. */
  readonly markdown: boolean;
  /** `true` when `--ci` was passed (forces non-interactive mode + exit codes). */
  readonly ci: boolean;
  /** The threshold value supplied via `--threshold <number>`, or `undefined`. */
  readonly threshold: number | undefined;
  /** `true` when `--no-cache` was passed (bypasses persistent cache). */
  readonly noCache: boolean;
  /** `true` when `--clear-cache` was passed (deletes cache and exits). */
  readonly clearCache: boolean;
  /**
   * The shell name supplied via `repodoctor completions <shell>`.
   * Only set when `command === 'completions'`. When the user runs
   * `repodoctor completions` without a shell argument, this is
   * `undefined` and the bootstrap defaults to `'bash'`.
   */
  readonly completionsShell: string | undefined;
}

/**
 * The help text printed in response to `--help` or to a
 * {@link CLIArgumentError}.
 *
 * Centralized here so that the {@link ErrorHandler} can reference it
 * without duplicating strings.
 */
export const HELP_TEXT = `Usage: repodoctor [command] [options]

RepoDoctor — A universal health diagnosis system for software repositories.

Commands:
  discover             Identify the repository (language, package manager, frameworks)
  scan                 Collect raw facts from the filesystem
  analyze              Interpret facts into findings
  diagnose             Calculate health scores and assign severity
  report               Run the full pipeline and output a report (default)
  completions <shell>  Generate shell completions (bash, zsh, fish, powershell)

Options:
  --version            Print version and exit
  --help               Print this help and exit
  --config <path>      Path to config file (.json or .js)
  --debug              Enable debug-level logging
  --json               Output as JSON to stdout
  --markdown           Output as Markdown to stdout
  --ci                 CI mode: no colors, exit non-zero on issues
  --threshold <num>    Exit non-zero if overall score is below <num>
  --no-cache           Bypass the persistent cache
  --clear-cache        Delete the cache directory and exit

Examples:
  repodoctor                          Run full diagnosis
  repodoctor --json                   Output as JSON
  repodoctor --markdown > REPORT.md   Save Markdown report
  repodoctor --ci --threshold 70      CI mode with score threshold
  repodoctor scan                     Just collect facts
  repodoctor completions zsh          Generate Zsh completions

Config discovery (when --config is not supplied):
  1. ./repodoctor.config.json
  2. ./repodoctor.config.js
  3. Built-in defaults

RepoDoctor v0.1.0 — production ready.
`;

/**
 * Result of a parse operation that requested `--version` or `--help`.
 *
 * These two flags short-circuit the bootstrap flow: when either is present,
 * the parser returns immediately and the bootstrap prints the requested
 * output and exits with code 0.
 */
export type ShortCircuitResult =
  | { readonly kind: 'version'; readonly version: string }
  | { readonly kind: 'help' };

/**
 * The set of recognized commands. The first non-flag argument is treated
 * as the command. `inspect` is an alias for `discover`. `facts` is an
 * alias for `scan`.
 */
const RECOGNIZED_COMMANDS: ReadonlySet<string> = new Set(['discover', 'inspect', 'scan', 'facts', 'analyze', 'diagnose', 'health', 'report', 'completions']);

/**
 * Parse raw CLI arguments.
 *
 * The parser does NOT read `process.argv` itself — it accepts the raw
 * string array as a parameter so that tests can inject arbitrary argv
 * vectors. The CLI entry point is responsible for slicing off
 * `process.execPath` and the script path before calling this function
 * (i.e. it should pass `process.argv.slice(2)`).
 *
 * @throws {CLIArgumentError} when:
 *   - an unrecognized flag or command is supplied,
 *   - `--config` is supplied without a following path,
 *   - `--config` is supplied more than once,
 *   - more than one command is supplied.
 *
 * @returns Either a {@link ShortCircuitResult} (when `--version` or
 *   `--help` was supplied) or a fully-populated {@link ParsedArguments}.
 */
export function parseArguments(
  argv: readonly string[],
  options: { version?: string } = {},
): ShortCircuitResult | ParsedArguments {
  const version = options.version ?? '0.1.0';

  let wantsVersion = false;
  let wantsHelp = false;
  let isDebug = false;
  let wantsJson = false;
  let wantsMarkdown = false;
  let wantsCi = false;
  let threshold: number | undefined;
  let noCache = false;
  let clearCache = false;
  let configPath: string | undefined;
  let configPathSeen = false;
  let command: Command | undefined;
  let completionsShell: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) {
      continue;
    }

    // The first non-flag argument is the command.
    if (!arg.startsWith('--') && !arg.startsWith('-')) {
      if (!RECOGNIZED_COMMANDS.has(arg)) {
        throw new CLIArgumentError(`Unrecognized command: ${arg}`, {
          context: { arg },
        });
      }
      if (command !== undefined) {
        throw new CLIArgumentError(`Multiple commands supplied: '${command}' and '${arg}'.`, {
          context: { arg, previousCommand: command },
        });
      }
      command = arg as Command;

      // The `completions` command takes a shell name argument (bash, zsh,
      // fish, powershell). We consume it here so it is not mistaken for
      // a second command.
      if (command === 'completions') {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('--') && !next.startsWith('-')) {
          completionsShell = next;
          i += 1; // skip the shell arg in the outer loop
        }
      }
      continue;
    }

    switch (arg) {
      case '--version':
      case '-v':
        wantsVersion = true;
        break;
      case '--help':
      case '-h':
        wantsHelp = true;
        break;
      case '--debug':
        isDebug = true;
        break;
      case '--json':
        wantsJson = true;
        break;
      case '--markdown':
        wantsMarkdown = true;
        break;
      case '--ci':
        wantsCi = true;
        break;
      case '--no-cache':
        noCache = true;
        break;
      case '--clear-cache':
        clearCache = true;
        break;
      case '--threshold': {
        const next = argv[i + 1];
        if (next === undefined || next.startsWith('--')) {
          throw new CLIArgumentError('--threshold requires a numeric argument.', {
            context: { arg, next },
          });
        }
        const parsed = Number(next);
        if (!Number.isFinite(parsed)) {
          throw new CLIArgumentError(`--threshold requires a valid number, got ${JSON.stringify(next)}.`, {
            context: { arg, next },
          });
        }
        threshold = parsed;
        i += 1;
        break;
      }
      case '--config': {
        if (configPathSeen) {
          throw new CLIArgumentError('Duplicate --config flag.', {
            context: { arg },
          });
        }
        const next = argv[i + 1];
        if (next === undefined || next.startsWith('--')) {
          throw new CLIArgumentError('--config requires a path argument.', {
            context: { arg, next },
          });
        }
        configPath = next;
        configPathSeen = true;
        i += 1;
        break;
      }
      default:
        throw new CLIArgumentError(`Unrecognized argument: ${arg}`, {
          context: { arg },
        });
    }
  }

  if (wantsVersion) {
    return { kind: 'version', version };
  }
  if (wantsHelp) {
    return { kind: 'help' };
  }

  return {
    kind: 'parsed',
    version: false,
    help: false,
    debug: isDebug,
    configPath,
    command: command ?? 'report',
    json: wantsJson,
    markdown: wantsMarkdown,
    ci: wantsCi,
    threshold,
    noCache,
    clearCache,
    completionsShell,
  };
}
