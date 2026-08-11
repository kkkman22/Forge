---
updated: 2026-08-11
description: "Use when running `/tinkerman pack <subcommand>`, enabling a domain pack in a project, or creating a new pack skeleton"

dispatch_mode: fork
allowed_tools:
  - Read
  - Bash
  - Write
---

# /tinkerman pack - Pack Management

> **Trigger**: `/tinkerman pack <subcommand>` via forge command router
> **Purpose**: Discover, enable, inspect, and scaffold Domain Packs

## 1. Overview

Forge Packs provide domain-specific knowledge (Bounded Contexts, Glossary, Scenarios, Banned Patterns, etc.) that plugs into Forge's core methodology engines. This skill manages the pack lifecycle.

## Subcommands

### `list`

Show all discovered packs with status (enabled/available).

```
/tinkerman pack list
```

### `enable <name>`

Add a pack to `.forge/config.md` frontmatter `packs:` list. Idempotent.

```
/tinkerman pack enable pms
```

### `disable <name>`

Remove a pack from `.forge/config.md` frontmatter. Idempotent.

```
/tinkerman pack disable pms
```

### `inspect <name>`

Show pack manifest details and category counts.

```
/tinkerman pack inspect pms
```

### `override <path>`

Copy a pack file to `.forge/custom/<path>` for project-level customization. Refuses if destination exists unless `--force` passed.

```
/tinkerman pack override glossary/folio.md
```

### `validate [<name>]`

Verify pack structure: manifest parses, declared directories exist. Validates all packs if no name given.

```
/tinkerman pack validate
/tinkerman pack validate pms
```

### `new <name>`

Scaffold `packs/<name>/` with `pack.yaml` and `README.md`.

```
/tinkerman pack new demo-test
```

## Execution Flow

1. Load PackRegistry via `src/pack/loader.ts`
2. Parse EnabledPacks via `src/pack/config.ts`
3. Route to command function in `src/pack/commands.ts`
4. Execute IO (file read/write) based on command result
5. Output result to user

## Edge Cases

| Case | Handling |
|------|----------|
| Pack not found | Error with available packs list |
| Config missing frontmatter | Create frontmatter with packs field |
| Override destination exists | Error unless --force |
| Path traversal in override | Reject with error |

## Gotchas
- **Pack-format mismatch**: Pack YAML format evolves, loader not updated → pack loads empty → integration test must call loadXxx(enabledPacks) and assert result.size > 0
- **Circular dependency**: Pack A depends on Pack B, B depends on A → infinite load → validate dependency DAG at enable time
- **Override drift**: Local override diverges from pack origin → inconsistent behavior → document override with reason
