---
name: forge
updated: 2026-06-10
description: "Use when the user types /forge <subcommand> or /forge <task description>. Unified dispatcher entry point that routes to 36 sub-skills via lib instructions.md. Handles tier routing, branch protection, and phase auto-advance."
allowed-tools: Read, Agent, Glob, Grep, Bash, Skill
skeleton_exempt_legacy: true
---

# /forge — Unified Dispatcher Entry Point

! Current context: read `.forge/status.md` for active task, phase, and branch.

## 1. Overview

Forge's sole registered skill. All 36 sub-skills live under `skills/forge/lib/<sub>/instructions.md` and are dispatched through the 10-step chokepoint in `src/forge-dispatcher.ts`. Users invoke via `/forge <sub>` (direct) or `/forge <description>` (router-analyzed).

## 1.1 Phase Worker Runtime

Standard and Full workflows may isolate phase execution behind internal workers, but `/forge` remains the only user-facing entry. No manual new Claude Code window, context-mode command, worker command, or sync command is required during normal execution.

The runtime is artifact-first: detailed logs and reports go under `.forge/`, while workers return bounded summaries to the main conversation. Subagent workers cover review/research-style work; CLI/SDK workers use packaged scripts such as `scripts/forge-phase-worker.mjs` for phase-level isolation.

Runtime config drift is checked and repairable through the packaged `scripts/forge-sync-runtime.mjs` shim. Source mode points to project scripts; marketplace mode points to plugin-root scripts so the Claude Code marketplace package stays self-contained.

## 2. Subcommand Listing

### Light Tier
`build` `review`

### Standard Tier
`plan` `build` `review` `test` `ship`

### Full Tier
`decide` `spec` `plan` `build` `review` `test` `ship` `learn`

### Auxiliary
`debug` `loop` `status` `resume` `abort` `zoom-out` `recap` `replay` `grill` `storm` `mutate` `router` `verify` `accept` `refactor` `fix` `pack` `decide-teams` `charter` `build-light` `fix-conflicts` `init` `review-comment-bitbucket` `control-cli` `control-ui` `forge-cmux-browser-qa` `forge-cmux-loop-signals` `forge-cmux-sidebar-sync`

Tier is logical, not physical — a sub can appear in multiple tiers. Routing logic in `skills/forge/lib/router/instructions.md`.

## 3. Dispatch Chokepoint

Every `/forge <topic>` invocation follows this sequence (implemented in `src/forge-dispatcher.ts`,不可绕过):

1. **resolveDispatcherMode** — `.forge/config.md` `skills.dispatcher_mode` (default: `collapsed`)
2. **validateTopic** — 36-sub allowlist (R2.1)
3. **resolveLibPath** — `${CLAUDE_PLUGIN_ROOT} ?? cwd` dual-mode (R2.2)
4. **checkIntegrity** — `manifest.json` sha256 (R2.6)
5. **resolveAllowedTools** — lib frontmatter `allowed_tools` (R2.3)
6. **resolveDispatchMode** — `fork` or `inline` per R3.5 table
7. **wrapWorkspaceContext** — `<untrusted>` fence (R2.4)
8. **dispatch** — `Agent` (fork) or `Read` (inline)
9. **appendAuditLog** — `${CLAUDE_PLUGIN_DATA}/forge/audit/dispatch.log` (R2.7)

## 4. Fork vs Inline

Each sub's `dispatch_mode` is declared in `skills/forge/lib/<sub>/instructions.md` frontmatter. `registry.toml` is the derived index verified by CI.

- **fork** (19 subs): `Agent` tool spawns fresh subagent. For: learn, decide, decide-teams, debug, grill, storm, recap, mutate, zoom-out, review, build, plan, spec, ship, test, loop, accept, pack, charter.
- **inline** (17 subs): main agent `Read`s instructions then executes. For: build-light, router, status, resume, abort, replay, verify, refactor, fix, fix-conflicts, init, review-comment-bitbucket, control-cli, control-ui, forge-cmux-browser-qa, forge-cmux-loop-signals, forge-cmux-sidebar-sync.

Complete allocation: spec R3.5 table.

## 5. Tier Routing Reference

See `skills/forge/lib/router/instructions.md` for full routing logic. Summary:

| Condition | Command Sequence |
|-----------|-----------------|
| Light (≤1 file, ≤20 lines) | `build → review` |
| Standard (clear req or spec exists) | `plan → build → review → test → ship` |
| Full (new service / auth / unclear) | `decide → spec → plan → build → review → test → ship → learn` |

User override takes precedence. No tier-skipping within a sequence.

## 6. Flags

### `--no-gate`

Skips Reframing Gate (decide) and Clarification Gate (spec). Applicable to Standard tier only; Light tier already skips gates; Full tier ignores this flag (gates are mandatory).

Usage: `/forge decide --no-gate <topic>` or `/forge spec --no-gate <topic>`.

## 7. Configuration

`.forge/config.md` → `skills.dispatcher_mode`:

| Value | Behavior |
|-------|----------|
| `collapsed` (default) | Reads `skills/forge/lib/<sub>/instructions.md` |
| `legacy` | v2.4 compatibility (migration-period only) |

## 8. Audit Log

Every dispatch appends a tamper-evident HMAC-chained NDJSON entry to `${CLAUDE_PLUGIN_DATA}/forge/audit/dispatch.log` (outside workspace). See `src/forge-dispatcher/audit-log.ts`.

## 9. Related References

- ADR-0003 (skill registration model)
- ADR-0004 (skills collapse, this spec)
- Spec: `.kiro/specs/forge-single-entry-skills-collapse/spec.md` (locked)
- Plan: `.kiro/specs/forge-single-entry-skills-collapse/plan.md` (approved)
- Dispatcher source: `src/forge-dispatcher.ts`
