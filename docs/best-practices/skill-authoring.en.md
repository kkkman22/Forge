# SKILL Authoring Guide

## Overview

SKILLs are Forge's core extension mechanism. Each SKILL is a Markdown file defining an AI behavior contract for a specific phase.

## File Structure

```
skills/<skill-name>/
  SKILL.md          # Required, SKILL definition file
```

### SKILL.md Template

```yaml
---
name: <skill-name>
description: <one-line SKILL description>
disable-model-invocation: true   # Prevent direct AI invocation
---

# <SKILL Name>

## Overview

<SKILL's purpose and responsibilities>

## Execution Steps

1. Step 1
2. Step 2
...

## Output Format

<Files/artifacts produced by this SKILL>

## Constraints

<SKILL boundary conditions>
```

## YAML Frontmatter Rules

- `name`: Must match directory name (e.g., `skills/forge-plan/SKILL.md` → `name: forge-plan`)
- `description`: One-line functional description, validated by contract tests
- `disable-model-invocation`: Must be `true`; all SKILLs dispatch through `/forge`

## Compression Strategies

Keep each SKILL.md at a reasonable size:

| Strategy | Description |
|----------|-------------|
| **Reference Directive** | Replace rules duplicated in CLAUDE.md with `→ see CLAUDE.md §X` |
| **Canonical Example** | Keep only one complete example per output format |
| **Table Compression** | Merge multi-line descriptions into compact tables |
| **Flow Simplification** | Replace verbose flows with ≤6-line numbered steps |
| **Example Pruning** | Keep one complete example, remove duplicate scenarios |

## Naming Convention

- Prefix `forge-` + phase name (e.g., `forge-build`, `forge-review`)
- Directory name = SKILL name = YAML name
- Filename is always `SKILL.md` (uppercase)

## Verification

```bash
# Contract tests validate SKILL structure
npx vitest run test/contract.test.ts test/contract.skills.test.ts

# Character count check
wc -c skills/*/SKILL.md
```
