/**
 * RepoDoctor CLI entry point.
 *
 * This module is the `bin` target. It constructs a {@link CliBootstrap},
 * reads `process.argv` and `process.cwd()`, reads the version string
 * from `package.json`, and delegates to {@link CliBootstrap.run}.
 *
 * Architectural role: cli (entry point) — the very top of the dependency
 * graph. May import from every other layer.
 */

import { resolve } from 'node:path';
import { CliBootstrap } from '@repodoctor/cli/CliBootstrap';
import { ErrorHandler } from '@repodoctor/errors/ErrorHandler';
import { Logger } from '@repodoctor/logger/Logger';
import { ConsoleTransport } from '@repodoctor/logger/ConsoleTransport';

// In CommonJS, `__dirname` and `require` are available natively. We use
// the runtime equivalents (rather than `import.meta.url` + `createRequire`)
// so the entry point works under both CJS and ESM module systems.
const thisDir: string = __dirname;
const requireFromCjs: NodeRequire = require;

/**
 * Read the RepoDoctor version string from `package.json`.
 *
 * The spec explicitly allows reading `package.json` for the CLI version
 * (it only forbids reading it for *analysis*).
 */
function readVersionFromPackageJson(): string {
  try {
    const pkgPath = resolve(thisDir, '..', '..', 'package.json');
    const pkg = requireFromCjs(pkgPath) as { version?: string };
    if (typeof pkg.version === 'string' && pkg.version.length > 0) {
      return pkg.version;
    }
  } catch {
    // Fall through to the hardcoded fallback below.
  }
  return '0.1.0';
}

/**
 * Main entry point.
 *
 * Returns a Promise that resolves when the bootstrap flow has finished
 * successfully. On failure, the {@link ErrorHandler} terminates the
 * process before this function would have resolved.
 */
async function main(): Promise<void> {
  const version = readVersionFromPackageJson();

  // Construct a top-level error handler that catches anything the
  // bootstrap itself throws (e.g. before it has had a chance to set up
  // its own error handler). We use `error` level so that even `silent`
  // configs do not suppress fatal errors at this layer.
  const topLevelLogger = new Logger('error', new ConsoleTransport());
  const errorHandler = new ErrorHandler(topLevelLogger);

  // Wire the global process handlers. The bootstrap may install its own
  // handler later, but the top-level one is the safety net for anything
  // that goes wrong before the bootstrap flow starts.
  process.on('uncaughtException', errorHandler.handleUncaughtException);
  process.on('unhandledRejection', errorHandler.handleUnhandledRejection);

  const bootstrap = new CliBootstrap();
  try {
    const result = await bootstrap.run({
      argv: process.argv.slice(2),
      cwd: process.cwd(),
      version,
    });
    // Exit with the code determined by the bootstrap (CI mode, threshold, etc.).
    process.exit(result.exitCode);
  } catch (error) {
    // The bootstrap's own error handler is normally responsible for
    // surfacing errors, but if the bootstrap itself failed before it
    // could construct one, we fall back to the top-level handler.
    errorHandler.handle(error);
  }
}

// Only invoke `main` when this module is the entry point (i.e. when run
// directly via `node dist/cli/index.js`, `tsx src/cli/index.ts`, or via
// an npm-installed symlink like `node_modules/.bin/repodoctor`).
//
// We use `require.main === module` (the standard CJS idiom) instead of
// comparing `resolve(process.argv[1]) === resolve(__filename)`. The latter
// breaks for npm/pnpm/yarn global installs and `npx repodoctor` because
// `process.argv[1]` is the symlink path while `__filename` is the realpath
// — the comparison is always false and `main()` never runs.
//
// The `require.main` check is robust against symlinks because Node's
// module loader sets `require.main` to the actual loaded main module,
// regardless of how it was invoked.
const isMainEntry: boolean = (() => {
  try {
    return require.main === module;
  } catch {
    // In ESM contexts `require` is not defined. Fall back to the realpath
    // comparison so the CLI still works if the project ever switches to ESM.
    try {
      // Use dynamic import to avoid `require` in ESM contexts.
      // We can't use top-level await here (this is a sync IIFE), so we
      // fall back to a simple process.argv check that doesn't resolve
      // symlinks. This is imperfect but better than never running main().
      const argv1 = process.argv[1];
      if (argv1 === undefined) return false;
      // Compare basenames — works for `npx repodoctor` and direct invocation.
      const scriptName = argv1.split(/[/\\]/).pop() ?? '';
      return scriptName === 'index.js' || scriptName === 'repodoctor' || scriptName === 'index.ts';
    } catch {
      return false;
    }
  }
})();

if (isMainEntry) {
  main().catch((error) => {
    // Last-resort catch — should never be reached because the ErrorHandler
    // calls process.exit before rejecting.
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Fatal: ${message}\n`);
    process.exit(2);
  });
}

export { main };


