---
topic: "subagent-hook-context-budget"
status: "approved"
date: "2026-05-16"
spec_ref: ".kiro/specs/subagent-hook-context-budget"
format: "full"
---

# Plan: Subagent Hook Context Budget Bugfix

> 来源: `.kiro/specs/subagent-hook-context-budget/tasks.md`

## Objective

Fix `/forge review` subagent truncation caused by unbounded hook injection. Subagents (spec-check / quality-check / security-check) receive full hook payloads at SessionStart and UserPromptSubmit, exhausting their `maxTurns: 6` budget before completing.

## Root Cause

Hook commands don't detect subagent callers via stdin JSON `agent_id` field. Three injection sources compound: SessionStart `cat evolved-rules.md` (×3 config files), UserPromptSubmit `head/tail` (settings.json residual), and inject-plan-context.mjs + cmux-mirror sync-once.mjs.

## Strategy (Bug Condition Method)

- **C(X)**: stdin JSON contains `agent_id` → short-circuit, zero injection
- **¬C(X)**: no `agent_id` → main agent path unchanged (only add 4KB cap to SessionStart evolved-rules)
- **Fail-safe**: any parsing error/timeout → treat as subagent → zero injection

## File Mapping

| File Path | Operation | Description |
|-----------|-----------|-------------|
| `scripts/lib/hook-stdin-router.mjs` | CREATE | stdin-based caller classifier (classifyHookCaller, shouldSkipForSubagent) |
| `scripts/inject-evolved-rules.mjs` | CREATE | Capped (4KB) SessionStart injector with router short-circuit |
| `scripts/inject-plan-context.mjs` | MODIFY | Add router short-circuit at entry |
| `scripts/cmux-mirror/sync-once.mjs` | MODIFY | Add router short-circuit at CLI entry |
| `.claude/settings.json` | MODIFY | Delete UserPromptSubmit head/tail segment; rewrite SessionStart to inject-evolved-rules.mjs |
| `.claude-plugin/plugin.json` | MODIFY | Rewrite SessionStart to inject-evolved-rules.mjs |
| `hooks/hooks.json` | MODIFY | Rewrite SessionStart to inject-evolved-rules.mjs |
| `test/hook-stdin-router.test.ts` | CREATE | Router unit tests (6 payload classes) |
| `test/hook-stdin-router.property.test.ts` | CREATE | Router PBT (fail-safe totality) |
| `test/inject-plan-context.test.ts` | MODIFY | Add subagent zero-injection + main byte-equal tests |
| `test/cmux-sync-once.subagent-skip.test.ts` | CREATE | cmux subagent skip test |
| `test/inject-evolved-rules.test.ts` | CREATE | Capped injector unit tests |
| `test/hooks-config-integrity.property.test.ts` | CREATE | PBT: forbid unbounded head/tail/cat patterns |
| `test/non-frozen-hook-preservation.property.test.ts` | MODIFY | Migrate SessionStart baseline to inject-evolved-rules.mjs |

## Tasks

### Step 1 — Router + Script Entry Short-Circuits (9 tasks, pure additive)

1. RED: Router unit tests (6 payload classes) [P1,P2,P3]
2. GREEN: Implement `scripts/lib/hook-stdin-router.mjs` [P1,P3]
3. RED: Router PBT (fail-safe totality) [P1,P3]
4. GREEN: Harden router if PBT exposes issues [P1,P3]
5. RED: Extend inject-plan-context.test.ts (subagent zero + main byte-equal) [P1,P2]
6. GREEN: Add router short-circuit to inject-plan-context.mjs [P1,P2,P3]
7. RED: cmux sync-once subagent skip test [P1,P2]
8. GREEN: Add router short-circuit to sync-once.mjs CLI entry [P1,P2,P3]
9. Step 1 Verify Checkpoint [all]

### Step 2 — settings.json Cleanup + Capped Injector (6 tasks)

10. RED: inject-evolved-rules.mjs unit tests [P1,P2]
11. GREEN: Create `scripts/inject-evolved-rules.mjs` [P1,P2]
12. RED: hooks-config-integrity PBT [P4]
13. GREEN: Delete settings.json UserPromptSubmit head/tail [P4]
14. GREEN: Rewrite settings.json SessionStart to capped injector [P1,P2]
15. Step 2 Verify Checkpoint [all]

### Step 3 — plugin.json + hooks.json Migration + Dogfood (5 tasks)

16. GREEN: Rewrite plugin.json SessionStart [P1,P2]
17. GREEN: Rewrite hooks.json SessionStart [P1,P2]
18. RED→GREEN: Migrate non-frozen-hook-preservation baseline [P2,P4]
19. Step 3 Verify Checkpoint (full test suite) [all]
20. Dogfood smoke: `/forge review` with loaded fixtures [P1]

## Rollout

Each step is an independent PR, independently rollbackable. Step 1 is pure additive (no behavior change for main agent). Step 2 cleans settings.json. Step 3 migrates plugin.json + hooks.json.
