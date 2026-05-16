---
id: "ADR-0003"
title: "Single-Entry Command Consolidation: 28 slash commands → /forge"
status: accepted
date: "2026-05-16"
deciders:
  - "@maintainer"
related_adrs:
  - "(historical) 2026-05-12-plugin-distribution"
supersedes_partial: "2026-05-12-plugin-distribution.md §Phase B wrapper commands"
---

# ADR-0003: Single-Entry Command Consolidation

## Context

Forge v2.4 (ADR: `2026-05-12-plugin-distribution`) introduced `commands/` with 28 slash commands (`/forge` + 27 `/forge-<sub>` wrappers) for "plugin completeness" — letting users see all tools when typing `/`.

Two problems emerged:

1. **Entry model contradicts SKILL orchestration**. 25 sub-skills have `disable-model-invocation: true` (designed to route through the router), but the 27 wrapper commands let users bypass the router entirely. `commands/forge.md` also described a non-existent "forge" skill, causing `Skill(skill="forge", args="...")` calls to always return `Unknown skill`.

2. **Auto-advance diluted**. `next-step-protocol.md` requires auto-advance after each phase. Users entering via `/forge-build` miss prerequisite state (status.md, plan.md), causing silent idle or incorrect progression.

## Decision

1. Delete all 27 `commands/forge-<sub>.md` wrapper files. Keep only `commands/forge.md`.
2. Fix `commands/forge.md` internal Skill call syntax from `Skill(skill="forge", args="...")` to `Skill(forge-<sub>)`.
3. Convert `gen-plugin-commands.mjs` to single-entry mode (no wrapper generation).
4. Update all downstream count declarations (README, CHANGELOG, plugin.json, marketplace.json, reference-commands.md, ROADMAP.md) to SST=1.

## Alternatives Considered

1. **Keep all 28 wrappers + remove `disable-model-invocation`** — would fix the contradiction but lose router-level control (tier routing, auto-advance, branch protection). Rejected: router provides essential orchestration.
2. **Keep high-frequency wrappers (plan/build/review)** — partial solution that still fragments the entry model and complicates the auto-advance logic. Rejected: inconsistent UX.
3. **Current choice: single `/forge` entry** — clean model, all orchestration flows through one path.

## Consequences

### Positive

- Command palette clean: one entry instead of 28
- Auto-advance always goes through forge.md orchestration
- SKILL call syntax matches real skill names
- Simpler gen-plugin-commands.mjs (no file generation)

### Negative

- Existing user scripts using `/forge-<sub>` must change to `/forge <sub>` (breaking change in v2.5.0)
- Plugin upgrade requires Claude Code restart for command palette refresh

## Rollback

1. `git revert <single-entry-merge-commit>`
2. `node scripts/gen-plugin-commands.mjs` (restored script regenerates 27 wrappers)
3. Manually restore `Skill(skill="forge", args="...")` syntax in forge.md (not recommended — it was a bug)
4. Set ADR-0003 status to `superseded`, create ADR-0004 documenting rollback reason
