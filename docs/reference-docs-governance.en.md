---
title: Docs Governance Reference
category: reference
audience: [maintainer, contributor]
updated: 2026-06-16
owner: forge-maintainers
mirror_of: reference-docs-governance.md
---

[← Back to Index](./INDEX.en.md)

# Docs Governance Reference Manual

Complete reference for Forge's documentation governance system: Frontmatter spec, CLI tools, configuration, and SSOT embedding.

## Frontmatter Spec

All Markdown files in `docs/` **must** include YAML frontmatter:

```yaml
---
title: "Document Title"
category: reference | onboarding | workflow | architecture
audience: [maintainer, contributor, beginner]
updated: 2026-01-15
---
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Document title |
| `category` | enum | `reference` / `onboarding` / `workflow` / `architecture` |
| `audience` | string[] | Target audience |
| `updated` | date | Last update date (YYYY-MM-DD) |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `owner` | string | Maintaining team |
| `mirror_of` | string | Corresponding CN/EN mirror filename |

### Rules

- `updated` must be bumped when body changes (`check-docs-updated --fix` auto-fixes)
- Chinese docs (default) don't need `mirror_of`; English mirrors (`.en.md`) must declare it
- Frontmatter-only changes don't require updating the `updated` field

## CLI Tools

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

### Aggregated Commands

```bash
npm run docs:check    # Run all 9 checkers
npm run docs:index    # Generate/update INDEX
npm run docs:embeds   # Render embed directives
```

## Configuration

All configuration is in `.forge/config.md` frontmatter:

```yaml
docs.max_count: 30                          # Document count limit
docs.root_whitelist: [README.md, ...]       # Allowed root .md files
docs.grace_period_until: "2026-06-01"       # Grace period (errors downgraded to warnings)
docs.ssot_sources:                          # SSOT data source registration
  - topic: "commands"
    source: "docs/_ssot/commands.json"
    renderer: "commands-table"
staleness.warning_days: 90                  # Staleness warning threshold
staleness.critical_days: 180                # Staleness critical threshold
```

## SSOT Embedding

### Data Sources

The `docs/_ssot/` directory stores JSON-formatted SSOT data:

| File | Topic | Renderer |
|------|-------|----------|
| `commands.json` | Command list | `commands-table` / `count` |
| `routing.json` | Routing table | `routing-table` |
| `security-tiers.json` | Security tiers | `security-tiers` |
| `gate-skills.json` | Gate skills | `json-list` |

### Embed Directives

```markdown
<!-- ssot:begin topic=commands render=count -->37<!-- ssot:end topic=commands -->
```

- `topic`: Data source topic name
- `render`: Renderer name
- Content between markers is replaced with rendered output
- Supports single-line and multi-line embeds

### Renderers

| Renderer | Input Format | Output |
|----------|-------------|--------|
| `commands-table` | `{name, tier, summary}[]` | Markdown table |
| `routing-table` | `{tier, condition, sequence}[]` | Markdown table |
| `security-tiers` | `{level, name, capabilities, constraints}[]` | Tiered list |
| `json-list` | `{label, value}[]` | Label-value list |
| `count` | `any[]` | Array length |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Clean — no issues |
| 1 | Issues found (errors) |
| 2 | Issues found (warnings only) |
| 3 | Internal error |

## /forge learn Integration

`/forge learn` automatically runs three checkers (quota, staleness, links) before knowledge extraction, with a 10s budget. Results are written to the session file's "Docs Governance Diagnostics" section.
