---
name: forge-pack
description: "Orchestrate Forge Domain Pack lifecycle via list, enable, disable, inspect, override, validate, and scaffold subcommands. Use when running `/forge pack <subcommand>`, enabling a domain pack in a project, or creating a new pack skeleton."
skeleton_exempt_legacy: true
disable-model-invocation: true
---

# /forge pack - Pack Management

> **Trigger**: `/forge pack <subcommand>` via forge command router
> **Purpose**: Discover, enable, inspect, and scaffold Domain Packs

## 1. Overview

Forge Packs provide domain-specific knowledge (Bounded Contexts, Glossary, Scenarios, Banned Patterns, etc.) that plugs into Forge's core methodology engines. This skill manages the pack lifecycle.

## Subcommands

### `list`

Show all discovered packs with status (enabled/available).

```
/forge pack list
```

### `enable <name>`

Add a pack to `.forge/config.md` frontmatter `packs:` list. Idempotent.

```
/forge pack enable pms
```

### `disable <name>`

Remove a pack from `.forge/config.md` frontmatter. Idempotent.

```
/forge pack disable pms
```

### `inspect <name>`

Show pack manifest details and category counts.

```
/forge pack inspect pms
```

### `override <path>`

Copy a pack file to `.forge/custom/<path>` for project-level customization. Refuses if destination exists unless `--force` passed.

```
/forge pack override glossary/folio.md
```

### `validate [<name>]`

Verify pack structure: manifest parses, declared directories exist. Validates all packs if no name given.

```
/forge pack validate
/forge pack validate pms
```

### `new <name>`

Scaffold `packs/<name>/` with `pack.yaml` and `README.md`.

```
/forge pack new demo-test
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
