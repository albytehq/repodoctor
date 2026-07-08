/**
 * Unit tests for GoModParser.
 */

import { describe, it, expect } from 'vitest';
import { parseGoModContent } from '@repodoctor/scanner/parsers/GoModParser';

describe('GoModParser', () => {
  it('parses module path and require block', () => {
    const content = `module github.com/user/repo

go 1.21

require (
\tgithub.com/gin-gonic/gin v1.9.0
\tgithub.com/labstack/echo/v4 v4.11.0
)`;
    const data = parseGoModContent(content);
    expect(data.modulePath).toBe('github.com/user/repo');
    expect(data.dependencies).toContain('github.com/gin-gonic/gin');
    expect(data.dependencies).toContain('github.com/labstack/echo/v4');
  });

  it('parses single-line require', () => {
    const content = `module github.com/user/repo

go 1.21

require github.com/sirupsen/logrus v1.9.0`;
    const data = parseGoModContent(content);
    expect(data.modulePath).toBe('github.com/user/repo');
    expect(data.dependencies).toContain('github.com/sirupsen/logrus');
  });

  it('skips comments in require block', () => {
    const content = `module github.com/user/repo

require (
\tgithub.com/gin-gonic/gin v1.9.0
\t// indirect dependency
\tgithub.com/sirupsen/logrus v1.9.0
)`;
    const data = parseGoModContent(content);
    expect(data.dependencies).toContain('github.com/gin-gonic/gin');
    expect(data.dependencies).toContain('github.com/sirupsen/logrus');
  });

  it('returns empty module path when missing', () => {
    const content = `require (
\tgithub.com/gin-gonic/gin v1.9.0
)`;
    const data = parseGoModContent(content);
    expect(data.modulePath).toBe('');
    expect(data.dependencies).toContain('github.com/gin-gonic/gin');
  });

  it('returns empty deps for empty content', () => {
    const data = parseGoModContent('');
    expect(data.modulePath).toBe('');
    expect(data.dependencies).toEqual([]);
  });

  it('handles mixed block and single-line require', () => {
    const content = `module github.com/user/repo

require (
\tgithub.com/gin-gonic/gin v1.9.0
)

require github.com/sirupsen/logrus v1.9.0`;
    const data = parseGoModContent(content);
    expect(data.dependencies).toContain('github.com/gin-gonic/gin');
    expect(data.dependencies).toContain('github.com/sirupsen/logrus');
  });
});
