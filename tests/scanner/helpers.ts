/**
 * Test helper: mock ScannerFileSystem.
 *
 * Implements the {@link IScannerFileSystem} interface using an in-memory
 * Map. Tracks call counts so tests can verify caching behavior.
 */

import type { IScannerFileSystem } from '@repodoctor/core/IScannerFileSystem';

/**
 * In-memory mock of {@link IScannerFileSystem}.
 *
 * Tracks `readFileCallCount` so tests can verify that caching prevents
 * duplicate disk reads.
 */
export class MockScannerFileSystem implements IScannerFileSystem {
  public readFileCallCount = 0;
  public fileExistsCallCount = 0;
  public getFileSizeCallCount = 0;

  private readonly files: Map<string, { content: string; size: number }> = new Map();

  constructor(initial: Record<string, string> = {}) {
    for (const [path, content] of Object.entries(initial)) {
      this.files.set(path, { content, size: content.length });
    }
  }

  public addFile(path: string, content: string): void {
    this.files.set(path, { content, size: content.length });
  }

  public readFile(path: string): Promise<string> {
    this.readFileCallCount += 1;
    const file = this.files.get(path);
    if (file === undefined) {
      return Promise.reject(new Error(`File not found: ${path}`));
    }
    return Promise.resolve(file.content);
  }

  public readFileLines(path: string, start: number, end: number): Promise<string[]> {
    const file = this.files.get(path);
    if (file === undefined) {
      return Promise.reject(new Error(`File not found: ${path}`));
    }
    const lines = file.content.split('\n');
    return Promise.resolve(lines.slice(Math.max(0, start - 1), end));
  }

  public fileExists(path: string): Promise<boolean> {
    this.fileExistsCallCount += 1;
    return Promise.resolve(this.files.has(path));
  }

  public getFileSize(path: string): Promise<number> {
    this.getFileSizeCallCount += 1;
    const file = this.files.get(path);
    if (file === undefined) {
      return Promise.reject(new Error(`File not found: ${path}`));
    }
    return Promise.resolve(file.size);
  }
}
