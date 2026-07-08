/**
 * Unit tests for the ArgumentParser.
 *
 * Coverage:
 *   - --version short-circuit.
 *   - --help short-circuit.
 *   - --debug flag.
 *   - --config <path> parsing.
 *   - Unknown argument rejection.
 *   - --config without a path argument rejection.
 *   - Duplicate --config rejection.
 */

import { describe, it, expect } from 'vitest';
import { parseArguments, HELP_TEXT } from '@repodoctor/cli/ArgumentParser';
import { CLIArgumentError } from '@repodoctor/errors/CLIArgumentError';

describe('ArgumentParser', () => {
  describe('--version / --help short-circuits', () => {
    it('returns a version result for --version', () => {
      const result = parseArguments(['--version'], { version: '0.0.1' });
      expect(result).toEqual({ kind: 'version', version: '0.0.1' });
    });

    it('returns a version result for -v', () => {
      const result = parseArguments(['-v'], { version: '0.0.1' });
      expect(result).toEqual({ kind: 'version', version: '0.0.1' });
    });

    it('uses 0.1.0 as the default version when none is supplied', () => {
      const result = parseArguments(['--version']);
      expect(result).toEqual({ kind: 'version', version: '0.1.0' });
    });

    it('returns a help result for --help', () => {
      const result = parseArguments(['--help']);
      expect(result).toEqual({ kind: 'help' });
    });

    it('returns a help result for -h', () => {
      const result = parseArguments(['-h']);
      expect(result).toEqual({ kind: 'help' });
    });

    it('HELP_TEXT contains usage and options', () => {
      expect(HELP_TEXT).toContain('Usage: repodoctor');
      expect(HELP_TEXT).toContain('--version');
      expect(HELP_TEXT).toContain('--help');
      expect(HELP_TEXT).toContain('--config');
      expect(HELP_TEXT).toContain('--debug');
    });
  });

  describe('normal parsing', () => {
    it('parses an empty argv into defaults', () => {
      const result = parseArguments([]);
      expect(result).toEqual({
        kind: 'parsed',
        version: false,
        help: false,
        debug: false,
        configPath: undefined,
        command: 'report',
        json: false,
        markdown: false,
        ci: false,
        threshold: undefined,
        noCache: false,
        clearCache: false,
      });
    });

    it('parses --debug', () => {
      const result = parseArguments(['--debug']);
      expect(result).toMatchObject({ kind: 'parsed', debug: true });
    });

    it('parses --config <path>', () => {
      const result = parseArguments(['--config', './my.json']);
      expect(result).toMatchObject({ kind: 'parsed', configPath: './my.json' });
    });

    it('parses --debug and --config together', () => {
      const result = parseArguments(['--debug', '--config', '/abs/path.json']);
      expect(result).toMatchObject({
        kind: 'parsed',
        debug: true,
        configPath: '/abs/path.json',
      });
    });
  });

  describe('commands and --json (v0.0.2)', () => {
    it('defaults to the report command when no command is supplied', () => {
      const result = parseArguments([]);
      expect(result).toMatchObject({ kind: 'parsed', command: 'report' });
    });

    it('parses the discover command', () => {
      const result = parseArguments(['discover']);
      expect(result).toMatchObject({ kind: 'parsed', command: 'discover' });
    });

    it('parses the inspect command (alias for discover)', () => {
      const result = parseArguments(['inspect']);
      expect(result).toMatchObject({ kind: 'parsed', command: 'inspect' });
    });

    it('parses --json flag', () => {
      const result = parseArguments(['--json']);
      expect(result).toMatchObject({ kind: 'parsed', json: true });
    });

    it('parses discover --json together', () => {
      const result = parseArguments(['discover', '--json']);
      expect(result).toMatchObject({ kind: 'parsed', command: 'discover', json: true });
    });

    it('parses --debug --json together', () => {
      const result = parseArguments(['--debug', '--json']);
      expect(result).toMatchObject({ kind: 'parsed', debug: true, json: true });
    });

    it('HELP_TEXT mentions discover and --json', () => {
      expect(HELP_TEXT).toContain('discover');
      expect(HELP_TEXT).toContain('--json');
    });

    it('parses the analyze command', () => {
      const result = parseArguments(['analyze']);
      expect(result).toMatchObject({ kind: 'parsed', command: 'analyze' });
    });

    it('parses the diagnose command', () => {
      const result = parseArguments(['diagnose']);
      expect(result).toMatchObject({ kind: 'parsed', command: 'diagnose' });
    });

    it('parses the health command (alias for diagnose)', () => {
      const result = parseArguments(['health']);
      expect(result).toMatchObject({ kind: 'parsed', command: 'health' });
    });

    it('HELP_TEXT mentions analyze', () => {
      expect(HELP_TEXT).toContain('analyze');
    });

    it('parses the report command', () => {
      const result = parseArguments(['report']);
      expect(result).toMatchObject({ kind: 'parsed', command: 'report' });
    });

    it('parses --markdown flag', () => {
      const result = parseArguments(['--markdown']);
      expect(result).toMatchObject({ kind: 'parsed', markdown: true });
    });

    it('parses --ci flag', () => {
      const result = parseArguments(['--ci']);
      expect(result).toMatchObject({ kind: 'parsed', ci: true });
    });

    it('parses --threshold <number>', () => {
      const result = parseArguments(['--threshold', '80']);
      expect(result).toMatchObject({ kind: 'parsed', threshold: 80 });
    });

    it('throws CLIArgumentError when --threshold has no value', () => {
      expect(() => parseArguments(['--threshold'])).toThrow(CLIArgumentError);
    });

    it('throws CLIArgumentError when --threshold value is not a number', () => {
      expect(() => parseArguments(['--threshold', 'abc'])).toThrow(CLIArgumentError);
    });

    it('parses report --json --ci together', () => {
      const result = parseArguments(['report', '--json', '--ci']);
      expect(result).toMatchObject({ kind: 'parsed', command: 'report', json: true, ci: true });
    });

    it('HELP_TEXT mentions report', () => {
      expect(HELP_TEXT).toContain('report');
    });

    it('HELP_TEXT mentions --markdown', () => {
      expect(HELP_TEXT).toContain('--markdown');
    });

    it('HELP_TEXT mentions --ci', () => {
      expect(HELP_TEXT).toContain('--ci');
    });

    it('HELP_TEXT mentions --threshold', () => {
      expect(HELP_TEXT).toContain('--threshold');
    });

    it('parses --no-cache flag', () => {
      const result = parseArguments(['--no-cache']);
      expect(result).toMatchObject({ kind: 'parsed', noCache: true });
    });

    it('parses --clear-cache flag', () => {
      const result = parseArguments(['--clear-cache']);
      expect(result).toMatchObject({ kind: 'parsed', clearCache: true });
    });

    it('HELP_TEXT mentions --no-cache', () => {
      expect(HELP_TEXT).toContain('--no-cache');
    });

    it('HELP_TEXT mentions --clear-cache', () => {
      expect(HELP_TEXT).toContain('--clear-cache');
    });
  });

  describe('error cases', () => {
    it('throws CLIArgumentError for an unrecognized argument', () => {
      expect(() => parseArguments(['--unknown'])).toThrow(CLIArgumentError);
    });

    it('throws CLIArgumentError for an unrecognized command', () => {
      expect(() => parseArguments(['bogus-command'])).toThrow(CLIArgumentError);
    });

    it('throws CLIArgumentError when multiple commands are supplied', () => {
      expect(() => parseArguments(['discover', 'inspect'])).toThrow(CLIArgumentError);
    });

    it('throws CLIArgumentError when --config has no following path', () => {
      expect(() => parseArguments(['--config'])).toThrow(CLIArgumentError);
    });

    it('throws CLIArgumentError when --config is followed by another flag', () => {
      expect(() => parseArguments(['--config', '--debug'])).toThrow(CLIArgumentError);
    });

    it('throws CLIArgumentError on duplicate --config', () => {
      expect(() =>
        parseArguments(['--config', 'a.json', '--config', 'b.json']),
      ).toThrow(CLIArgumentError);
    });
  });
});
