/**
 * Unit tests for PluginWrapper.
 *
 * Coverage:
 *   - Scanner wrapper: normal execution returns facts.
 *   - Scanner wrapper: throwing plugin returns [] and does not crash.
 *   - Scanner wrapper: timeout (1000ms) is enforced.
 *   - Scanner wrapper: supports() catches errors and returns false.
 *   - Scanner wrapper: invalid facts are filtered out.
 *   - Analyzer wrapper: normal execution returns findings.
 *   - Analyzer wrapper: throwing plugin returns [] and does not crash.
 *   - Analyzer wrapper: timeout (1000ms) is enforced.
 *   - Analyzer wrapper: invalid findings are filtered out.
 */

import { describe, it, expect } from 'vitest';
import { PluginScannerWrapper, PluginAnalyzerWrapper, PLUGIN_TIMEOUT_MS } from '@repodoctor/plugins/PluginWrapper';
import type { PluginScannerDefinition, PluginAnalyzerDefinition } from '@repodoctor/plugins/types';
import type { RawFact } from '@repodoctor/core/domain/Scan';
import type { RawFinding } from '@repodoctor/core/domain/Analysis';
import type { RepositoryProfile } from '@repodoctor/core/domain/Discovery';
import type { ScannerContext } from '@repodoctor/scanner/IScanner';
import type { AnalyzerContext } from '@repodoctor/analyzer/IAnalyzer';
import { MockScannerFileSystem } from '../scanner/helpers';
import { MockFactStore, makeFact } from '../analyzer/helpers';
import { EventBus } from '@repodoctor/core/events/EventBus';
import { BaseError } from '@repodoctor/errors/BaseError';

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

const scannerContext: ScannerContext = {
  fs: new MockScannerFileSystem({ 'test.txt': 'hello' }),
  profile: anyProfile,
  workspace: { cwd: '/repo', isCI: false, isInteractive: true } as never,
};

const analyzerContext: AnalyzerContext = {
  factStore: new MockFactStore([makeFact('FILE_EXISTS', '.gitignore', true)]),
  profile: anyProfile,
};

