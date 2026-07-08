/**
 * Integration tests for the CliBootstrap.
 *
 * Coverage:
 *   - Successful bootstrap with default config.
 *   - Bootstrap with a JSON config file.
 *   - Bootstrap with --config flag.
 *   - Bootstrap with --version / --help short-circuit.
 *   - Bootstrap fails cleanly on a bad config file.
 *   - The `BootstrapComplete` event is emitted at the end of a successful run.
 *   - The `ContextInitialized` event is emitted after context construction.
 *   - The success message is logged exactly once.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CliBootstrap } from '@repodoctor/cli/CliBootstrap';
import { EventBus } from '@repodoctor/core/events/EventBus';
import { InMemoryFileSystem, CapturingLogger } from '../helpers';

describe('CliBootstrap — integration', () => {
  let argv: string[];
  let stdout: string[];
  let exitCalls: number[];

  beforeEach(() => {
    argv = [];
    stdout = [];
    exitCalls = [];
  });

  it('bootstraps successfully in an empty repo and logs the success message', async () => {
    const fs = new InMemoryFileSystem();
    const capturingLogger = new CapturingLogger();
    const bootstrap = new CliBootstrap();
    const result = await bootstrap.run({
      argv,
      cwd: '/empty-repo',
      version: '0.0.1',
      fileSystem: fs,
      logger: capturingLogger,
      environment: { isCI: false, isInteractive: true, isDebug: false },
      exitHook: (code) => {
        exitCalls.push(code);
      },
      stdoutWrite: (text) => {
        stdout.push(text);
      },
    });
    expect(exitCalls).toEqual([]);
    expect(result.context).toBeDefined();
    expect(result.context.workspace.cwd).toBe('/empty-repo');
    expect(result.context.repository.name).toBe('empty-repo');
    expect(result.context.config.logLevel).toBe('info');
    expect(result.context.pluginRegistry.size).toBe(0);

    const infoCalls = capturingLogger.calls.filter((c) => c.level === 'info');
    expect(infoCalls).toHaveLength(1);
    expect(infoCalls[0]?.message).toBe('RepoDoctor foundation initialized successfully.');
  });

  it('emits ContextInitialized, DiscoveryComplete, and BootstrapComplete in order', async () => {
    const fs = new InMemoryFileSystem();
    const eventBus = new EventBus();
    const events: string[] = [];
    eventBus.on('ContextInitialized', () => events.push('ContextInitialized'));
    eventBus.on('ConfigLoaded', () => events.push('ConfigLoaded'));
    eventBus.on('DiscoveryComplete', () => events.push('DiscoveryComplete'));
    eventBus.on('BootstrapComplete', () => events.push('BootstrapComplete'));

    const bootstrap = new CliBootstrap();
    await bootstrap.run({
      argv,
      cwd: '/repo',
      version: '0.0.2',
      fileSystem: fs,
      eventBus,
      environment: { isCI: false, isInteractive: true, isDebug: false },
      exitHook: () => {},
    });

    expect(events).toEqual(['ContextInitialized', 'DiscoveryComplete', 'BootstrapComplete']);
  });

  it('emits DiscoveryComplete with the DiscoveryResult as payload', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/package.json': JSON.stringify({ name: 'payload-test' }),
    });
    const eventBus = new EventBus();
    let discoveryPayload: unknown = undefined;
    eventBus.on('DiscoveryComplete', (payload) => {
      discoveryPayload = payload;
    });

    const bootstrap = new CliBootstrap();
    await bootstrap.run({
      argv,
      cwd: '/repo',
      version: '0.0.2',
      fileSystem: fs,
      eventBus,
      environment: { isCI: false, isInteractive: true, isDebug: false },
      exitHook: () => {},
    });

    expect(discoveryPayload).toBeDefined();
    const payload = discoveryPayload as { profile: { name: string }; fingerprint: { hash: string } };
    expect(payload.profile.name).toBe('payload-test');
    expect(payload.fingerprint.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('bootstraps with a JSON config file in the cwd', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/repodoctor.config.json': JSON.stringify({
        logLevel: 'debug',
        strict: true,
      }),
    });
    const bootstrap = new CliBootstrap();
    const result = await bootstrap.run({
      argv,
      cwd: '/repo',
      version: '0.0.1',
      fileSystem: fs,
      environment: { isCI: false, isInteractive: true, isDebug: false },
      exitHook: () => {},
    });
    expect(result.context.config.logLevel).toBe('debug');
    expect(result.context.config.strict).toBe(true);
  });

  it('bootstraps with --config flag pointing to a custom file', async () => {
    const fs = new InMemoryFileSystem({
      '/custom/my-config.json': JSON.stringify({ logLevel: 'warn' }),
    });
    const bootstrap = new CliBootstrap();
    const result = await bootstrap.run({
      argv: ['--config', '/custom/my-config.json'],
      cwd: '/repo',
      version: '0.0.1',
      fileSystem: fs,
      environment: { isCI: false, isInteractive: true, isDebug: false },
      exitHook: () => {},
    });
    expect(result.context.config.logLevel).toBe('warn');
  });

  it('short-circuits --version and prints the version', async () => {
    const fs = new InMemoryFileSystem();
    const bootstrap = new CliBootstrap();
    // The exitHook throws to short-circuit process.exit; we expect the
    // bootstrap's promise to reject with that error.
    await expect(
      bootstrap.run({
        argv: ['--version'],
        cwd: '/repo',
        version: '0.0.1',
        fileSystem: fs,
        environment: { isCI: false, isInteractive: true, isDebug: false },
        exitHook: (code) => {
          exitCalls.push(code);
          throw new Error(`exit(${code})`);
        },
        stdoutWrite: (text) => {
          stdout.push(text);
        },
      }),
    ).rejects.toThrow('exit(0)');
    expect(exitCalls).toEqual([0]);
    expect(stdout).toEqual(['0.0.1\n']);
  });

  it('short-circuits --help and prints the help text', async () => {
    const fs = new InMemoryFileSystem();
    const bootstrap = new CliBootstrap();
    await expect(
      bootstrap.run({
        argv: ['--help'],
        cwd: '/repo',
        version: '0.0.1',
        fileSystem: fs,
        environment: { isCI: false, isInteractive: true, isDebug: false },
        exitHook: (code) => {
          exitCalls.push(code);
          throw new Error(`exit(${code})`);
        },
        stdoutWrite: (text) => {
          stdout.push(text);
        },
      }),
    ).rejects.toThrow('exit(0)');
    expect(exitCalls).toEqual([0]);
    expect(stdout[0]).toContain('Usage: repodoctor');
  });

  it('routes a bad --config file through the ErrorHandler (exit 1)', async () => {
    const fs = new InMemoryFileSystem({}); // bad.json does not exist
    const capturingLogger = new CapturingLogger();
    const bootstrap = new CliBootstrap();
    await expect(
      bootstrap.run({
        argv: ['--config', '/bad.json'],
        cwd: '/repo',
        version: '0.0.1',
        fileSystem: fs,
        logger: capturingLogger,
        environment: { isCI: false, isInteractive: true, isDebug: false },
        exitHook: (code) => {
          exitCalls.push(code);
          throw new Error(`exit(${code})`);
        },
      }),
    ).rejects.toThrow('exit(1)');
    expect(exitCalls).toEqual([1]);
    // The error handler should have logged at error level.
    const errorCalls = capturingLogger.calls.filter((c) => c.level === 'error');
    expect(errorCalls.length).toBeGreaterThan(0);
    // The message should reference the missing config file.
    const messages = errorCalls.map((c) => c.message).join('\n');
    expect(messages).toContain('bad.json');
  });

  it('routes a malformed JSON config through the ErrorHandler (exit 1)', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/repodoctor.config.json': '{ malformed',
    });
    const capturingLogger = new CapturingLogger();
    const bootstrap = new CliBootstrap();
    await expect(
      bootstrap.run({
        argv,
        cwd: '/repo',
        version: '0.0.1',
        fileSystem: fs,
        logger: capturingLogger,
        environment: { isCI: false, isInteractive: true, isDebug: false },
        exitHook: (code) => {
          exitCalls.push(code);
          throw new Error(`exit(${code})`);
        },
      }),
    ).rejects.toThrow('exit(1)');
    expect(exitCalls).toEqual([1]);
    const errorCalls = capturingLogger.calls.filter((c) => c.level === 'error');
    expect(errorCalls.length).toBeGreaterThan(0);
  });

  it('includes the version, cwd, and configLogLevel in the success log context', async () => {
    const fs = new InMemoryFileSystem({
      '/repo/repodoctor.config.json': JSON.stringify({ logLevel: 'warn' }),
    });
    const capturingLogger = new CapturingLogger();
    const bootstrap = new CliBootstrap();
    await bootstrap.run({
      argv,
      cwd: '/repo',
      version: '0.0.1',
      fileSystem: fs,
      logger: capturingLogger,
      environment: { isCI: false, isInteractive: true, isDebug: false },
      exitHook: () => {},
    });
    const infoCalls = capturingLogger.calls.filter((c) => c.level === 'info');
    const successCall = infoCalls.find((c) =>
      c.message.includes('foundation initialized successfully'),
    );
    expect(successCall).toBeDefined();
    const ctx = successCall?.context as Record<string, unknown>;
    expect(ctx.version).toBe('0.0.1');
    expect(ctx.cwd).toBe('/repo');
    expect(ctx.configLogLevel).toBe('warn');
  });
});
