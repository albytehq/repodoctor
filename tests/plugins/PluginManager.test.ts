/**
 * Unit + integration tests for PluginManager.
 *
 * Coverage:
 *   - Loading a valid local plugin.
 *   - Loading a plugin with wrong apiVersion (rejected).
 *   - Loading a plugin with missing default export (rejected).
 *   - Loading a plugin with missing name (rejected).
 *   - Loading a plugin with missing scanners/analyzers fields (OK, just no registrations).
 *   - Loading a non-existent module (rejected gracefully).
 *   - Integration: fixture plugin's scanner facts appear in the scanner registry.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PluginManager } from '@repodoctor/plugins/PluginManager';
import { ScannerRegistry } from '@repodoctor/scanner/ScannerRegistry';
import { AnalyzerRegistry } from '@repodoctor/analyzer/AnalyzerRegistry';
import { CapturingLogger } from '../helpers';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('PluginManager', () => {
  let tempDir: string;
  let logger: CapturingLogger;

  beforeAll(() => {
    tempDir = mkdirSync(join(tmpdir(), 'repodoctor-pm-test-'), { recursive: true });
    // Write the fixture plugin to a temp file.
    mkdirSync(join(tempDir, 'plugins'), { recursive: true });
    writeFileSync(
      join(tempDir, 'plugins', 'valid-plugin.js'),
      `module.exports = {
        name: 'valid-plugin',
        version: '1.0.0',
        apiVersion: 1,
        scanners: [{
          id: 'valid-scanner',
          supports: () => true,
          scan: async () => [{ type: 'FILE_EXISTS', target: 'test', value: true }],
        }],
      };`,
    );
    writeFileSync(
      join(tempDir, 'plugins', 'bad-version-plugin.js'),
      `module.exports = {
        name: 'bad-version',
        version: '1.0.0',
        apiVersion: 2,
        scanners: [],
      };`,
    );
    writeFileSync(
      join(tempDir, 'plugins', 'no-default.js'),
      `module.exports = { notDefault: true };`,
    );
    writeFileSync(
      join(tempDir, 'plugins', 'no-name.js'),
      `module.exports = {
        version: '1.0.0',
        apiVersion: 1,
        scanners: [],
      };`,
    );
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    logger = new CapturingLogger();
  });

  it('loads a valid local plugin and registers its scanners', async () => {
    const scannerRegistry = new ScannerRegistry();
    const analyzerRegistry = new AnalyzerRegistry();
    const manager = new PluginManager({
      pluginPaths: ['./plugins/valid-plugin.js'],
      basePath: tempDir,
      scannerRegistry,
      analyzerRegistry,
      logger,
      eventBus: undefined,
    });
    const summary = await manager.loadAll();

    expect(summary.loaded).toHaveLength(1);
    expect(summary.failed).toHaveLength(0);
    expect(summary.loaded[0]?.name).toBe('valid-plugin');
    expect(scannerRegistry.size).toBe(1);
    expect(scannerRegistry.getAll()[0]?.id).toBe('valid-scanner');
  });

  it('rejects a plugin with wrong apiVersion', async () => {
    const scannerRegistry = new ScannerRegistry();
    const analyzerRegistry = new AnalyzerRegistry();
    const manager = new PluginManager({
      pluginPaths: ['./plugins/bad-version-plugin.js'],
      basePath: tempDir,
      scannerRegistry,
      analyzerRegistry,
      logger,
      eventBus: undefined,
    });
    const summary = await manager.loadAll();

    expect(summary.loaded).toHaveLength(0);
    expect(summary.failed).toHaveLength(1);
    expect(summary.failed[0]?.error).toContain('apiVersion');
  });

  it('rejects a plugin with no default export', async () => {
    // Write a module with no default export at all.
    writeFileSync(
      join(tempDir, 'plugins', 'truly-no-default.js'),
      `export const something = true;`,
    );

    const scannerRegistry = new ScannerRegistry();
    const analyzerRegistry = new AnalyzerRegistry();
    const manager = new PluginManager({
      pluginPaths: ['./plugins/truly-no-default.js'],
      basePath: tempDir,
      scannerRegistry,
      analyzerRegistry,
      logger,
      eventBus: undefined,
    });
    const summary = await manager.loadAll();

    expect(summary.loaded).toHaveLength(0);
    expect(summary.failed).toHaveLength(1);
    expect(summary.failed[0]?.error).toContain('default export');
  });

  it('rejects a plugin with no name', async () => {
    const scannerRegistry = new ScannerRegistry();
    const analyzerRegistry = new AnalyzerRegistry();
    const manager = new PluginManager({
      pluginPaths: ['./plugins/no-name.js'],
      basePath: tempDir,
      scannerRegistry,
      analyzerRegistry,
      logger,
      eventBus: undefined,
    });
    const summary = await manager.loadAll();

    expect(summary.loaded).toHaveLength(0);
    expect(summary.failed).toHaveLength(1);
    expect(summary.failed[0]?.error).toContain('name');
  });

  it('rejects a non-existent module gracefully', async () => {
    const scannerRegistry = new ScannerRegistry();
    const analyzerRegistry = new AnalyzerRegistry();
    const manager = new PluginManager({
      pluginPaths: ['./plugins/nonexistent.js'],
      basePath: tempDir,
      scannerRegistry,
      analyzerRegistry,
      logger,
      eventBus: undefined,
    });
    const summary = await manager.loadAll();

    expect(summary.loaded).toHaveLength(0);
    expect(summary.failed).toHaveLength(1);
  });

  it('loads multiple plugins — one failure does not prevent others', async () => {
    const scannerRegistry = new ScannerRegistry();
    const analyzerRegistry = new AnalyzerRegistry();
    const manager = new PluginManager({
      pluginPaths: ['./plugins/valid-plugin.js', './plugins/bad-version-plugin.js'],
      basePath: tempDir,
      scannerRegistry,
      analyzerRegistry,
      logger,
      eventBus: undefined,
    });
    const summary = await manager.loadAll();

    expect(summary.loaded).toHaveLength(1);
    expect(summary.failed).toHaveLength(1);
  });

  it('loads a plugin with no scanners or analyzers (valid, just no registrations)', async () => {
    // Write a minimal valid plugin.
    writeFileSync(
      join(tempDir, 'plugins', 'minimal-plugin.js'),
      `module.exports = {
        name: 'minimal-plugin',
        version: '0.1.0',
        apiVersion: 1,
      };`,
    );

    const scannerRegistry = new ScannerRegistry();
    const analyzerRegistry = new AnalyzerRegistry();
    const manager = new PluginManager({
      pluginPaths: ['./plugins/minimal-plugin.js'],
      basePath: tempDir,
      scannerRegistry,
      analyzerRegistry,
      logger,
      eventBus: undefined,
    });
    const summary = await manager.loadAll();

    expect(summary.loaded).toHaveLength(1);
    expect(summary.failed).toHaveLength(0);
    expect(scannerRegistry.size).toBe(0);
    expect(analyzerRegistry.size).toBe(0);
  });

  it('loads an npm-style package name (resolves as-is)', async () => {
    // We can't actually load a real npm package in tests, but we can
    // verify that the manager attempts to import the name as-is.
    const scannerRegistry = new ScannerRegistry();
    const analyzerRegistry = new AnalyzerRegistry();
    const manager = new PluginManager({
      pluginPaths: ['nonexistent-npm-package-xyz'],
      basePath: tempDir,
      scannerRegistry,
      analyzerRegistry,
      logger,
      eventBus: undefined,
    });
    const summary = await manager.loadAll();

    expect(summary.loaded).toHaveLength(0);
    expect(summary.failed).toHaveLength(1);
    expect(summary.failed[0]?.name).toBe('nonexistent-npm-package-xyz');
  });

  it('logs warnings for failed plugins', async () => {
    const scannerRegistry = new ScannerRegistry();
    const analyzerRegistry = new AnalyzerRegistry();
    const manager = new PluginManager({
      pluginPaths: ['./plugins/bad-version-plugin.js'],
      basePath: tempDir,
      scannerRegistry,
      analyzerRegistry,
      logger,
      eventBus: undefined,
    });
    await manager.loadAll();

    const warnCalls = logger.calls.filter((c) => c.level === 'warn');
    expect(warnCalls.length).toBeGreaterThan(0);
  });

  it('logs debug for successfully loaded plugins', async () => {
    const scannerRegistry = new ScannerRegistry();
    const analyzerRegistry = new AnalyzerRegistry();
    const manager = new PluginManager({
      pluginPaths: ['./plugins/valid-plugin.js'],
      basePath: tempDir,
      scannerRegistry,
      analyzerRegistry,
      logger,
      eventBus: undefined,
    });
    await manager.loadAll();

    const debugCalls = logger.calls.filter((c) => c.level === 'debug');
    expect(debugCalls.length).toBeGreaterThan(0);
    expect(debugCalls[0]?.message).toContain('Plugin loaded');
  });

  it('registers plugin analyzers', async () => {
    writeFileSync(
      join(tempDir, 'plugins', 'analyzer-plugin.js'),
      `module.exports = {
        name: 'analyzer-plugin',
        version: '1.0.0',
        apiVersion: 1,
        analyzers: [{
          id: 'plugin-analyzer',
          supports: () => true,
          analyze: async () => [{ ruleId: 'test-rule', target: 'x', message: 'msg' }],
        }],
      };`,
    );

    const scannerRegistry = new ScannerRegistry();
    const analyzerRegistry = new AnalyzerRegistry();
    const manager = new PluginManager({
      pluginPaths: ['./plugins/analyzer-plugin.js'],
      basePath: tempDir,
      scannerRegistry,
      analyzerRegistry,
      logger,
      eventBus: undefined,
    });
    await manager.loadAll();

    expect(analyzerRegistry.size).toBe(1);
    expect(analyzerRegistry.getAll()[0]?.id).toBe('plugin-analyzer');
  });

  it('handles duplicate scanner ID registration gracefully (logs warning)', async () => {
    const scannerRegistry = new ScannerRegistry();
    // Pre-register a scanner with the same ID.
    scannerRegistry.register({
      id: 'valid-scanner',
      version: '1.0.0',
      supports: () => true,
      execute: () => Promise.resolve([]),
    });

    const analyzerRegistry = new AnalyzerRegistry();
    const manager = new PluginManager({
      pluginPaths: ['./plugins/valid-plugin.js'],
      basePath: tempDir,
      scannerRegistry,
      analyzerRegistry,
      logger,
      eventBus: undefined,
    });
    await manager.loadAll();

    // The plugin still loads, but the duplicate scanner registration fails.
    const warnCalls = logger.calls.filter((c) => c.level === 'warn');
    const hasDupWarning = warnCalls.some((c) => c.message.includes('Failed to register scanner'));
    expect(hasDupWarning).toBe(true);
  });

  it('handles duplicate analyzer ID registration gracefully', async () => {
    writeFileSync(
      join(tempDir, 'plugins', 'dup-analyzer-plugin.js'),
      `module.exports = {
        name: 'dup-analyzer-plugin',
        version: '1.0.0',
        apiVersion: 1,
        analyzers: [{
          id: 'dup-analyzer',
          supports: () => true,
          analyze: async () => [],
        }],
      };`,
    );

    const analyzerRegistry = new AnalyzerRegistry();
    // Pre-register an analyzer with the same ID.
    analyzerRegistry.register({
      id: 'dup-analyzer',
      version: '1.0.0',
      supports: () => true,
      execute: () => Promise.resolve([]),
    });

    const scannerRegistry = new ScannerRegistry();
    const manager = new PluginManager({
      pluginPaths: ['./plugins/dup-analyzer-plugin.js'],
      basePath: tempDir,
      scannerRegistry,
      analyzerRegistry,
      logger,
      eventBus: undefined,
    });
    await manager.loadAll();

    const warnCalls = logger.calls.filter((c) => c.level === 'warn');
    const hasDupWarning = warnCalls.some((c) => c.message.includes('Failed to register analyzer'));
    expect(hasDupWarning).toBe(true);
  });

  it('resolves absolute paths', async () => {
    const validPluginAbs = join(tempDir, 'plugins', 'valid-plugin.js');
    const scannerRegistry = new ScannerRegistry();
    const analyzerRegistry = new AnalyzerRegistry();
    const manager = new PluginManager({
      pluginPaths: [validPluginAbs],
      basePath: tempDir,
      scannerRegistry,
      analyzerRegistry,
      logger,
      eventBus: undefined,
    });
    const summary = await manager.loadAll();

    expect(summary.loaded).toHaveLength(1);
  });

  it('handles invalid plugin object (null)', async () => {
    writeFileSync(
      join(tempDir, 'plugins', 'null-plugin.js'),
      `module.exports = null;`,
    );

    const scannerRegistry = new ScannerRegistry();
    const analyzerRegistry = new AnalyzerRegistry();
    const manager = new PluginManager({
      pluginPaths: ['./plugins/null-plugin.js'],
      basePath: tempDir,
      scannerRegistry,
      analyzerRegistry,
      logger,
      eventBus: undefined,
    });
    const summary = await manager.loadAll();

    expect(summary.loaded).toHaveLength(0);
    expect(summary.failed).toHaveLength(1);
  });

  it('handles plugin with non-array scanners', async () => {
    writeFileSync(
      join(tempDir, 'plugins', 'bad-scanners-plugin.js'),
      `module.exports = {
        name: 'bad-scanners',
        version: '1.0.0',
        apiVersion: 1,
        scanners: "not-an-array",
      };`,
    );

    const scannerRegistry = new ScannerRegistry();
    const analyzerRegistry = new AnalyzerRegistry();
    const manager = new PluginManager({
      pluginPaths: ['./plugins/bad-scanners-plugin.js'],
      basePath: tempDir,
      scannerRegistry,
      analyzerRegistry,
      logger,
      eventBus: undefined,
    });
    const summary = await manager.loadAll();

    expect(summary.loaded).toHaveLength(0);
    expect(summary.failed).toHaveLength(1);
  });

  it('handles plugin with non-array analyzers', async () => {
    writeFileSync(
      join(tempDir, 'plugins', 'bad-analyzers-plugin.js'),
      `module.exports = {
        name: 'bad-analyzers',
        version: '1.0.0',
        apiVersion: 1,
        analyzers: 42,
      };`,
    );

    const scannerRegistry = new ScannerRegistry();
    const analyzerRegistry = new AnalyzerRegistry();
    const manager = new PluginManager({
      pluginPaths: ['./plugins/bad-analyzers-plugin.js'],
      basePath: tempDir,
      scannerRegistry,
      analyzerRegistry,
      logger,
      eventBus: undefined,
    });
    const summary = await manager.loadAll();

    expect(summary.loaded).toHaveLength(0);
    expect(summary.failed).toHaveLength(1);
  });

  it('handles plugin with scanner missing id', async () => {
    writeFileSync(
      join(tempDir, 'plugins', 'bad-scanner-id.js'),
      `module.exports = {
        name: 'bad-scanner-id',
        version: '1.0.0',
        apiVersion: 1,
        scanners: [{ supports: () => true, scan: async () => [] }],
      };`,
    );

    const scannerRegistry = new ScannerRegistry();
    const analyzerRegistry = new AnalyzerRegistry();
    const manager = new PluginManager({
      pluginPaths: ['./plugins/bad-scanner-id.js'],
      basePath: tempDir,
      scannerRegistry,
      analyzerRegistry,
      logger,
      eventBus: undefined,
    });
    const summary = await manager.loadAll();

    expect(summary.loaded).toHaveLength(0);
    expect(summary.failed).toHaveLength(1);
  });

  it('handles plugin with analyzer missing analyze function', async () => {
    writeFileSync(
      join(tempDir, 'plugins', 'bad-analyzer-fn.js'),
      `module.exports = {
        name: 'bad-analyzer-fn',
        version: '1.0.0',
        apiVersion: 1,
        analyzers: [{ id: 'test', supports: () => true }],
      };`,
    );

    const scannerRegistry = new ScannerRegistry();
    const analyzerRegistry = new AnalyzerRegistry();
    const manager = new PluginManager({
      pluginPaths: ['./plugins/bad-analyzer-fn.js'],
      basePath: tempDir,
      scannerRegistry,
      analyzerRegistry,
      logger,
      eventBus: undefined,
    });
    const summary = await manager.loadAll();

    expect(summary.loaded).toHaveLength(0);
    expect(summary.failed).toHaveLength(1);
  });

  it('handles plugin with missing version', async () => {
    writeFileSync(
      join(tempDir, 'plugins', 'no-version.js'),
      `module.exports = {
        name: 'no-version',
        apiVersion: 1,
        scanners: [],
      };`,
    );

    const scannerRegistry = new ScannerRegistry();
    const analyzerRegistry = new AnalyzerRegistry();
    const manager = new PluginManager({
      pluginPaths: ['./plugins/no-version.js'],
      basePath: tempDir,
      scannerRegistry,
      analyzerRegistry,
      logger,
      eventBus: undefined,
    });
    const summary = await manager.loadAll();

    expect(summary.loaded).toHaveLength(0);
    expect(summary.failed).toHaveLength(1);
  });

  it('handles plugin with non-numeric apiVersion', async () => {
    writeFileSync(
      join(tempDir, 'plugins', 'string-api-version.js'),
      `module.exports = {
        name: 'string-api-version',
        version: '1.0.0',
        apiVersion: "1",
        scanners: [],
      };`,
    );

    const scannerRegistry = new ScannerRegistry();
    const analyzerRegistry = new AnalyzerRegistry();
    const manager = new PluginManager({
      pluginPaths: ['./plugins/string-api-version.js'],
      basePath: tempDir,
      scannerRegistry,
      analyzerRegistry,
      logger,
      eventBus: undefined,
    });
    const summary = await manager.loadAll();

    expect(summary.loaded).toHaveLength(0);
    expect(summary.failed).toHaveLength(1);
  });

  it('handles plugin with analyzer missing supports function', async () => {
    writeFileSync(
      join(tempDir, 'plugins', 'bad-analyzer-supports.js'),
      `module.exports = {
        name: 'bad-analyzer-supports',
        version: '1.0.0',
        apiVersion: 1,
        analyzers: [{ id: 'test', analyze: async () => [] }],
      };`,
    );

    const scannerRegistry = new ScannerRegistry();
    const analyzerRegistry = new AnalyzerRegistry();
    const manager = new PluginManager({
      pluginPaths: ['./plugins/bad-analyzer-supports.js'],
      basePath: tempDir,
      scannerRegistry,
      analyzerRegistry,
      logger,
      eventBus: undefined,
    });
    const summary = await manager.loadAll();

    expect(summary.loaded).toHaveLength(0);
    expect(summary.failed).toHaveLength(1);
  });

  it('handles plugin with analyzer missing id', async () => {
    writeFileSync(
      join(tempDir, 'plugins', 'bad-analyzer-no-id.js'),
      `module.exports = {
        name: 'bad-analyzer-no-id',
        version: '1.0.0',
        apiVersion: 1,
        analyzers: [{ supports: () => true, analyze: async () => [] }],
      };`,
    );

    const scannerRegistry = new ScannerRegistry();
    const analyzerRegistry = new AnalyzerRegistry();
    const manager = new PluginManager({
      pluginPaths: ['./plugins/bad-analyzer-no-id.js'],
      basePath: tempDir,
      scannerRegistry,
      analyzerRegistry,
      logger,
      eventBus: undefined,
    });
    const summary = await manager.loadAll();

    expect(summary.loaded).toHaveLength(0);
    expect(summary.failed).toHaveLength(1);
  });

  it('handles plugin with analyzer entry that is not an object', async () => {
    writeFileSync(
      join(tempDir, 'plugins', 'bad-analyzer-obj.js'),
      `module.exports = {
        name: 'bad-analyzer-obj',
        version: '1.0.0',
        apiVersion: 1,
        analyzers: ["not-an-object"],
      };`,
    );

    const scannerRegistry = new ScannerRegistry();
    const analyzerRegistry = new AnalyzerRegistry();
    const manager = new PluginManager({
      pluginPaths: ['./plugins/bad-analyzer-obj.js'],
      basePath: tempDir,
      scannerRegistry,
      analyzerRegistry,
      logger,
      eventBus: undefined,
    });
    const summary = await manager.loadAll();

    expect(summary.loaded).toHaveLength(0);
    expect(summary.failed).toHaveLength(1);
  });

  it('handles plugin with scanner missing supports function', async () => {
    writeFileSync(
      join(tempDir, 'plugins', 'bad-scanner-supports.js'),
      `module.exports = {
        name: 'bad-scanner-supports',
        version: '1.0.0',
        apiVersion: 1,
        scanners: [{ id: 'test', scan: async () => [] }],
      };`,
    );

    const scannerRegistry = new ScannerRegistry();
    const analyzerRegistry = new AnalyzerRegistry();
    const manager = new PluginManager({
      pluginPaths: ['./plugins/bad-scanner-supports.js'],
      basePath: tempDir,
      scannerRegistry,
      analyzerRegistry,
      logger,
      eventBus: undefined,
    });
    const summary = await manager.loadAll();

    expect(summary.loaded).toHaveLength(0);
    expect(summary.failed).toHaveLength(1);
  });

  it('handles plugin with scanner missing scan function', async () => {
    writeFileSync(
      join(tempDir, 'plugins', 'bad-scanner-scan.js'),
      `module.exports = {
        name: 'bad-scanner-scan',
        version: '1.0.0',
        apiVersion: 1,
        scanners: [{ id: 'test', supports: () => true }],
      };`,
    );

    const scannerRegistry = new ScannerRegistry();
    const analyzerRegistry = new AnalyzerRegistry();
    const manager = new PluginManager({
      pluginPaths: ['./plugins/bad-scanner-scan.js'],
      basePath: tempDir,
      scannerRegistry,
      analyzerRegistry,
      logger,
      eventBus: undefined,
    });
    const summary = await manager.loadAll();

    expect(summary.loaded).toHaveLength(0);
    expect(summary.failed).toHaveLength(1);
  });

  it('handles plugin with scanner entry that is not an object', async () => {
    writeFileSync(
      join(tempDir, 'plugins', 'bad-scanner-obj.js'),
      `module.exports = {
        name: 'bad-scanner-obj',
        version: '1.0.0',
        apiVersion: 1,
        scanners: [42],
      };`,
    );

    const scannerRegistry = new ScannerRegistry();
    const analyzerRegistry = new AnalyzerRegistry();
    const manager = new PluginManager({
      pluginPaths: ['./plugins/bad-scanner-obj.js'],
      basePath: tempDir,
      scannerRegistry,
      analyzerRegistry,
      logger,
      eventBus: undefined,
    });
    const summary = await manager.loadAll();

    expect(summary.loaded).toHaveLength(0);
    expect(summary.failed).toHaveLength(1);
  });

  it('handles plugin that is not an object', async () => {
    writeFileSync(
      join(tempDir, 'plugins', 'non-object-plugin.js'),
      `module.exports = "just a string";`,
    );

    const scannerRegistry = new ScannerRegistry();
    const analyzerRegistry = new AnalyzerRegistry();
    const manager = new PluginManager({
      pluginPaths: ['./plugins/non-object-plugin.js'],
      basePath: tempDir,
      scannerRegistry,
      analyzerRegistry,
      logger,
      eventBus: undefined,
    });
    const summary = await manager.loadAll();

    expect(summary.loaded).toHaveLength(0);
    expect(summary.failed).toHaveLength(1);
  });

  it('handles scanner registration that throws a non-Error value', async () => {
    // Create a mock registry that throws a string (not an Error).
    const throwingScannerRegistry = {
      register: () => { throw 'a string error'; },
      getAll: () => [],
      getCompatibleScanners: () => [],
      size: 0,
    } as unknown as ScannerRegistry;

    const analyzerRegistry = new AnalyzerRegistry();
    const manager = new PluginManager({
      pluginPaths: ['./plugins/valid-plugin.js'],
      basePath: tempDir,
      scannerRegistry: throwingScannerRegistry,
      analyzerRegistry,
      logger,
      eventBus: undefined,
    });
    await manager.loadAll();

    // The plugin loads, but the scanner registration fails with a warning.
    const warnCalls = logger.calls.filter((c) => c.level === 'warn');
    expect(warnCalls.some((c) => c.message.includes('Failed to register scanner'))).toBe(true);
  });

  it('handles analyzer registration that throws a non-Error value', async () => {
    writeFileSync(
      join(tempDir, 'plugins', 'analyzer-plugin-2.js'),
      `module.exports = {
        name: 'analyzer-plugin-2',
        version: '1.0.0',
        apiVersion: 1,
        analyzers: [{
          id: 'test-analyzer-2',
          supports: () => true,
          analyze: async () => [],
        }],
      };`,
    );

    // Create a mock analyzer registry that throws a string.
    const throwingAnalyzerRegistry = {
      register: () => { throw 'analyzer string error'; },
      getAll: () => [],
      getCompatibleAnalyzers: () => [],
      size: 0,
    } as unknown as AnalyzerRegistry;

    const scannerRegistry = new ScannerRegistry();
    const manager = new PluginManager({
      pluginPaths: ['./plugins/analyzer-plugin-2.js'],
      basePath: tempDir,
      scannerRegistry,
      analyzerRegistry: throwingAnalyzerRegistry,
      logger,
      eventBus: undefined,
    });
    await manager.loadAll();

    const warnCalls = logger.calls.filter((c) => c.level === 'warn');
    expect(warnCalls.some((c) => c.message.includes('Failed to register analyzer'))).toBe(true);
  });

  it('resolves relative paths with ../ prefix', async () => {
    // Create a plugin in a subdirectory and reference it with ../
    const subDir = join(tempDir, 'subdir');
    mkdirSync(subDir, { recursive: true });
    writeFileSync(
      join(subDir, 'parent-plugin.js'),
      `module.exports = {
        name: 'parent-plugin',
        version: '1.0.0',
        apiVersion: 1,
        scanners: [{
          id: 'parent-scanner',
          supports: () => true,
          scan: async () => [],
        }],
      };`,
    );
    // Reference it from a "child" directory using ../
    const childDir = join(subDir, 'child');
    mkdirSync(childDir, { recursive: true });

    const scannerRegistry = new ScannerRegistry();
    const analyzerRegistry = new AnalyzerRegistry();
    const manager = new PluginManager({
      pluginPaths: ['../parent-plugin.js'],
      basePath: childDir,
      scannerRegistry,
      analyzerRegistry,
      logger,
      eventBus: undefined,
    });
    const summary = await manager.loadAll();

    expect(summary.loaded).toHaveLength(1);
    expect(summary.loaded[0]?.name).toBe('parent-plugin');
  });

  it('handles a plugin that throws a non-Error during module evaluation', async () => {
    writeFileSync(
      join(tempDir, 'plugins', 'throw-string.js'),
      `throw "a string error during module load";`,
    );

    const scannerRegistry = new ScannerRegistry();
    const analyzerRegistry = new AnalyzerRegistry();
    const manager = new PluginManager({
      pluginPaths: ['./plugins/throw-string.js'],
      basePath: tempDir,
      scannerRegistry,
      analyzerRegistry,
      logger,
      eventBus: undefined,
    });
    const summary = await manager.loadAll();

    expect(summary.loaded).toHaveLength(0);
    expect(summary.failed).toHaveLength(1);
    expect(summary.failed[0]?.error).toContain('string error');
  });
});
