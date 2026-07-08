/**
 * Integration tests for AnalyzerEngine.
 *
 * Coverage:
 *   - Full pipeline with a mocked FactStore.
 *   - FindingStore deduplication across analyzers.
 *   - Error isolation: a throwing analyzer does not crash the engine.
 *   - Timeout isolation.
 *   - Events are emitted.
 *   - AnalysisResult schema correctness.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AnalyzerEngine } from '@repodoctor/analyzer/AnalyzerEngine';
import { AnalyzerRegistry } from '@repodoctor/analyzer/AnalyzerRegistry';
import { FindingStore } from '@repodoctor/analyzer/FindingStore';
import { FindingCollector } from '@repodoctor/analyzer/FindingCollector';
import { AnalyzerExecutor } from '@repodoctor/analyzer/AnalyzerExecutor';
import { EventBus } from '@repodoctor/core/events/EventBus';
import { EnvironmentAnalyzer } from '@repodoctor/analyzer/builtins/EnvironmentAnalyzer';
import { ManifestAnalyzer } from '@repodoctor/analyzer/builtins/ManifestAnalyzer';
import { DocumentationAnalyzer } from '@repodoctor/analyzer/builtins/DocumentationAnalyzer';
import { StructureAnalyzer } from '@repodoctor/analyzer/builtins/StructureAnalyzer';
import type { IAnalyzer, AnalyzerContext } from '@repodoctor/analyzer/IAnalyzer';
import type { RepositoryProfile } from '@repodoctor/core/domain/Discovery';
import type { RawFinding } from '@repodoctor/core/domain/Analysis';
import type { ValidatedFact } from '@repodoctor/core/domain/Scan';
import { MockFactStore, makeFact } from './helpers';
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

describe('AnalyzerEngine — integration', () => {
  let logger: CapturingLogger;

  beforeEach(() => {
    logger = new CapturingLogger();
  });

  it('runs the full pipeline and returns an AnalysisResult', async () => {
    const facts: ValidatedFact[] = [
      makeFact('FILE_EXISTS', '.env', true),
      makeFact('FILE_EXISTS', '.env.example', false),
      makeFact('GITIGNORE_ENTRIES', '.gitignore', ['node_modules', 'dist']),
      makeFact('FILE_EXISTS', '.gitignore', true),
      makeFact('FILE_EXISTS', 'LICENSE', false),
      makeFact('FILE_SIZE_BYTES', 'README.md', 50),
      makeFact('DEPENDENCY_DECLARED', 'package.json', ['react', 'express']),
      makeFact('PACKAGE_MANAGER_LOCKFILE_EXISTS', 'package.json', false),
      makeFact('SCRIPT_DEFINED', 'package.json', ['test']),
    ];

    const registry = new AnalyzerRegistry();
    registry.register(new EnvironmentAnalyzer());
    registry.register(new ManifestAnalyzer());
    registry.register(new DocumentationAnalyzer());
    registry.register(new StructureAnalyzer());

    const eventBus = new EventBus();
    const engine = new AnalyzerEngine({
      factStore: new MockFactStore(facts),
      profile: makeProfile({ name: 'my-app' }),
      logger,
      eventBus,
      registry,
    });

    const result = await engine.run();

    expect(result.schemaVersion).toBe(1);
    expect(result.patient).toBe('my-app');
    expect(result.analysisCompletedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.findings.length).toBeGreaterThan(0);

    // Verify specific findings.
    const ruleIds = result.findings.map((f) => f.ruleId);
    expect(ruleIds).toContain('env-file-not-ignored');
    expect(ruleIds).toContain('env-example-missing');
    expect(ruleIds).toContain('lockfile-missing');
    expect(ruleIds).toContain('script-missing-build');
    expect(ruleIds).toContain('readme-too-short');
    expect(ruleIds).toContain('license-missing');
  });

  it('deduplicates identical findings from different analyzers', async () => {
    // Two custom analyzers that both produce the same finding.
    const analyzerA: IAnalyzer = {
      id: 'analyzer-a',
      version: '1.0.0',
      supports: () => true,
      execute(): Promise<RawFinding[]> {
        return Promise.resolve([
          { ruleId: 'duplicate-finding', target: 'x', message: 'same finding' },
        ]);
      },
    };
    const analyzerB: IAnalyzer = {
      id: 'analyzer-b',
      version: '1.0.0',
      supports: () => true,
      execute(): Promise<RawFinding[]> {
        return Promise.resolve([
          { ruleId: 'duplicate-finding', target: 'x', message: 'same finding' },
        ]);
      },
    };

    const registry = new AnalyzerRegistry();
    registry.register(analyzerA);
    registry.register(analyzerB);

    const engine = new AnalyzerEngine({
      factStore: new MockFactStore([]),
      profile: makeProfile(),
      logger,
      eventBus: undefined,
      registry,
    });

    const result = await engine.run();

    const dup = result.findings.find((f) => f.ruleId === 'duplicate-finding');
    expect(dup).toBeDefined();
    expect(dup?.analyzerIds).toHaveLength(2);
    expect(dup?.analyzerIds).toContain('analyzer-a');
    expect(dup?.analyzerIds).toContain('analyzer-b');
  });

  it('isolates analyzer failures — a throwing analyzer does not crash the engine', async () => {
    const throwingAnalyzer: IAnalyzer = {
      id: 'throwing-analyzer',
      version: '1.0.0',
      supports: () => true,
      execute(): Promise<RawFinding[]> {
        return Promise.reject(new Error('boom'));
      },
    };

    const registry = new AnalyzerRegistry();
    registry.register(new StructureAnalyzer());
    registry.register(throwingAnalyzer);

    const eventBus = new EventBus();
    const failedEvents: string[] = [];
    eventBus.on('AnalyzerFailed', () => failedEvents.push('AnalyzerFailed'));

    const engine = new AnalyzerEngine({
      factStore: new MockFactStore([makeFact('FILE_EXISTS', '.gitignore', false)]),
      profile: makeProfile(),
      logger,
      eventBus,
      registry,
    });

    const result = await engine.run();

    expect(result).toBeDefined();
    expect(result.findings.length).toBeGreaterThan(0); // StructureAnalyzer still ran
    expect(failedEvents).toContain('AnalyzerFailed');
  });

  it('handles analyzers that throw non-Error values (e.g. strings)', async () => {
    const stringThrowingAnalyzer: IAnalyzer = {
      id: 'string-throwing-analyzer',
      version: '1.0.0',
      supports: () => true,
      execute(): Promise<RawFinding[]> {
        return Promise.reject('a string error');
      },
    };

    const registry = new AnalyzerRegistry();
    registry.register(new StructureAnalyzer());
    registry.register(stringThrowingAnalyzer);

    const eventBus = new EventBus();
    const failedEvents: string[] = [];
    eventBus.on('AnalyzerFailed', () => failedEvents.push('AnalyzerFailed'));

    const engine = new AnalyzerEngine({
      factStore: new MockFactStore([]),
      profile: makeProfile(),
      logger,
      eventBus,
      registry,
    });

    const result = await engine.run();
    expect(result).toBeDefined();
    expect(failedEvents).toContain('AnalyzerFailed');
  });

  it('isolates analyzer timeouts', async () => {
    const slowAnalyzer: IAnalyzer = {
      id: 'slow-analyzer',
      version: '1.0.0',
      supports: () => true,
      execute(): Promise<RawFinding[]> {
        return new Promise((resolve) => {
          setTimeout(() => resolve([]), 3000);
        });
      },
    };

    const registry = new AnalyzerRegistry();
    registry.register(new StructureAnalyzer());
    registry.register(slowAnalyzer);

    const eventBus = new EventBus();
    const failedEvents: string[] = [];
    eventBus.on('AnalyzerFailed', () => failedEvents.push('AnalyzerFailed'));

    const engine = new AnalyzerEngine({
      factStore: new MockFactStore([]),
      profile: makeProfile(),
      logger,
      eventBus,
      registry,
    });

    const result = await engine.run();
    expect(result).toBeDefined();
    expect(failedEvents).toContain('AnalyzerFailed');
  }, 10000);

  it('emits RepositoryAnalysisCompleted with total finding count', async () => {
    const registry = new AnalyzerRegistry();
    registry.register(new StructureAnalyzer());

    const eventBus = new EventBus();
    let totalFindings = -1;
    eventBus.on('RepositoryAnalysisCompleted', (p) => {
      totalFindings = p.totalFindings;
    });

    const engine = new AnalyzerEngine({
      factStore: new MockFactStore([makeFact('FILE_EXISTS', '.gitignore', false)]),
      profile: makeProfile(),
      logger,
      eventBus,
      registry,
    });

    await engine.run();
    expect(totalFindings).toBe(1);
  });

  it('emits AnalyzerStarted and AnalyzerFinished for each analyzer', async () => {
    const registry = new AnalyzerRegistry();
    registry.register(new StructureAnalyzer());

    const eventBus = new EventBus();
    const startedEvents: string[] = [];
    const finishedEvents: string[] = [];
    eventBus.on('AnalyzerStarted', (p) => startedEvents.push(p.analyzerId));
    eventBus.on('AnalyzerFinished', (p) => finishedEvents.push(p.analyzerId));

    const engine = new AnalyzerEngine({
      factStore: new MockFactStore([]),
      profile: makeProfile(),
      logger,
      eventBus,
      registry,
    });

    await engine.run();

    expect(startedEvents).toContain('structure-analyzer');
    expect(finishedEvents).toContain('structure-analyzer');
  });

  it('emits FindingValidated for each valid finding', async () => {
    const registry = new AnalyzerRegistry();
    registry.register(new StructureAnalyzer());

    const eventBus = new EventBus();
    const validatedEvents: string[] = [];
    eventBus.on('FindingValidated', (p) => validatedEvents.push(p.findingId));

    const engine = new AnalyzerEngine({
      factStore: new MockFactStore([makeFact('FILE_EXISTS', '.gitignore', false)]),
      profile: makeProfile(),
      logger,
      eventBus,
      registry,
    });

    const result = await engine.run();
    expect(validatedEvents.length).toBe(result.findings.length);
  });

  it('filters out incompatible analyzers', async () => {
    const registry = new AnalyzerRegistry();
    registry.register(new StructureAnalyzer());
    registry.register(new ManifestAnalyzer()); // Only supports Node types

    const engine = new AnalyzerEngine({
      factStore: new MockFactStore([]),
      profile: makeProfile({ type: 'Unknown' }),
      logger,
      eventBus: undefined,
      registry,
    });

    const result = await engine.run();
    // ManifestAnalyzer should NOT have run (type is Unknown).
    const hasManifestFindings = result.findings.some((f) =>
      f.analyzerIds.includes('manifest-analyzer'),
    );
    expect(hasManifestFindings).toBe(false);
  });
});

describe('FindingCollector + FindingStore integration', () => {
  it('collector validates and stores findings, rejecting invalid ones', () => {
    const store = new FindingStore();
    const collector = new FindingCollector(store, undefined);

    const findings: RawFinding[] = [
      { ruleId: 'valid-rule', target: 'x', message: 'valid message' }, // valid
      { ruleId: 'InvalidRule', target: 'x', message: 'msg' }, // invalid (uppercase)
      { ruleId: 'valid-rule', target: '', message: 'msg' }, // invalid (empty target)
      { ruleId: 'valid-rule', target: 'y', message: '' }, // invalid (empty message)
      { ruleId: 'another-rule', target: 'z', message: 'ok' }, // valid
    ];

    const result = collector.collect(findings, 'test-analyzer');

    expect(result.accepted).toBe(2);
    expect(result.rejected).toBe(3);
    expect(result.errors).toHaveLength(3);
    expect(store.size).toBe(2);
  });
});

describe('AnalyzerExecutor — chunking', () => {
  it('handles more than 5 analyzers via chunking', async () => {
    const store = new FindingStore();
    const collector = new FindingCollector(store, undefined);
    const executor = new AnalyzerExecutor(collector, undefined);

    const analyzers: IAnalyzer[] = [];
    for (let i = 0; i < 7; i++) {
      const id = `analyzer-${i}`;
      analyzers.push({
        id,
        version: '1.0.0',
        supports: () => true,
        execute(): Promise<RawFinding[]> {
          return Promise.resolve([
            { ruleId: `rule-${id}`, target: 'x', message: 'msg' },
          ]);
        },
      });
    }

    const result = await executor.execute(analyzers, {
      profile: makeProfile(),
      factStore: new MockFactStore([]),
    } as AnalyzerContext);

    expect(result.analyzerCount).toBe(7);
    expect(result.failedCount).toBe(0);
    expect(result.totalFindingsAccepted).toBe(7);
  });
});
