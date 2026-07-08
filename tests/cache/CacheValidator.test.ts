/**
 * Unit tests for CacheValidator.
 *
 * Coverage:
 *   - computeStateHash: determinism, different inputs.
 *   - isCacheValid: hash comparison.
 *   - collectFileMetadata: sorting.
 */

import { describe, it, expect } from 'vitest';
import {
  computeStateHash,
  isCacheValid,
  collectFileMetadata,
} from '@repodoctor/cache/CacheValidator';
import type { FileMetadata } from '@repodoctor/cache/types';

const META_A: FileMetadata = { name: 'package.json', mtimeMs: 1000, size: 500 };
const META_B: FileMetadata = { name: 'tsconfig.json', mtimeMs: 2000, size: 300 };
const META_C: FileMetadata = { name: '.gitignore', mtimeMs: 3000, size: 50 };

describe('CacheValidator', () => {
  describe('computeStateHash', () => {
    it('produces a 16-char hex string', () => {
      const hash = computeStateHash({ fingerprintHash: 'abc123', fileMetadata: [META_A] });
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });

    it('is deterministic — same input yields the same hash', () => {
      const params = { fingerprintHash: 'abc123', fileMetadata: [META_A, META_B] };
      expect(computeStateHash(params)).toBe(computeStateHash(params));
    });

    it('produces different hashes for different fingerprints', () => {
      const h1 = computeStateHash({ fingerprintHash: 'aaa', fileMetadata: [META_A] });
      const h2 = computeStateHash({ fingerprintHash: 'bbb', fileMetadata: [META_A] });
      expect(h1).not.toBe(h2);
    });

    it('produces different hashes for different file metadata', () => {
      const h1 = computeStateHash({ fingerprintHash: 'abc', fileMetadata: [META_A] });
      const h2 = computeStateHash({ fingerprintHash: 'abc', fileMetadata: [META_B] });
      expect(h1).not.toBe(h2);
    });

    it('produces different hashes when mtime changes', () => {
      const h1 = computeStateHash({
        fingerprintHash: 'abc',
        fileMetadata: [{ name: 'x', mtimeMs: 1000, size: 100 }],
      });
      const h2 = computeStateHash({
        fingerprintHash: 'abc',
        fileMetadata: [{ name: 'x', mtimeMs: 2000, size: 100 }],
      });
      expect(h1).not.toBe(h2);
    });

    it('produces different hashes when size changes', () => {
      const h1 = computeStateHash({
        fingerprintHash: 'abc',
        fileMetadata: [{ name: 'x', mtimeMs: 1000, size: 100 }],
      });
      const h2 = computeStateHash({
        fingerprintHash: 'abc',
        fileMetadata: [{ name: 'x', mtimeMs: 1000, size: 200 }],
      });
      expect(h1).not.toBe(h2);
    });

    it('is order-independent — same files in different order yield the same hash', () => {
      const h1 = computeStateHash({ fingerprintHash: 'abc', fileMetadata: [META_A, META_B, META_C] });
      const h2 = computeStateHash({ fingerprintHash: 'abc', fileMetadata: [META_C, META_B, META_A] });
      expect(h1).toBe(h2);
    });

    it('handles empty file metadata', () => {
      const hash = computeStateHash({ fingerprintHash: 'abc', fileMetadata: [] });
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });
  });

  describe('isCacheValid', () => {
    it('returns true when hashes match', () => {
      expect(isCacheValid('abc123', 'abc123')).toBe(true);
    });

    it('returns false when hashes differ', () => {
      expect(isCacheValid('abc123', 'def456')).toBe(false);
    });

    it('returns false for empty strings', () => {
      expect(isCacheValid('', 'abc')).toBe(false);
    });
  });

  describe('collectFileMetadata', () => {
    it('sorts metadata by name', () => {
      const result = collectFileMetadata([
        { name: 'z.txt', mtimeMs: 1, size: 1 },
        { name: 'a.txt', mtimeMs: 2, size: 2 },
        { name: 'm.txt', mtimeMs: 3, size: 3 },
      ]);
      expect(result.map((m) => m.name)).toEqual(['a.txt', 'm.txt', 'z.txt']);
    });

    it('preserves mtimeMs and size', () => {
      const result = collectFileMetadata([{ name: 'x', mtimeMs: 42, size: 99 }]);
      expect(result[0]?.mtimeMs).toBe(42);
      expect(result[0]?.size).toBe(99);
    });

    it('handles empty input', () => {
      expect(collectFileMetadata([])).toEqual([]);
    });
  });
});
