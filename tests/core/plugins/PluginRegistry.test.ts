/**
 * Unit tests for the PluginRegistry.
 *
 * Coverage:
 *   - register / get round-trip.
 *   - Duplicate registration throws.
 *   - get on unknown name throws.
 *   - has / size / list.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PluginRegistry } from '@repodoctor/core/plugins/PluginRegistry';

describe('PluginRegistry', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  it('starts empty', () => {
    expect(registry.size).toBe(0);
    expect(registry.list()).toEqual([]);
  });

  it('register / get round-trip returns the same instance', () => {
    const instance = { name: 'dep-doctor' };
    registry.register('organ.dependencies', instance);
    expect(registry.get<typeof instance>('organ.dependencies')).toBe(instance);
  });

  it('has returns true for registered plugins', () => {
    registry.register('a', { x: 1 });
    expect(registry.has('a')).toBe(true);
    expect(registry.has('b')).toBe(false);
  });

  it('throws on duplicate registration', () => {
    registry.register('a', {});
    expect(() => registry.register('a', {})).toThrow(/already registered/);
  });

  it('throws when getting an unregistered plugin', () => {
    expect(() => registry.get('missing')).toThrow(/not found/);
  });

  it('throws when registering with an empty name', () => {
    expect(() => registry.register('', {})).toThrow(/must not be empty/);
  });

  it('list returns all registered names', () => {
    registry.register('a', {});
    registry.register('b', {});
    registry.register('c', {});
    const names = [...registry.list()].sort();
    expect(names).toEqual(['a', 'b', 'c']);
    expect(registry.size).toBe(3);
  });
});
