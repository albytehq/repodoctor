/**
 * Unit tests for the domain models.
 *
 * Coverage:
 *   - Repository: path / name derivation, empty-path rejection.
 *   - Workspace: field storage, empty-cwd rejection, toJSON.
 */

import { describe, it, expect } from 'vitest';
import { Repository } from '@repodoctor/core/domain/Repository';
import { Workspace } from '@repodoctor/core/domain/Workspace';

describe('Repository', () => {
  it('stores the absolute path and derives the name from the basename', () => {
    const repo = new Repository('/dev/repos/repodoctor');
    expect(repo.path).toBe('/dev/repos/repodoctor');
    expect(repo.name).toBe('repodoctor');
  });

  it('handles Windows-style paths', () => {
    const repo = new Repository('C:\\dev\\repos\\my-repo');
    expect(repo.name).toBe('my-repo');
  });

  it('handles trailing slashes', () => {
    const repo = new Repository('/dev/repos/my-repo/');
    expect(repo.name).toBe('my-repo');
  });

  it('handles multiple trailing slashes', () => {
    const repo = new Repository('/dev/repos/my-repo///');
    expect(repo.name).toBe('my-repo');
  });

  it('handles backslash-only paths (Windows single-segment)', () => {
    const repo = new Repository('C:\\my-repo');
    expect(repo.name).toBe('my-repo');
  });

  it('falls back to the raw path when there are no separators', () => {
    const repo = new Repository('just-a-name');
    expect(repo.name).toBe('just-a-name');
  });

  it('falls back to the raw path when the path is only separators', () => {
    // Exercises the `lastSegment ?? path` fallback branch in Repository.
    const repo = new Repository('/');
    expect(repo.name).toBe('/');
  });

  it('falls back to the raw path when the path is only backslashes', () => {
    const repo = new Repository('\\\\');
    expect(repo.name).toBe('\\\\');
  });

  it('rejects an empty path', () => {
    expect(() => new Repository('')).toThrow(/must not be empty/);
  });

  it('toJSON returns a plain object snapshot', () => {
    const repo = new Repository('/dev/repos/repodoctor');
    expect(repo.toJSON()).toEqual({
      path: '/dev/repos/repodoctor',
      name: 'repodoctor',
    });
  });
});

describe('Workspace', () => {
  it('stores cwd, isCI, and isInteractive', () => {
    const ws = new Workspace({ cwd: '/repo', isCI: true, isInteractive: false });
    expect(ws.cwd).toBe('/repo');
    expect(ws.isCI).toBe(true);
    expect(ws.isInteractive).toBe(false);
  });

  it('rejects an empty cwd', () => {
    expect(() => new Workspace({ cwd: '', isCI: false, isInteractive: false })).toThrow(
      /must not be empty/,
    );
  });

  it('toJSON returns a plain object snapshot', () => {
    const ws = new Workspace({ cwd: '/repo', isCI: true, isInteractive: false });
    expect(ws.toJSON()).toEqual({
      cwd: '/repo',
      isCI: true,
      isInteractive: false,
    });
  });
});
