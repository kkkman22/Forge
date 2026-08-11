---
id: ADR-0004
title: "Skills Collapse and Dispatcher"
status: accepted
date: 2026-05-17
deciders:
  - "@maintainer"
related_adrs:
  - "ADR-0003 (extended)"
  - "(historical) 2026-05-12-plugin-distribution"
supersedes_partial: "ADR-0003 §Decision §Rollback"
spec_ref: ".kiro/specs/forge-single-entry-skills-collapse/spec.md"
---

# ADR-0004: Skills Collapse and Dispatcher

## Context

ADR-0003 deleted 27 wrapper commands and consolidated to a single `/forge` entry. However, 29 `forge-*` SKILL.md files still registered as top-level Claude Code skills, causing three ongoing problems:

1. **`/` menu pollution**. 29 `forge-*` entries clutter the command palette despite ADR-0003's intent to clean it up. Users see `forge-build`, `forge-plan`, etc. alongside the intended single `forge` entry.

2. **Dead-letter auto-advance**. All sub-skills have `disable-model-invocation: true`, so `Skill(forge-build)` calls from `/forge` orchestration return `Unknown skill`. The auto-advance chain (build → review → test → ship) and `forge-loop §13` fresh-context dispatch both break silently.

3. **No dispatcher enforcement**. Without a chokepoint, tool access, topic validation, and audit logging are distributed across 29 SKILL.md files with no central verification.

PoC evidence (`.tinkerman/poc/single-entry-dispatch/RESULTS.md`) demonstrated that `Agent` tool + `lib/<sub>/instructions.md` achieves functional parity with the original `SKILL.md` + `context: fork` behavior across V1/V2/V3 test scenarios.

## Decision

Physically migrate all 29 `skills/forge-<sub>/SKILL.md` files to `skills/forge/lib/<sub>/instructions.md`. `forge` becomes the sole registered Claude Code skill. A 9-step dispatcher chokepoint (`src/forge-dispatcher.ts`) routes invocations through either `Agent` (fork) or `Read` (inline) mode per the R3.5 dispatch table:

- **Fork (18 subs)**: learn, decide, decide-teams, debug, grill, storm, recap, mutate, zoom-out, review, build, plan, spec, ship, test, loop, accept, pack
- **Inline (11 subs)**: build-light, router, status, resume, abort, verify, refactor, fix, fix-conflicts, control-cli, control-ui

`commands/forge.md` degraded to a ≤25-line thin stub that delegates to `Skill(forge)`.

10 mandatory security controls enforced at the dispatcher:

| Control | Requirement |
|---------|-------------|
| C1 | Topic allowlist — 29-sub allowlist, reject unknown (R2.1) |
| C2 | Path safety — dual-mode: `CLAUDE_PLUGIN_ROOT` or cwd-relative (R2.2) |
| C3 | Per-sub allowed-tools — default-deny, explicit allowlist per sub (R2.3) |
| C4 | Untrusted workspace fence — `<untrusted>` wrapper on all inline reads (R2.4) |
| C5 | Registry as derived index — `registry.toml` auto-generated from frontmatter (R2.5) |
| C6 | Lib integrity manifest — `manifest.json` with SHA-256 per instructions.md (R2.6) |
| C7 | Audit log out of workspace — `${CLAUDE_PLUGIN_DATA}/forge/audit/dispatch.log` (R2.7) |
| C8 | Worktree spike + pre-ship verification — shadow validation before merge (R2.8) |
| C9 | Bare `/forge` subcommand listing — dispatch without routing (R1.3) |
| C10 | `dispatcher_mode` feature flag — `collapsed` (default) / `legacy` (R2.10) |

## Alternatives Considered

- **B. Maintain status quo + doc rewrite**: Fixes documentation but leaves `Skill(forge-X) → Unknown skill` bug and `/` menu pollution intact. Rejected: active bugs remain unfixed.
- **C. Inline-only dispatch**: All subs execute via `Read` in main agent context. Loses fresh-context isolation for heavy subs (build, review, decide). Rejected: subagent isolation is a safety requirement.
- **D. Keep skills + remove `disable-model-invocation`**: Fixes dead-letter but allows AI to autonomously invoke any sub-skill without `/forge` routing. Rejected: removes orchestration control (tier routing, branch protection, auto-advance).

## Consequences

### Positive

- `/` menu clean: single `forge` entry, 29 subs routed via dispatcher
- Auto-advance chain and `forge-loop §13` fresh-context dispatch work correctly
- Security surface centralized at dispatcher chokepoint (audit log, integrity check, topic allowlist)
- `commands/forge.md` ≤25 lines — thin stub, all logic in `skills/forge/SKILL.md`
- Registry + manifest provide CI-verifiable integrity

### Negative

- v2.5 breaking change: `/forge-<sub>` slash commands no longer appear in `/` menu
- Dispatcher is a single point of failure (mitigated by CI gate + manifest hash verification)
- Worktree silent shadow verification deferred to ship phase (R2.8b)
- Migration requires updating 80+ test path hardcodes and 99 `src/skill-function-registry.ts` references

## Rollback

1. Set `dispatcher_mode = legacy` in `.tinkerman/config.md` — advisory mode, physical revert required for full rollback
2. `git revert` the migration commit chain (physical files restored to `skills/forge-<sub>/SKILL.md`)
3. Restore `commands/forge.md` full dispatcher content (backup in pre-migration commit)
4. Set ADR-0004 status to `superseded`, create ADR-0005 documenting rollback reason