describe('PluginScannerWrapper', () => {
  it('returns facts from a successful plugin scan', async () => {
    const def: PluginScannerDefinition = {
      id: 'test-scanner',
      supports: () => true,
      scan: () => Promise.resolve<RawFact[]>([
        { type: 'FILE_EXISTS', target: '.env', value: true },
      ]),
    };
    const wrapper = new PluginScannerWrapper(def, undefined);
    const facts = await wrapper.execute(scannerContext);
    expect(facts).toHaveLength(1);
    expect(facts[0]?.type).toBe('FILE_EXISTS');
  });

  it('returns empty array when plugin throws', async () => {
    const def: PluginScannerDefinition = {
      id: 'throwing-scanner',
      supports: () => true,
      scan: () => Promise.reject(new Error('boom')),
    };
    const wrapper = new PluginScannerWrapper(def, undefined);
    const facts = await wrapper.execute(scannerContext);
    expect(facts).toEqual([]);
  });

  it('returns empty array when plugin throws a non-Error value', async () => {
    const def: PluginScannerDefinition = {
      id: 'string-throwing-scanner',
      supports: () => true,
      scan: () => Promise.reject('a string error'),
    };
    const wrapper = new PluginScannerWrapper(def, undefined);
    const facts = await wrapper.execute(scannerContext);
    expect(facts).toEqual([]);
  });

  it('enforces a 1000ms timeout', async () => {
    const def: PluginScannerDefinition = {
      id: 'slow-scanner',
      supports: () => true,
      scan: () => new Promise<RawFact[]>((resolve) => {
        setTimeout(() => resolve([]), 3000);
      }),
    };
    const wrapper = new PluginScannerWrapper(def, undefined);
    const facts = await wrapper.execute(scannerContext);
    expect(facts).toEqual([]);
  }, 5000);

  it('filters out invalid facts', async () => {
    const def: PluginScannerDefinition = {
      id: 'invalid-facts-scanner',
      supports: () => true,
      scan: () => Promise.resolve<RawFact[]>([
        { type: 'FILE_EXISTS', target: '.env', value: true }, // valid
        { type: 'file_exists', target: 'x', value: true }, // invalid (lowercase)
        { type: '', target: 'x', value: true }, // invalid (empty type)
        { type: 'FILE_EXISTS', target: '', value: true }, // invalid (empty target)
        { type: 'FILE_EXISTS', target: 'valid', value: undefined }, // invalid (undefined value)
        { type: 'FILE_EXISTS', target: 'also-valid', value: false }, // valid
      ]),
    };
    const wrapper = new PluginScannerWrapper(def, undefined);
    const facts = await wrapper.execute(scannerContext);
    expect(facts).toHaveLength(2);
  });

  it('supports() returns true for matching profile', () => {
    const def: PluginScannerDefinition = {
      id: 'conditional-scanner',
      supports: (p) => p.type === 'NodeApplication',
      scan: () => Promise.resolve([]),
    };
    const wrapper = new PluginScannerWrapper(def, undefined);
    expect(wrapper.supports(anyProfile)).toBe(true);
  });

  it('supports() returns false when plugin supports() throws', () => {
    const def: PluginScannerDefinition = {
      id: 'bad-supports-scanner',
      supports: () => { throw new Error('bad'); },
      scan: () => Promise.resolve([]),
    };
    const wrapper = new PluginScannerWrapper(def, undefined);
    expect(wrapper.supports(anyProfile)).toBe(false);
  });

  it('has the correct id and version', () => {
    const def: PluginScannerDefinition = {
      id: 'my-plugin-scanner',
      supports: () => true,
      scan: () => Promise.resolve([]),
    };
    const wrapper = new PluginScannerWrapper(def, undefined);
    expect(wrapper.id).toBe('my-plugin-scanner');
    expect(wrapper.version).toBe('1.0.0');
  });

  it('PLUGIN_TIMEOUT_MS is 1000', () => {
    expect(PLUGIN_TIMEOUT_MS).toBe(1000);
  });

  it('emits ScannerFailed event when plugin throws and eventBus is provided', async () => {
    const eventBus = new EventBus();
    const failedEvents: string[] = [];
    eventBus.on('ScannerFailed', (p) => failedEvents.push(p.scannerId));

    const def: PluginScannerDefinition = {
      id: 'event-bus-scanner',
      supports: () => true,
      scan: () => Promise.reject(new Error('plugin error')),
    };
    const wrapper = new PluginScannerWrapper(def, eventBus);
    const facts = await wrapper.execute(scannerContext);
    expect(facts).toEqual([]);
    expect(failedEvents).toContain('event-bus-scanner');
  });

  it('emits ScannerFailed event for non-Error throws with eventBus', async () => {
    const eventBus = new EventBus();
    const failedEvents: string[] = [];
    eventBus.on('ScannerFailed', (p) => failedEvents.push(p.scannerId));

    const def: PluginScannerDefinition = {
      id: 'string-error-scanner',
      supports: () => true,
      scan: () => Promise.reject('string error'),
    };
    const wrapper = new PluginScannerWrapper(def, eventBus);
    const facts = await wrapper.execute(scannerContext);
    expect(facts).toEqual([]);
    expect(failedEvents).toContain('string-error-scanner');
  });

  it('preserves BaseError instances when emitting ScannerFailed', async () => {
    const eventBus = new EventBus();
    const failedEvents: Array<{ scannerId: string; error: BaseError }> = [];
    eventBus.on('ScannerFailed', (p) => failedEvents.push(p));

    const customError = new (class extends BaseError {
      constructor() { super('custom', 'CUSTOM_ERROR', {}); }
    })();

    const def: PluginScannerDefinition = {
      id: 'base-error-scanner',
      supports: () => true,
      scan: () => Promise.reject(customError),
    };
    const wrapper = new PluginScannerWrapper(def, eventBus);
    const facts = await wrapper.execute(scannerContext);
    expect(facts).toEqual([]);
    expect(failedEvents).toHaveLength(1);
    expect(failedEvents[0]?.error).toBe(customError);
  });
});

