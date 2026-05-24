---
title: Docs Governance
category: reference
audience: [maintainer, contributor]
updated: 2026-05-24
owner: forge-maintainers
---

# Docs Governance System

Five-layer documentation governance: category isolation, auto-generated index, staleness detection, quota discipline, and SSOT paragraph-level embedding.

## Architecture

```
src/docs-governance/
├── types.ts                  # Shared types (DiagnosticRecord, DocPath, etc.)
├── config.ts                 # Config loader with defaults
├── domains.ts                # Domain classification
├── frontmatter/
│   ├── parser.ts             # Frontmatter parsing
│   ├── serializer.ts         # Frontmatter serialization
│   └── schema.ts             # Schema validation
├── index-generator/
│   ├── generator.ts          # INDEX.md generation
│   └── format.ts             # Entry formatting
├── ssot/
│   ├── embed-parser.ts       # Embed directive parsing
│   ├── embed-sync.ts         # Embed rendering & replacement
│   ├── registry.ts           # SSOT source registry
│   ├── renderer-registry.ts  # Renderer registration
│   ├── ssot-loader.ts        # Shared SSOT data loading
│   └── renderers/            # Topic renderers
├── reporter/
│   ├── diagnostic.ts         # Output formatting (text, NDJSON, GitHub annotations)
│   ├── exit-code.ts          # Exit code mapping
│   └── learn-integration.ts  # /forge learn insight extraction
├── cli/
│   ├── _runtime.ts           # Shared CLI runtime (computeExitResult)
│   ├── _help.ts              # Help formatting
│   ├── scan-files.ts         # Shared file walker
│   └── diagnostic-helper.ts  # Diagnostic factory
├── staleness.ts              # Staleness detection
├── bilingual.ts              # Bilingual pairing check
├── updated-auditor.ts        # Updated-field audit
├── link-checker.ts           # Internal link validation
├── quota.ts                  # Document count limits
└── root-whitelist.ts         # Root .md file whitelist
```

## CLI Scripts

### Checkers (read-only, exit code reflects health)

| Script | Purpose | Flags |
|--------|---------|-------|
| `check-docs-frontmatter` | Validates frontmatter fields | `--json` |
| `check-docs-bilingual` | Checks CN/EN pairing | `--json` |
| `check-docs-staleness` | Detects stale docs by date | `--json`, `--ci` |
| `check-docs-updated` | Checks updated field matches body changes | `--json`, `--fix` |
| `check-docs-links` | Validates internal links | `--json` |
| `check-docs-quota` | Enforces document count limits | `--json`, `--allow-grow` |
| `check-docs-index` | Verifies INDEX.md is in sync | `--json` |
| `check-docs-embeds` | Verifies SSOT embeds are current | `--json` |
| `check-docs-root-whitelist` | Checks root .md files | `--json` |

### Builders (write output)

| Script | Purpose | Flags |
|--------|---------|-------|
| `build-docs-index` | Generates INDEX.md / INDEX.en.md | `--json` |
| `build-docs-embeds` | Renders all SSOT embed directives | `--json`, `--dry-run` |

### Migration utilities

| Script | Purpose | Flags |
|--------|---------|-------|
| `migrate-docs-frontmatter` | Adds frontmatter to docs missing it | `--apply --force` |
| `scan-literal-mismatches` | Finds hardcoded counts that should be SSOT | — |
| `install-hooks` | Configures git hooks (postinstall) | — |

### Composite command

```bash
npm run docs:check            # Runs all 9 checkers sequentially
```

## Pre-commit Hook

`.githooks/pre-commit` implements a decision tree:

1. **No docs changes** → exit 0 immediately (lightweight path)
2. **Root .md changed** → root-whitelist check
3. **docs/ changed** → frontmatter, bilingual, index, updated checks
4. **docs/_ssot/ changed** → embed sync check
5. **config changed** → staleness, links, quota checks

### Grace period

Set `grace_period_until: YYYY-MM-DD` in `.forge/config.md`. During grace period, errors are downgraded to warnings. CI monitors expiry and emits a warning annotation when the period ends.

### Timeout

Each checker has a configurable timeout (default 30s) via `CHECKER_TIMEOUT` env var.

## CI Workflow

`.github/workflows/docs-governance.yml` runs on push to main and PRs that touch docs paths. Includes bypass detection for `--no-verify` commits.

## /forge learn Integration

`reporter/learn-integration.ts` extracts governance insights from diagnostic output: diagnostic frequency by code, file hotspots (3+ diagnostics), and severity distribution trends.

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Clean — no issues |
| 1 | Issues found (errors) |
| 2 | Issues found (warnings only) |
| 3 | Internal error |
