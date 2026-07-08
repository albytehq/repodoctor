/**
 * Unit tests for FindingStore.
 */

import { describe, it, expect } from 'vitest';
import { FindingStore, generateFindingId } from '@repodoctor/analyzer/FindingStore';
import type { RawFinding } from '@repodoctor/core/domain/Analysis';

describe('FindingStore', () => {
  describe('generateFindingId', () => {
    it('produces a 16-char hex string', () => {
      const id = generateFindingId({ ruleId: 'test', target: 'x', message: 'msg' });
      expect(id).toMatch(/^[0-9a-f]{16}$/);
    });

    it('is deterministic', () => {
      const f: RawFinding = { ruleId: 'test', target: 'x', message: 'msg' };
      expect(generateFindingId(f)).toBe(generateFindingId(f));
    });

    it('produces different IDs for different ruleIds', () => {
      const f1: RawFinding = { ruleId: 'rule-a', target: 'x', message: 'msg' };
      const f2: RawFinding = { ruleId: 'rule-b', target: 'x', message: 'msg' };
      expect(generateFindingId(f1)).not.toBe(generateFindingId(f2));
    });

    it('produces different IDs for different targets', () => {
      const f1: RawFinding = { ruleId: 'test', target: 'a', message: 'msg' };
      const f2: RawFinding = { ruleId: 'test', target: 'b', message: 'msg' };
      expect(generateFindingId(f1)).not.toBe(generateFindingId(f2));
    });

    it('does NOT depend on message', () => {
      const f1: RawFinding = { ruleId: 'test', target: 'x', message: 'message A' };
      const f2: RawFinding = { ruleId: 'test', target: 'x', message: 'message B' };
      expect(generateFindingId(f1)).toBe(generateFindingId(f2));
    });
  });

  describe('add and retrieval', () => {
    it('stores a finding and returns it', () => {
      const store = new FindingStore();
      const finding: RawFinding = { ruleId: 'test', target: 'x', message: 'msg' };
      const stored = store.add(finding, 'analyzer-a');
      expect(stored.ruleId).toBe('test');
      expect(stored.target).toBe('x');
      expect(stored.message).toBe('msg');
      expect(stored.analyzerIds).toEqual(['analyzer-a']);
      expect(stored.id).toMatch(/^[0-9a-f]{16}$/);
    });

    it('getAll returns all stored findings', () => {
      const store = new FindingStore();
      store.add({ ruleId: 'a', target: 'x', message: 'msg' }, 's1');
      store.add({ ruleId: 'b', target: 'x', message: 'msg' }, 's1');
      expect(store.getAll()).toHaveLength(2);
    });

    it('getByRule filters by ruleId', () => {
      const store = new FindingStore();
      store.add({ ruleId: 'rule-a', target: 'x', message: 'msg' }, 's1');
      store.add({ ruleId: 'rule-b', target: 'x', message: 'msg' }, 's1');
      store.add({ ruleId: 'rule-a', target: 'y', message: 'msg' }, 's1');
      expect(store.getByRule('rule-a')).toHaveLength(2);
      expect(store.getByRule('rule-b')).toHaveLength(1);
    });

    it('getByTarget filters by target', () => {
      const store = new FindingStore();
      store.add({ ruleId: 'a', target: 'x', message: 'msg' }, 's1');
      store.add({ ruleId: 'b', target: 'y', message: 'msg' }, 's1');
      expect(store.getByTarget('x')).toHaveLength(1);
    });

    it('getById returns the finding or undefined', () => {
      const store = new FindingStore();
      const stored = store.add({ ruleId: 'a', target: 'x', message: 'msg' }, 's1');
      expect(store.getById(stored.id)).toBe(stored);
      expect(store.getById('nonexistent')).toBeUndefined();
    });

    it('size returns the finding count', () => {
      const store = new FindingStore();
      expect(store.size).toBe(0);
      store.add({ ruleId: 'a', target: 'x', message: 'msg' }, 's1');
      expect(store.size).toBe(1);
    });
  });

  describe('deduplication and merge', () => {
    it('does not create a duplicate when same analyzer adds the same finding', () => {
      const store = new FindingStore();
      const finding: RawFinding = { ruleId: 'test', target: 'x', message: 'msg' };
      store.add(finding, 'analyzer-a');
      store.add(finding, 'analyzer-a');
      expect(store.size).toBe(1);
      expect(store.getAll()[0]!.analyzerIds).toEqual(['analyzer-a']);
    });

    it('merges analyzerIds when a different analyzer adds the same finding', () => {
      const store = new FindingStore();
      const finding: RawFinding = { ruleId: 'test', target: 'x', message: 'msg' };
      store.add(finding, 'analyzer-a');
      store.add(finding, 'analyzer-b');
      expect(store.size).toBe(1);
      expect(store.getAll()[0]!.analyzerIds).toEqual(['analyzer-a', 'analyzer-b']);
    });

    it('merges with 3+ analyzers', () => {
      const store = new FindingStore();
      const finding: RawFinding = { ruleId: 'test', target: 'x', message: 'msg' };
      store.add(finding, 'a1');
      store.add(finding, 'a2');
      store.add(finding, 'a3');
      expect(store.getAll()[0]!.analyzerIds).toEqual(['a1', 'a2', 'a3']);
    });

    it('does not duplicate analyzerId when same analyzer adds again', () => {
      const store = new FindingStore();
      const finding: RawFinding = { ruleId: 'test', target: 'x', message: 'msg' };
      store.add(finding, 'a1');
      store.add(finding, 'a2');
      store.add(finding, 'a1');
      expect(store.getAll()[0]!.analyzerIds).toEqual(['a1', 'a2']);
    });

    it('treats findings with same ruleId+target but different message as the same (merge)', () => {
      const store = new FindingStore();
      store.add({ ruleId: 'test', target: 'x', message: 'message A' }, 'a1');
      store.add({ ruleId: 'test', target: 'x', message: 'message B' }, 'a2');
      expect(store.size).toBe(1);
      // The first message wins (existing is not overwritten).
      expect(store.getAll()[0]!.message).toBe('message A');
    });
  });

  describe('immutability', () => {
    it('returned findings are frozen', () => {
      const store = new FindingStore();
      const stored = store.add({ ruleId: 'a', target: 'x', message: 'msg' }, 's1');
      expect(Object.isFrozen(stored)).toBe(true);
      expect(Object.isFrozen(stored.analyzerIds)).toBe(true);
    });

    it('metadata is frozen', () => {
      const store = new FindingStore();
      const stored = store.add(
        { ruleId: 'a', target: 'x', message: 'msg', metadata: { key: 'value' } },
        's1',
      );
      expect(Object.isFrozen(stored.metadata)).toBe(true);
    });
  });
});
