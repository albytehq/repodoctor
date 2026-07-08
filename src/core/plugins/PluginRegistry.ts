/**
 * Plugin Registry.
 *
 * Internal registry for future modules. In v0.0.1 it remains empty but
 * instantiated — it exists so that the {@link ExecutionContext} shape is
 * stable when future "Organ Doctors" are added in v0.1.0.
 *
 * Architectural role: core (plugins). This is the ONLY component in the
 * codebase explicitly authorized to behave like a singleton within a single
 * ExecutionContext — but it is always constructed and passed via DI, never
 * accessed via a module-level global.
 *
 * The registry is intentionally generic over `unknown` instances: the
 * concrete plugin contract is a v0.1.0 concern. Storing `unknown` and
 * casting at retrieval time is the type-safe way to model a heterogeneous
 * registry without leaking plugin-specific types into the core layer.
 */

/**
 * Concrete plugin registry.
 *
 * Keys are plugin names (e.g. `'organ.dependencies'`); values are plugin
 * instances whose concrete type is the caller's responsibility.
 */
export class PluginRegistry {
  private readonly plugins: Map<string, unknown> = new Map();

  /**
   * Register a plugin instance under `name`. Throws if `name` is already
   * taken — duplicate registration almost always indicates a bug.
   */
  public register(name: string, instance: unknown): void {
    if (name === '') {
      throw new Error('Plugin name must not be empty.');
    }
    if (this.plugins.has(name)) {
      throw new Error(`Plugin already registered: ${name}`);
    }
    this.plugins.set(name, instance);
  }

  /**
   * Retrieve a plugin by name, cast to the expected type `T`.
   *
   * The cast is the caller's responsibility — the registry stores plugins
   * as `unknown` to avoid leaking plugin-specific types into core. Throws
   * if no plugin is registered under `name`.
   */
  public get<T>(name: string): T {
    const instance = this.plugins.get(name);
    if (instance === undefined) {
      throw new Error(`Plugin not found: ${name}`);
    }
    return instance as T;
  }

  /**
   * Returns `true` if a plugin is registered under `name`.
   */
  public has(name: string): boolean {
    return this.plugins.has(name);
  }

  /**
   * Returns the number of registered plugins. Intended for diagnostics.
   */
  public get size(): number {
    return this.plugins.size;
  }

  /**
   * Returns a readonly list of all registered plugin names. Intended for
   * diagnostics and tests.
   */
  public list(): readonly string[] {
    return Array.from(this.plugins.keys());
  }
}
