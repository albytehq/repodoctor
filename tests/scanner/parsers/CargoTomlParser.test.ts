/**
 * Unit tests for CargoTomlParser.
 */

import { describe, it, expect } from 'vitest';
import { parseCargoTomlContent } from '@repodoctor/scanner/parsers/CargoTomlParser';

describe('CargoTomlParser', () => {
  it('parses crate name and dependencies', () => {
    const content = `[package]
name = "my-crate"
version = "0.1.0"

[dependencies]
actix-web = "4.0"
tokio = { version = "1.0", features = ["full"] }`;
    const data = parseCargoTomlContent(content);
    expect(data.crateName).toBe('my-crate');
    expect(data.dependencies).toContain('actix-web');
    expect(data.dependencies).toContain('tokio');
  });

  it('lowercase dependency names', () => {
    const content = `[package]
name = "test"

[dependencies]
Actix-Web = "4.0"`;
    const data = parseCargoTomlContent(content);
    expect(data.dependencies).toContain('actix-web');
  });

  it('skips comments in dependencies', () => {
    const content = `[package]
name = "test"

[dependencies]
# This is a comment
serde = "1.0"`;
    const data = parseCargoTomlContent(content);
    expect(data.dependencies).toContain('serde');
    expect(data.dependencies).toHaveLength(1);
  });

  it('returns empty crate name when missing', () => {
    const content = `[dependencies]
serde = "1.0"`;
    const data = parseCargoTomlContent(content);
    expect(data.crateName).toBe('');
    expect(data.dependencies).toContain('serde');
  });

  it('returns empty deps when no [dependencies] section', () => {
    const content = `[package]
name = "test"`;
    const data = parseCargoTomlContent(content);
    expect(data.crateName).toBe('test');
    expect(data.dependencies).toEqual([]);
  });

  it('returns empty for empty content', () => {
    const data = parseCargoTomlContent('');
    expect(data.crateName).toBe('');
    expect(data.dependencies).toEqual([]);
  });
});
