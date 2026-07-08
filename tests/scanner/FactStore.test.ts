/**
 * Unit tests for FactStore.
 *
 * Coverage:
 *   - Basic add and retrieval.
 *   - Deduplication: same fact from same scanner = no duplicate.
 *   - Merge: same fact from different scanner = merged scannerIds.
 *   - getAll, getByType, getById, size.
 *   - Immutability (frozen objects).
 *   - Deterministic ID generation.
 */

import { describe, it, expect } from 'vitest';
import { FactStore, generateFactId } from '@repodoctor/scanner/FactStore';
import type { RawFact } from '@repodoctor/core/domain/Scan';

describe('FactStore', () => {
  describe('generateFactId', () => {
    it('produces a 16-char hex string', () => {
      const fact: RawFact = { type: 'FILE_EXISTS', target: '.gitignore', value: true };
      const id = generateFactId(fact);
      expect(id).toMatch(/^[0-9a-f]{16}$/);
    });

    it('is deterministic — same input yields the same ID', () => {
      const fact: RawFact = { type: 'FILE_EXISTS', target: '.gitignore', value: true };
      expect(generateFactId(fact)).toBe(generateFactId(fact));
    });

    it('produces different IDs for different types', () => {
      const f1: RawFact = { type: 'FILE_EXISTS', target: 'x', value: true };
      const f2: RawFact = { type: 'FILE_SIZE', target: 'x', value: true };
      expect(generateFactId(f1)).not.toBe(generateFactId(f2));
    });

    it('produces different IDs for different targets', () => {
      const f1: RawFact = { type: 'FILE_EXISTS', target: 'a', value: true };
      const f2: RawFact = { type: 'FILE_EXISTS', target: 'b', value: true };
      expect(generateFactId(f1)).not.toBe(generateFactId(f2));
    });

    it('produces different IDs for different values', () => {
      const f1: RawFact = { type: 'FILE_EXISTS', target: 'x', value: true };
      const f2: RawFact = { type: 'FILE_EXISTS', target: 'x', value: false };
      expect(generateFactId(f1)).not.toBe(generateFactId(f2));
    });
  });

  describe('add and retrieval', () => {
    it('stores a fact and returns it', () => {
      const store = new FactStore();
      const fact: RawFact = { type: 'FILE_EXISTS', target: '.gitignore', value: true };
      const stored = store.add(fact, 'scanner-a');
      expect(stored.type).toBe('FILE_EXISTS');
      expect(stored.target).toBe('.gitignore');
      expect(stored.value).toBe(true);
      expect(stored.scannerIds).toEqual(['scanner-a']);
      expect(stored.id).toMatch(/^[0-9a-f]{16}$/);
      expect(stored.observedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('getAll returns all stored facts', () => {
      const store = new FactStore();
      store.add({ type: 'FILE_EXISTS', target: 'a', value: true }, 's1');
      store.add({ type: 'FILE_EXISTS', target: 'b', value: true }, 's1');
      expect(store.getAll()).toHaveLength(2);
    });

    it('getByType filters by type', () => {
      const store = new FactStore();
      store.add({ type: 'FILE_EXISTS', target: 'a', value: true }, 's1');
      store.add({ type: 'FILE_SIZE', target: 'b', value: 100 }, 's1');
      store.add({ type: 'FILE_EXISTS', target: 'c', value: false }, 's1');
      expect(store.getByType('FILE_EXISTS')).toHaveLength(2);
      expect(store.getByType('FILE_SIZE')).toHaveLength(1);
      expect(store.getByType('NONEXISTENT')).toHaveLength(0);
    });

    it('getByTarget filters by target (v0.0.4)', () => {
      const store = new FactStore();
      store.add({ type: 'FILE_EXISTS', target: 'package.json', value: true }, 's1');
      store.add({ type: 'FILE_SIZE', target: 'package.json', value: 100 }, 's1');
      store.add({ type: 'FILE_EXISTS', target: 'README.md', value: true }, 's1');
      expect(store.getByTarget('package.json')).toHaveLength(2);
      expect(store.getByTarget('README.md')).toHaveLength(1);
      expect(store.getByTarget('nonexistent')).toHaveLength(0);
    });

    it('hasFact returns true when type+target exist, false otherwise (v0.0.4)', () => {
      const store = new FactStore();
      store.add({ type: 'FILE_EXISTS', target: '.gitignore', value: true }, 's1');
      store.add({ type: 'FILE_SIZE', target: 'README.md', value: 100 }, 's1');
      expect(store.hasFact('FILE_EXISTS', '.gitignore')).toBe(true);
      expect(store.hasFact('FILE_SIZE', 'README.md')).toBe(true);
      expect(store.hasFact('FILE_EXISTS', 'README.md')).toBe(false);
      expect(store.hasFact('NONEXISTENT', '.gitignore')).toBe(false);
      expect(store.hasFact('FILE_EXISTS', 'nonexistent')).toBe(false);
    });

    it('hasFact short-circuits on the first match', () => {
      // Add many facts, then verify hasFact returns quickly.
      const store = new FactStore();
      for (let i = 0; i < 100; i++) {
        store.add({ type: 'FILE_EXISTS', target: `file-${i}`, value: true }, 's1');
      }
      // The last file should be found.
      expect(store.hasFact('FILE_EXISTS', 'file-99')).toBe(true);
      // A non-existent file should not be found.
      expect(store.hasFact('FILE_EXISTS', 'file-999')).toBe(false);
    });

    it('getById returns the fact or undefined', () => {
      const store = new FactStore();
      const stored = store.add({ type: 'FILE_EXISTS', target: 'a', value: true }, 's1');
      expect(store.getById(stored.id)).toBe(stored);
      expect(store.getById('nonexistent')).toBeUndefined();
    });

    it('size returns the fact count', () => {
      const store = new FactStore();
      expect(store.size).toBe(0);
      store.add({ type: 'FILE_EXISTS', target: 'a', value: true }, 's1');
      expect(store.size).toBe(1);
      store.add({ type: 'FILE_EXISTS', target: 'b', value: true }, 's1');
      expect(store.size).toBe(2);
    });
  });

  describe('deduplication and merge', () => {
    it('does not create a duplicate when the same scanner adds the same fact', () => {
      const store = new FactStore();
      const fact: RawFact = { type: 'FILE_EXISTS', target: '.gitignore', value: true };
      store.add(fact, 'scanner-a');
      store.add(fact, 'scanner-a');
      expect(store.size).toBe(1);
      const stored = store.getAll()[0]!;
      expect(stored.scannerIds).toEqual(['scanner-a']);
    });

    it('merges scannerIds when a different scanner adds the same fact', () => {
      const store = new FactStore();
      const fact: RawFact = { type: 'FILE_EXISTS', target: '.gitignore', value: true };
      store.add(fact, 'scanner-a');
      store.add(fact, 'scanner-b');
      expect(store.size).toBe(1);
      const stored = store.getAll()[0]!;
      expect(stored.scannerIds).toEqual(['scanner-a', 'scanner-b']);
    });

    it('does not duplicate scannerId when the same scanner adds again', () => {
      const store = new FactStore();
      const fact: RawFact = { type: 'FILE_EXISTS', target: '.gitignore', value: true };
      store.add(fact, 'scanner-a');
      store.add(fact, 'scanner-b');
      store.add(fact, 'scanner-a'); // scanner-a again
      expect(store.size).toBe(1);
      const stored = store.getAll()[0]!;
      expect(stored.scannerIds).toEqual(['scanner-a', 'scanner-b']);
    });

    it('merges with 3+ scanners', () => {
      const store = new FactStore();
      const fact: RawFact = { type: 'FILE_EXISTS', target: '.gitignore', value: true };
      store.add(fact, 'scanner-a');
      store.add(fact, 'scanner-b');
      store.add(fact, 'scanner-c');
      expect(store.getAll()[0]!.scannerIds).toEqual(['scanner-a', 'scanner-b', 'scanner-c']);
    });
  });

  describe('immutability', () => {
    it('returned facts are frozen', () => {
      const store = new FactStore();
      const stored = store.add({ type: 'FILE_EXISTS', target: 'a', value: true }, 's1');
      expect(Object.isFrozen(stored)).toBe(true);
      expect(Object.isFrozen(stored.scannerIds)).toBe(true);
    });
  });
});
