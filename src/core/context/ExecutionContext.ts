/**
 * Execution Context — the dependency injection container.
 *
 * Carries every collaborator a module needs (workspace, repository, config,
 * logger, event bus, plugin registry, lifecycle manager) through the
 * execution lifecycle. Once constructed, its properties are immutable —
 * modules receive it as a constructor argument or function parameter and
 * read from it freely, but they never reassign its fields.
 *
 * Architectural role: core (context) — the central composition point.
 */

import type { ILogger } from '@repodoctor/core/ILogger';
import type { IEventBus } from '@repodoctor/core/events/IEventBus';
import type { PluginRegistry } from '@repodoctor/core/plugins/PluginRegistry';
import type { LifecycleManager } from '@repodoctor/core/lifecycle/LifecycleManager';
import type { Repository } from '@repodoctor/core/domain/Repository';
import type { Workspace } from '@repodoctor/core/domain/Workspace';

/**
 * Discovery-specific config shape carried by the context.
 *
 * Mirrors `DiscoveryConfig` from `config/types.ts` without importing it
 * (to keep core free of runtime config dependencies).
 */
export interface DiscoveryConfigShape {
  readonly ignoreRoot: readonly string[];
}

/**
 * The config type carried by the context.
 *
 * Imported lazily as a type-only import to avoid creating a runtime
 * dependency from core → config (which would violate the layering rules).
 * The runtime object is supplied by the CLI bootstrap; core only needs to
 * know its shape.
 */
export interface RepoDoctorConfigShape {
  readonly logLevel: 'debug' | 'info' | 'warn' | 'error' | 'silent';
  readonly strict: boolean;
  readonly organs: readonly string[];
  readonly discovery: DiscoveryConfigShape;
  readonly plugins: readonly string[];
}

/**
 * Parameters accepted by the {@link ExecutionContext} constructor.
 *
 * Exposed so that the CLI bootstrap (and tests) can construct a context
 * without naming every collaborator positionally.
 */
export interface ExecutionContextParams {
  readonly workspace: Workspace;
  readonly repository: Repository;
  readonly config: RepoDoctorConfigShape;
  readonly logger: ILogger;
  readonly eventBus: IEventBus;
  readonly pluginRegistry: PluginRegistry;
  readonly lifecycleManager: LifecycleManager;
}

/**
 * Immutable container passed through the execution lifecycle.
 *
 * The context is constructed exactly once during bootstrap and then handed
 * to every collaborator that needs access to shared state. It deliberately
 * exposes its fields as `readonly` — reassignment is a programmer error.
 */
export class ExecutionContext {
  public readonly workspace: Workspace;
  public readonly repository: Repository;
  public readonly config: RepoDoctorConfigShape;
  public readonly logger: ILogger;
  public readonly eventBus: IEventBus;
  public readonly pluginRegistry: PluginRegistry;
  public readonly lifecycleManager: LifecycleManager;

  constructor(params: ExecutionContextParams) {
    this.workspace = params.workspace;
    this.repository = params.repository;
    this.config = params.config;
    this.logger = params.logger;
    this.eventBus = params.eventBus;
    this.pluginRegistry = params.pluginRegistry;
    this.lifecycleManager = params.lifecycleManager;
  }

  /**
   * Returns a plain-object snapshot of the context for diagnostic logging.
   * Does not include the logger / event bus / registry instances themselves
   * (they are not serializable); only their identifying metadata.
   */
  public toJSON(): {
    workspace: { cwd: string; isCI: boolean; isInteractive: boolean };
    repository: { path: string; name: string };
    config: RepoDoctorConfigShape;
    pluginCount: number;
  } {
    return {
      workspace: this.workspace.toJSON(),
      repository: this.repository.toJSON(),
      config: this.config,
      pluginCount: this.pluginRegistry.size,
    };
  }
}
