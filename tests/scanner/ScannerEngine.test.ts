/**
 * Integration tests for ScannerEngine.
 *
 * Coverage:
 *   - Full pipeline with a mocked ScannerFileSystem.
 *   - FactStore deduplication across scanners.
 *   - Error isolation: a throwing scanner does not crash the engine.
 *   - Events are emitted.
 *   - ScanResult schema correctness.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ScannerEngine } from '@repodoctor/scanner/ScannerEngine';
import { ScannerRegistry } from '@repodoctor/scanner/ScannerRegistry';
import { FactStore } from '@repodoctor/scanner/FactStore';
import { FactCollector } from '@repodoctor/scanner/FactCollector';
import { ScannerExecutor } from '@repodoctor/scanner/ScannerExecutor';
import { EventBus } from '@repodoctor/core/events/EventBus';
import { RootStructureScanner } from '@repodoctor/scanner/builtins/RootStructureScanner';
import { ManifestScanner } from '@repodoctor/scanner/builtins/ManifestScanner';
import { DocumentationScanner } from '@repodoctor/scanner/builtins/DocumentationScanner';
import { GitScanner } from '@repodoctor/scanner/builtins/GitScanner';
import { EnvironmentScanner } from '@repodoctor/scanner/builtins/EnvironmentScanner';
import type { IScanner, ScannerContext } from '@repodoctor/scanner/IScanner';
import type { RepositoryProfile } from '@repodoctor/core/domain/Discovery';
import type { RawFact } from '@repodoctor/core/domain/Scan';
import { MockScannerFileSystem } from './helpers';
import { CapturingLogger } from '../helpers';

function makeProfile(overrides: Partial<RepositoryProfile> = {}): RepositoryProfile {
  return {
    name: 'test-repo',
    type: 'NodeApplication',
    languages: ['TypeScript'],
    packageManager: 'Npm',
    isMonorepo: false,
    workspaces: [],
    frameworks: [],
    rootFiles: [],
    configFiles: [],
    ...overrides,
  };
}

function makeWorkspace() {
  return { cwd: '/repo', isCI: false, isInteractive: true, toJSON: () => ({}) } as never;
}

describe('ScannerEngine — integration', () => {
  let logger: CapturingLogger;

  beforeEach(() => {
    logger = new CapturingLogger();
  });

  it('runs the full pipeline and returns a ScanResult', async () => {
    const fs = new MockScannerFileSystem({
      'package.json': JSON.stringify({
        name: 'my-app',
        dependencies: { express: '4.0.0' },
        scripts: { start: 'node index.js' },
      }),
      '.gitignore': 'node_modules\ndist',
      'README.md': '# My App',
      'pnpm-lock.yaml': '',
    });

    const registry = new ScannerRegistry();
    registry.register(new RootStructureScanner());
    registry.register(new ManifestScanner());
    registry.register(new DocumentationScanner());
    registry.register(new GitScanner());
    registry.register(new EnvironmentScanner());

    const eventBus = new EventBus();
    const engine = new ScannerEngine({
      fileSystem: fs,
      profile: makeProfile({ name: 'my-app' }),
      workspace: makeWorkspace(),
      logger,
      eventBus,
      registry,
    });

    const result = await engine.run();

    expect(result.schemaVersion).toBe(1);
    expect(result.patient).toBe('my-app');
    expect(result.scanCompletedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.facts.length).toBeGreaterThan(0);

    // Verify specific facts.
    const gitignoreExists = result.facts.find(
      (f) => f.type === 'FILE_EXISTS' && f.target === '.gitignore',
    );
    expect(gitignoreExists?.value).toBe(true);

    const deps = result.facts.find((f) => f.type === 'DEPENDENCY_DECLARED');
    expect(deps?.value).toEqual(['express']);

    const gitignoreEntries = result.facts.find((f) => f.type === 'GITIGNORE_ENTRIES');
    expect(gitignoreEntries?.value).toEqual(['node_modules', 'dist']);
  });

  it('deduplicates identical facts from different scanners', async () => {
    // Two custom scanners that both emit the same FILE_EXISTS fact for
    // the same file. The FactStore should merge their scannerIds.
    const scannerA: IScanner = {
      id: 'scanner-a',
      version: '1.0.0',
      supports: () => true,
      execute(): Promise<RawFact[]> {
        return Promise.resolve([{ type: 'FILE_EXISTS', target: 'shared.txt', value: true }]);
      },
    };
    const scannerB: IScanner = {
      id: 'scanner-b',
      version: '1.0.0',
      supports: () => true,
      execute(): Promise<RawFact[]> {
        return Promise.resolve([{ type: 'FILE_EXISTS', target: 'shared.txt', value: true }]);
      },
    };

    const fs = new MockScannerFileSystem({});

    const registry = new ScannerRegistry();
    registry.register(scannerA);
    registry.register(scannerB);

    const engine = new ScannerEngine({
      fileSystem: fs,
      profile: makeProfile(),
      workspace: makeWorkspace(),
      logger,
      eventBus: undefined,
      registry,
    });

    const result = await engine.run();

    // Find the FILE_EXISTS fact for shared.txt — it should have 2 scanner IDs.
    const sharedFact = result.facts.find(
      (f) => f.type === 'FILE_EXISTS' && f.target === 'shared.txt',
    );
    expect(sharedFact).toBeDefined();
    expect(sharedFact?.scannerIds).toHaveLength(2);
    expect(sharedFact?.scannerIds).toContain('scanner-a');
    expect(sharedFact?.scannerIds).toContain('scanner-b');
  });

  it('isolates scanner failures — a throwing scanner does not crash the engine', async () => {
    const throwingScanner: IScanner = {
      id: 'throwing-scanner',
      version: '1.0.0',
      supports: () => true,
      execute(_context: ScannerContext): Promise<RawFact[]> {
        return Promise.reject(new Error('boom'));
      },
    };

    const fs = new MockScannerFileSystem({});

    const registry = new ScannerRegistry();
    registry.register(new RootStructureScanner());
    registry.register(throwingScanner);

    const eventBus = new EventBus();
    const failedEvents: string[] = [];
    eventBus.on('ScannerFailed', () => failedEvents.push('ScannerFailed'));

    const engine = new ScannerEngine({
      fileSystem: fs,
      profile: makeProfile(),
      workspace: makeWorkspace(),
      logger,
      eventBus,
      registry,
    });

    const result = await engine.run();

    // The engine completed successfully.
    expect(result).toBeDefined();
    expect(result.facts.length).toBeGreaterThan(0); // RootStructureScanner still ran

    // The failure was recorded.
    expect(failedEvents).toContain('ScannerFailed');
  });

  it('handles scanners that throw non-Error values (e.g. strings)', async () => {
    // Exercises the `String(error)` branch in ScannerExecutor.toBaseError.
    const stringThrowingScanner: IScanner = {
      id: 'string-throwing-scanner',
      version: '1.0.0',
      supports: () => true,
      execute(): Promise<RawFact[]> {
        return Promise.reject('a string error');
      },
    };

    const fs = new MockScannerFileSystem({});
    const registry = new ScannerRegistry();
    registry.register(new RootStructureScanner());
    registry.register(stringThrowingScanner);

    const eventBus = new EventBus();
    const failedEvents: string[] = [];
    eventBus.on('ScannerFailed', () => failedEvents.push('ScannerFailed'));

    const engine = new ScannerEngine({
      fileSystem: fs,
      profile: makeProfile(),
      workspace: makeWorkspace(),
      logger,
      eventBus,
      registry,
    });

    const result = await engine.run();
    expect(result).toBeDefined();
    expect(failedEvents).toContain('ScannerFailed');
  });

  it('isolates scanner timeouts', async () => {
    const slowScanner: IScanner = {
      id: 'slow-scanner',
      version: '1.0.0',
      supports: () => true,
      execute(_context: ScannerContext): Promise<RawFact[]> {
        // Sleep for longer than the 3000ms timeout.
        return new Promise((resolve) => {
          setTimeout(() => resolve([]), 4000);
        });
      },
    };

    const fs = new MockScannerFileSystem({});
    const registry = new ScannerRegistry();
    registry.register(new RootStructureScanner());
    registry.register(slowScanner);

    const eventBus = new EventBus();
    const failedEvents: string[] = [];
    eventBus.on('ScannerFailed', () => failedEvents.push('ScannerFailed'));

    const engine = new ScannerEngine({
      fileSystem: fs,
      profile: makeProfile(),
      workspace: makeWorkspace(),
      logger,
      eventBus,
      registry,
    });

    const result = await engine.run();
    expect(result).toBeDefined();
    expect(failedEvents).toContain('ScannerFailed');
  }, 10000);

  it('emits RepositoryScanCompleted with total fact count', async () => {
    const fs = new MockScannerFileSystem({
      '.gitignore': 'node_modules',
    });

    const registry = new ScannerRegistry();
    registry.register(new GitScanner());

    const eventBus = new EventBus();
    let totalFacts = -1;
    eventBus.on('RepositoryScanCompleted', (payload) => {
      totalFacts = payload.totalFacts;
    });

    const engine = new ScannerEngine({
      fileSystem: fs,
      profile: makeProfile(),
      workspace: makeWorkspace(),
      logger,
      eventBus,
      registry,
    });

    await engine.run();
    expect(totalFacts).toBeGreaterThan(0);
  });

  it('emits ScannerStarted and ScannerFinished for each scanner', async () => {
    const fs = new MockScannerFileSystem({});
    const registry = new ScannerRegistry();
    registry.register(new RootStructureScanner());

    const eventBus = new EventBus();
    const startedEvents: string[] = [];
    const finishedEvents: string[] = [];
    eventBus.on('ScannerStarted', (p) => startedEvents.push(p.scannerId));
    eventBus.on('ScannerFinished', (p) => finishedEvents.push(p.scannerId));

    const engine = new ScannerEngine({
      fileSystem: fs,
      profile: makeProfile(),
      workspace: makeWorkspace(),
      logger,
      eventBus,
      registry,
    });

    await engine.run();

    expect(startedEvents).toContain('root-structure-scanner');
    expect(finishedEvents).toContain('root-structure-scanner');
  });

  it('emits FactValidated for each valid fact', async () => {
    const fs = new MockScannerFileSystem({
      '.gitignore': 'node_modules',
    });

    const registry = new ScannerRegistry();
    registry.register(new GitScanner());

    const eventBus = new EventBus();
    const validatedEvents: string[] = [];
    eventBus.on('FactValidated', (p) => validatedEvents.push(p.factId));

    const engine = new ScannerEngine({
      fileSystem: fs,
      profile: makeProfile(),
      workspace: makeWorkspace(),
      logger,
      eventBus,
      registry,
    });

    const result = await engine.run();
    expect(validatedEvents.length).toBe(result.facts.length);
  });

  it('filters out incompatible scanners', async () => {
    const fs = new MockScannerFileSystem({});

    const registry = new ScannerRegistry();
    registry.register(new RootStructureScanner());
    registry.register(new ManifestScanner()); // Only supports NodeApplication/NodeMonorepo

    const engine = new ScannerEngine({
      fileSystem: fs,
      profile: makeProfile({ type: 'Unknown' }),
      workspace: makeWorkspace(),
      logger,
      eventBus: undefined,
      registry,
    });

    const result = await engine.run();
    // ManifestScanner should NOT have run (type is Unknown).
    const hasManifestFacts = result.facts.some((f) => f.scannerIds.includes('manifest-scanner'));
    expect(hasManifestFacts).toBe(false);
    // RootStructureScanner should have run.
    const hasRootFacts = result.facts.some((f) => f.scannerIds.includes('root-structure-scanner'));
    expect(hasRootFacts).toBe(true);
  });
});

describe('FactCollector + FactStore integration', () => {
  it('collector validates and stores facts, rejecting invalid ones', () => {
    const store = new FactStore();
    const collector = new FactCollector(store, undefined);

    const facts: RawFact[] = [
      { type: 'FILE_EXISTS', target: 'a', value: true }, // valid
      { type: 'file_exists', target: 'b', value: true }, // invalid (lowercase)
      { type: 'FILE_EXISTS', target: '', value: true }, // invalid (empty target)
      { type: 'FILE_EXISTS', target: 'c', value: undefined }, // invalid (undefined value)
      { type: 'FILE_EXISTS', target: 'd', value: false }, // valid
    ];

    const result = collector.collect(facts, 'test-scanner');

    expect(result.accepted).toBe(2);
    expect(result.rejected).toBe(3);
    expect(result.errors).toHaveLength(3);
    expect(store.size).toBe(2);
  });
});

describe('ScannerExecutor — chunking', () => {
  it('handles more than 5 scanners via chunking', async () => {
    const fs = new MockScannerFileSystem({});
    const store = new FactStore();
    const collector = new FactCollector(store, undefined);
    const executor = new ScannerExecutor(collector, undefined);

    // Create 7 scanners.
    const scanners: IScanner[] = [];
    for (let i = 0; i < 7; i++) {
      const id = `scanner-${i}`;
      scanners.push({
        id,
        version: '1.0.0',
        supports: () => true,
        execute(): Promise<RawFact[]> {
          return Promise.resolve([{ type: 'FACT', target: `target-${id}`, value: true }]);
        },
      });
    }

    const result = await executor.execute(scanners, {
      fs,
      profile: makeProfile(),
      workspace: makeWorkspace(),
    });

    expect(result.scannerCount).toBe(7);
    expect(result.failedCount).toBe(0);
    expect(result.totalFactsAccepted).toBe(7);
  });
});