describe('PluginAnalyzerWrapper', () => {
  it('returns findings from a successful plugin analyze', async () => {
    const def: PluginAnalyzerDefinition = {
      id: 'test-analyzer',
      supports: () => true,
      analyze: () => Promise.resolve<RawFinding[]>([
        { ruleId: 'test-rule', target: '.env', message: 'test message' },
      ]),
    };
    const wrapper = new PluginAnalyzerWrapper(def, undefined);
    const findings = await wrapper.execute(analyzerContext);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe('test-rule');
  });

  it('returns empty array when plugin throws', async () => {
    const def: PluginAnalyzerDefinition = {
      id: 'throwing-analyzer',
      supports: () => true,
      analyze: () => Promise.reject(new Error('boom')),
    };
    const wrapper = new PluginAnalyzerWrapper(def, undefined);
    const findings = await wrapper.execute(analyzerContext);
    expect(findings).toEqual([]);
  });

  it('enforces a 1000ms timeout', async () => {
    const def: PluginAnalyzerDefinition = {
      id: 'slow-analyzer',
      supports: () => true,
      analyze: () => new Promise<RawFinding[]>((resolve) => {
        setTimeout(() => resolve([]), 3000);
      }),
    };
    const wrapper = new PluginAnalyzerWrapper(def, undefined);
    const findings = await wrapper.execute(analyzerContext);
    expect(findings).toEqual([]);
  }, 5000);

  it('filters out invalid findings', async () => {
    const def: PluginAnalyzerDefinition = {
      id: 'invalid-findings-analyzer',
      supports: () => true,
      analyze: () => Promise.resolve<RawFinding[]>([
        { ruleId: 'valid-rule', target: 'x', message: 'msg' }, // valid
        { ruleId: 'InvalidRule', target: 'x', message: 'msg' }, // invalid (uppercase)
        { ruleId: '', target: 'x', message: 'msg' }, // invalid (empty ruleId)
        { ruleId: 'valid', target: '', message: 'msg' }, // invalid (empty target)
        { ruleId: 'also-valid', target: 'y', message: 'msg' }, // valid
      ]),
    };
    const wrapper = new PluginAnalyzerWrapper(def, undefined);
    const findings = await wrapper.execute(analyzerContext);
    expect(findings).toHaveLength(2);
  });

  it('supports() returns true for matching profile', () => {
    const def: PluginAnalyzerDefinition = {
      id: 'conditional-analyzer',
      supports: (p) => p.type === 'NodeApplication',
      analyze: () => Promise.resolve([]),
    };
    const wrapper = new PluginAnalyzerWrapper(def, undefined);
    expect(wrapper.supports(anyProfile)).toBe(true);
  });

  it('supports() returns false when plugin supports() throws', () => {
    const def: PluginAnalyzerDefinition = {
      id: 'bad-supports-analyzer',
      supports: () => { throw new Error('bad'); },
      analyze: () => Promise.resolve([]),
    };
    const wrapper = new PluginAnalyzerWrapper(def, undefined);
    expect(wrapper.supports(anyProfile)).toBe(false);
  });

  it('has the correct id and version', () => {
    const def: PluginAnalyzerDefinition = {
      id: 'my-plugin-analyzer',
      supports: () => true,
      analyze: () => Promise.resolve([]),
    };
    const wrapper = new PluginAnalyzerWrapper(def, undefined);
    expect(wrapper.id).toBe('my-plugin-analyzer');
    expect(wrapper.version).toBe('1.0.0');
  });

  it('emits AnalyzerFailed event when plugin throws and eventBus is provided', async () => {
    const eventBus = new EventBus();
    const failedEvents: string[] = [];
    eventBus.on('AnalyzerFailed', (p) => failedEvents.push(p.analyzerId));

    const def: PluginAnalyzerDefinition = {
      id: 'event-bus-analyzer',
      supports: () => true,
      analyze: () => Promise.reject(new Error('plugin error')),
    };
    const wrapper = new PluginAnalyzerWrapper(def, eventBus);
    const findings = await wrapper.execute(analyzerContext);
    expect(findings).toEqual([]);
    expect(failedEvents).toContain('event-bus-analyzer');
  });

  it('emits AnalyzerFailed event for non-Error throws with eventBus', async () => {
    const eventBus = new EventBus();
    const failedEvents: string[] = [];
    eventBus.on('AnalyzerFailed', (p) => failedEvents.push(p.analyzerId));

    const def: PluginAnalyzerDefinition = {
      id: 'string-error-analyzer',
      supports: () => true,
      analyze: () => Promise.reject('string error'),
    };
    const wrapper = new PluginAnalyzerWrapper(def, eventBus);
    const findings = await wrapper.execute(analyzerContext);
    expect(findings).toEqual([]);
    expect(failedEvents).toContain('string-error-analyzer');
  });

  it('emits AnalyzerFailed event on timeout with eventBus', async () => {
    const eventBus = new EventBus();
    const failedEvents: string[] = [];
    eventBus.on('AnalyzerFailed', (p) => failedEvents.push(p.analyzerId));

    const def: PluginAnalyzerDefinition = {
      id: 'timeout-analyzer',
      supports: () => true,
      analyze: () => new Promise<RawFinding[]>((resolve) => {
        setTimeout(() => resolve([]), 3000);
      }),
    };
    const wrapper = new PluginAnalyzerWrapper(def, eventBus);
    const findings = await wrapper.execute(analyzerContext);
    expect(findings).toEqual([]);
    expect(failedEvents).toContain('timeout-analyzer');
  }, 5000);
});
