/**
 * Unit tests for PythonManifestParser.
 */

import { describe, it, expect } from 'vitest';
import { parseRequirementsTxt, parsePyprojectToml } from '@repodoctor/scanner/parsers/PythonManifestParser';

describe('PythonManifestParser', () => {
  describe('parseRequirementsTxt', () => {
    it('parses simple requirements', () => {
      const content = 'django==4.0.0\nrequests>=2.0.0\nflask\n';
      const deps = parseRequirementsTxt(content);
      expect(deps).toEqual(['django', 'requests', 'flask']);
    });

    it('skips comments', () => {
      const content = '# This is a comment\ndjango==4.0.0\n# Another comment\n';
      const deps = parseRequirementsTxt(content);
      expect(deps).toEqual(['django']);
    });

    it('skips empty lines', () => {
      const content = '\n\ndjango==4.0.0\n\n';
      const deps = parseRequirementsTxt(content);
      expect(deps).toEqual(['django']);
    });

    it('skips include directives (-r)', () => {
      const content = '-r base.txt\ndjango==4.0.0\n';
      const deps = parseRequirementsTxt(content);
      expect(deps).toEqual(['django']);
    });

    it('handles packages with version specifiers', () => {
      const content = 'package>=1.0.0,<2.0.0\nother~=1.0\n';
      const deps = parseRequirementsTxt(content);
      expect(deps).toEqual(['package', 'other']);
    });

    it('lowercase package names', () => {
      const content = 'Django==4.0.0\nFlask\n';
      const deps = parseRequirementsTxt(content);
      expect(deps).toEqual(['django', 'flask']);
    });

    it('returns empty for empty content', () => {
      expect(parseRequirementsTxt('')).toEqual([]);
    });

    it('returns empty for content with only comments', () => {
      expect(parseRequirementsTxt('# only comments\n')).toEqual([]);
    });
  });

  describe('parsePyprojectToml', () => {
    it('parses Poetry-style dependencies', () => {
      const content = `[tool.poetry.dependencies]
django = "^4.0"
requests = "^2.0"
python = "^3.10"`;
      const deps = parsePyprojectToml(content);
      expect(deps).toContain('django');
      expect(deps).toContain('requests');
      // 'python' should be excluded
      expect(deps).not.toContain('python');
    });

    it('parses PEP 621 style dependencies array', () => {
      const content = `[project]
dependencies = ["django>=4.0", "requests>=2.0"]`;
      const deps = parsePyprojectToml(content);
      expect(deps).toContain('django');
      expect(deps).toContain('requests');
    });

    it('returns empty when no dependencies section', () => {
      const content = `[tool.poetry]
name = "test"`;
      expect(parsePyprojectToml(content)).toEqual([]);
    });

    it('returns empty for empty content', () => {
      expect(parsePyprojectToml('')).toEqual([]);
    });

    it('lowercase dependency names', () => {
      const content = `[tool.poetry.dependencies]
Django = "^4.0"
Flask = "^2.0"`;
      const deps = parsePyprojectToml(content);
      expect(deps).toContain('django');
      expect(deps).toContain('flask');
    });
  });
});
