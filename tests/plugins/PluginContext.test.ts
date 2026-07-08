/**
 * Unit tests for PluginContext.
 *
 * Coverage:
 *   - Scanner context: exposes fs and profile.
 *   - Scanner context: is frozen (immutable).
 *   - Scanner context: fs delegates to the internal scanner FS.
 *   - Scanner context: path traversal throws PermissionError.
 *   - Analyzer context: exposes factStore and profile.
 *   - Analyzer context: is frozen (immutable).
 *   - Contexts do NOT expose EventBus, Logger, or ExecutionContext.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createPluginScannerContext, createPluginAnalyzerContext } from '@repodoctor/plugins/PluginContext';
import { ScannerFileSystem } from '@repodoctor/infrastructure/ScannerFileSystem';
import { MockFactStore, makeFact } from '../analyzer/helpers';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PermissionError } from '@repodoctor/errors/PermissionError';
import type { RepositoryProfile } from '@repodoctor/core/domain/Discovery';

const anyProfile: RepositoryProfile = {
  name: 'test',
  type: 'NodeApplication',
  languages: ['TypeScript'],
  packageManager: 'Npm',
  isMonorepo: false,
  workspaces: [],
  frameworks: [],
  rootFiles: [],
  configFiles: [],
};

describe('PluginContext', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'repodoctor-plugin-ctx-'));
    writeFileSync(join(tempDir, 'test.txt'), 'hello world');
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('createPluginScannerContext', () => {
    it('exposes fs and profile', () => {
      const fs = new ScannerFileSystem(tempDir);
      const ctx = createPluginScannerContext(fs, anyProfile);
      expect(ctx.fs).toBeDefined();
      expect(ctx.profile).toBe(anyProfile);
    });

    it('is frozen (immutable)', () => {
      const fs = new ScannerFileSystem(tempDir);
      const ctx = createPluginScannerContext(fs, anyProfile);
      expect(Object.isFrozen(ctx)).toBe(true);
    });

    it('fs.readFile delegates to the internal scanner FS', async () => {
      const fs = new ScannerFileSystem(tempDir);
      const ctx = createPluginScannerContext(fs, anyProfile);
      const content = await ctx.fs.readFile('test.txt');
      expect(content).toBe('hello world');
    });

    it('fs.fileExists delegates to the internal scanner FS', async () => {
      const fs = new ScannerFileSystem(tempDir);
      const ctx = createPluginScannerContext(fs, anyProfile);
      expect(await ctx.fs.fileExists('test.txt')).toBe(true);
      expect(await ctx.fs.fileExists('nonexistent.txt')).toBe(false);
    });

    it('fs.getFileSize delegates to the internal scanner FS', async () => {
      const fs = new ScannerFileSystem(tempDir);
      const ctx = createPluginScannerContext(fs, anyProfile);
      const size = await ctx.fs.getFileSize('test.txt');
      expect(size).toBe(11); // 'hello world' is 11 bytes
    });

    it('fs.readFileLines delegates to the internal scanner FS', async () => {
      const fs = new ScannerFileSystem(tempDir);
      const ctx = createPluginScannerContext(fs, anyProfile);
      const lines = await ctx.fs.readFileLines('test.txt', 1, 1);
      expect(lines).toEqual(['hello world']);
    });

    it('path traversal (../../../etc/passwd) throws PermissionError', async () => {
      const fs = new ScannerFileSystem(tempDir);
      const ctx = createPluginScannerContext(fs, anyProfile);
      await expect(ctx.fs.readFile('../../../etc/passwd')).rejects.toBeInstanceOf(PermissionError);
    });

    it('path traversal in fileExists throws PermissionError', async () => {
      const fs = new ScannerFileSystem(tempDir);
      const ctx = createPluginScannerContext(fs, anyProfile);
      await expect(ctx.fs.fileExists('../../../etc/passwd')).rejects.toBeInstanceOf(PermissionError);
    });

    it('does NOT expose EventBus, Logger, or ExecutionContext', () => {
      const fs = new ScannerFileSystem(tempDir);
      const ctx = createPluginScannerContext(fs, anyProfile);
      expect(ctx).not.toHaveProperty('eventBus');
      expect(ctx).not.toHaveProperty('logger');
      expect(ctx).not.toHaveProperty('executionContext');
    });
  });

  describe('createPluginAnalyzerContext', () => {
    it('exposes factStore and profile', () => {
      const store = new MockFactStore([]);
      const ctx = createPluginAnalyzerContext(store, anyProfile);
      expect(ctx.factStore).toBe(store);
      expect(ctx.profile).toBe(anyProfile);
    });

    it('is frozen (immutable)', () => {
      const store = new MockFactStore([]);
      const ctx = createPluginAnalyzerContext(store, anyProfile);
      expect(Object.isFrozen(ctx)).toBe(true);
    });

    it('factStore is read-only (query methods work)', () => {
      const store = new MockFactStore([makeFact('FILE_EXISTS', '.gitignore', true)]);
      const ctx = createPluginAnalyzerContext(store, anyProfile);
      expect(ctx.factStore.getAll()).toHaveLength(1);
      expect(ctx.factStore.getByType('FILE_EXISTS')).toHaveLength(1);
      expect(ctx.factStore.hasFact('FILE_EXISTS', '.gitignore')).toBe(true);
    });

    it('does NOT expose EventBus, Logger, or ExecutionContext', () => {
      const store = new MockFactStore([]);
      const ctx = createPluginAnalyzerContext(store, anyProfile);
      expect(ctx).not.toHaveProperty('eventBus');
      expect(ctx).not.toHaveProperty('logger');
      expect(ctx).not.toHaveProperty('executionContext');
    });
  });
});
