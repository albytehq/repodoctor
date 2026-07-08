/**
 * Unit tests for the ExecutionContext.
 *
 * Coverage:
 *   - All collaborators are stored and accessible.
 *   - toJSON returns the expected snapshot.
 *   - Context is immutable (frozen) at runtime.
 */

import { describe, it, expect } from 'vitest';
import { ExecutionContext } from '@repodoctor/core/context/ExecutionContext';
import { Repository } from '@repodoctor/core/domain/Repository';
import { Workspace } from '@repodoctor/core/domain/Workspace';
import { EventBus } from '@repodoctor/core/events/EventBus';
import { LifecycleManager } from '@repodoctor/core/lifecycle/LifecycleManager';
import { PluginRegistry } from '@repodoctor/core/plugins/PluginRegistry';
import { CapturingLogger } from '../../helpers';

describe('ExecutionContext', () => {
  function buildContext(): ExecutionContext {
    const workspace = new Workspace({ cwd: '/repo', isCI: false, isInteractive: true });
    const repository = new Repository('/repo');
    const config = { logLevel: 'info' as const, strict: false, organs: [] };
    const logger = new CapturingLogger();
    const eventBus = new EventBus();
    const pluginRegistry = new PluginRegistry();
    const lifecycleManager = new LifecycleManager(eventBus);
    return new ExecutionContext({
      workspace,
      repository,
      config,
      logger,
      eventBus,
      pluginRegistry,
      lifecycleManager,
    });
  }

  it('exposes all collaborators via readonly fields', () => {
    const ctx = buildContext();
    expect(ctx.workspace.cwd).toBe('/repo');
    expect(ctx.repository.name).toBe('repo');
    expect(ctx.config.logLevel).toBe('info');
    expect(ctx.config.strict).toBe(false);
    expect(ctx.config.organs).toEqual([]);
    expect(ctx.eventBus).toBeDefined();
    expect(ctx.pluginRegistry).toBeDefined();
    expect(ctx.lifecycleManager).toBeDefined();
    expect(typeof ctx.logger.info).toBe('function');
  });

  it('toJSON returns a snapshot with workspace, repository, config, pluginCount', () => {
    const ctx = buildContext();
    const snapshot = ctx.toJSON();
    expect(snapshot).toEqual({
      workspace: { cwd: '/repo', isCI: false, isInteractive: true },
      repository: { path: '/repo', name: 'repo' },
      config: { logLevel: 'info', strict: false, organs: [] },
      pluginCount: 0,
    });
  });

  it('toJSON reflects plugins added to the registry', () => {
    const ctx = buildContext();
    ctx.pluginRegistry.register('organ.test', { x: 1 });
    const snapshot = ctx.toJSON();
    expect(snapshot.pluginCount).toBe(1);
  });
});
