# RepoDoctor

> A universal health diagnosis system for software repositories.

RepoDoctor treats your codebase like a patient. It scans, analyzes, diagnoses, and prescribes treatments — all from your terminal.

## Install

**NPM:**
```bash
npm install -g repodoctor
# or just use npx
npx repodoctor
```

**Homebrew:**
```bash
brew install repodoctor
```

**Scoop (Windows):**
```bash
scoop install repodoctor
```

**Binary:** Download the latest release for your platform from [GitHub Releases](https://github.com/repodoctor/repodoctor/releases).

## Quick Start

```bash
# Run a full diagnosis in your repo
repodoctor

# Output as JSON for CI/CD pipelines
repodoctor --json

# Generate a Markdown report
repodoctor --markdown > DIAGNOSIS.md
```

## How It Works

RepoDoctor uses a medical metaphor across five stages:

| Stage | What it does | Command |
|---|---|---|
| **Discover** | Identifies the repo (language, package manager, frameworks) | `repodoctor discover` |
| **Scan** | Collects raw facts (files, dependencies, scripts) | `repodoctor scan` |
| **Analyze** | Interprets facts into findings (missing lockfile, etc.) | `repodoctor analyze` |
| **Diagnose** | Scores health 0-100 and assigns severity | `repodoctor diagnose` |
| **Report** | Generates treatments and renders output | `repodoctor report` (default) |

## CLI Reference

```
Usage: repodoctor [command] [options]

Commands:
  discover             Run discovery only
  scan                 Run discovery + scan
  analyze              Run discovery + scan + analyze
  diagnose             Run full pipeline up to diagnosis
  report               Run everything and output a report (default)

Options:
  --version            Print version and exit
  --help               Print this help and exit
  --config <path>      Path to config file (.json or .js)
  --debug              Enable debug logging
  --json               Output as JSON
  --markdown           Output as Markdown
  --ci                 CI mode (no colors, exit non-zero on issues)
  --threshold <num>    Exit non-zero if score below <num>
  --no-cache           Bypass persistent cache
  --clear-cache        Delete cache and exit
```

## CI/CD Integration

### GitHub Actions

```yaml
name: RepoDoctor
on: [push, pull_request]
jobs:
  diagnose:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npx repodoctor --ci --threshold 70
```

The `--ci` flag disables colors and sets the exit code:
- **0** — Healthy or Excellent
- **1** — Warning, Critical, or Recovery Needed
- **2** — Fatal error

Use `--threshold <num>` to enforce a minimum score.

## Supported Languages

| Language | Manifest | Package Manager | Frameworks |
|---|---|---|---|
| **Node.js** | package.json | npm, yarn, pnpm, bun | Next.js, React, Express, NestJS |
| **Python** | requirements.txt, pyproject.toml | pip, poetry | Django, FastAPI |
| **Go** | go.mod | go modules | Gin, Echo |
| **Rust** | Cargo.toml | cargo | Actix, Axum |

## Built-in Rules

| Rule | Severity | Description |
|---|---|---|
| `env-file-not-ignored` | Critical | `.env` exists but isn't in `.gitignore` |
| `lockfile-missing` | Critical | Dependencies declared but no lockfile |
| `gitignore-missing` | Critical | No `.gitignore` file |
| `license-missing` | Warning | No LICENSE file |
| `env-example-missing` | Warning | `.env` exists but `.env.example` doesn't |
| `readme-too-short` | Minor | README.md is under 100 bytes |
| `script-missing-build` | Minor | No `build` script in package.json |

## Plugins

Write a plugin to add custom scanners or analyzers:

```typescript
// my-plugin.ts
import type { RepoDoctorPlugin } from 'repodoctor';

const myPlugin: RepoDoctorPlugin = {
  name: 'my-custom-plugin',
  version: '1.0.0',
  apiVersion: 1,
  scanners: [{
    id: 'my-scanner',
    supports: (profile) => profile.type === 'NodeApplication',
    async scan(context) {
      const exists = await context.fs.fileExists('.prettierrc');
      return [{ type: 'FILE_EXISTS', target: '.prettierrc', value: exists }];
    },
  }],
};

export default myPlugin;
```

Register it in your config:

```json
{
  "plugins": ["./my-plugin.ts"]
}
```

### Plugin API

Plugins receive a sandboxed context:
- **Scanner context:** read-only filesystem (path-traversal protected) + repository profile
- **Analyzer context:** read-only fact store + repository profile

Plugins are isolated:
- 1000ms hard timeout
- Errors return empty results (never crash the pipeline)
- Output is validated before entering the fact/finding stores

## Configuration

Create `repodoctor.config.json` in your repo root:

```json
{
  "logLevel": "info",
  "strict": false,
  "plugins": ["./my-plugin.ts"],
  "discovery": {
    "ignoreRoot": ["node_modules", ".git", "dist", "build", ".cache"]
  }
}
```

Or use `repodoctor.config.js` for dynamic config:

```javascript
module.exports = {
  logLevel: 'debug',
  plugins: ['repodoctor-nextjs'],
};
```

## Performance

- **Cold start:** ~1.5s for a standard repo
- **Warm start (cache hit):** ~150ms
- **Memory:** LRU eviction caps file cache at 50 files / 20MB
- **Cache:** Stored in `.cache/repodoctor/cache.json`, invalidated on file mtime changes

## License

MIT
