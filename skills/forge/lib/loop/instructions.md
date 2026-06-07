---
description: "Use when user runs /forge loop, wants unattended execution, or needs background completion of queued tasks"

dispatch_mode: fork
allowed_tools:
  - Read
  - Bash
  - Glob
  - Grep
  - Skill
  - Agent
  - ScheduleWakeup
  - CronCreate
  - CronDelete
  - CronList
---

## Current Context

Branch: !`git branch --show-current`
Status: !`head -8 .forge/status.md 2>/dev/null || echo "no status"`
Last commit: !`git log --oneline -1 2>/dev/null || echo "no commits"`

# /forge loop — Native Fusion Loop Engine

> **Trigger**: `/forge loop "goal"` | `/forge loop continue <id>` | `/forge loop status` | `/forge loop abort`
> **Purpose**: Drive Skills end-to-end autonomously, using native Claude Code scheduling (ScheduleWakeup / CronCreate) instead of external CLI scripts.
> **State**: `.forge/loop-state.json` (created from `.forge/templates/loop-state.json`)

---

## 1. Entry Routing

| Command | Action |
|---------|--------|
| `/forge loop "goal" [options]` | Initialize new loop run |
| `/forge loop continue <id>` | Resume existing run after wake-up |
| `/forge loop status` | Display current loop state |
| `/forge loop abort` | Halt active run, output summary |

## 2. Initialization (`/forge loop "goal"`)

1. **Pre-flight**: git repo check · clean tree (skip with `--worktree`/`--resume`) · `.forge/` exists · no active `loop_run_id` in status.md (warn + cleanup if found)
2. **Create state**: Copy `.forge/templates/loop-state.json` → `.forge/loop-state.json`. Fill: `id` (UUID), `goal` (user input), `createdAt` (ISO now), `tier` (from `--tier` or auto-detect)
3. **Branch**: Create `forge/loop-<slug>` from current branch (or reuse with `--resume`)
4. **Update status.md**: Set `mode: "autonomous"`, `loop_run_id: <id>`, `phase: "build"`
5. **Enter iteration loop** (§4)

## 3. Tier Command Sequences

| Tier | Sequence |
|------|----------|
| **light** | `build → review → completed` |
| **standard** | `plan → build → review → test → ship → completed` |
| **full** | `plan → build → review → test → ship → learn → completed` |

Phase transitions are deterministic — see `src/loop/phase-transitions.ts` (`getNextPhase`) and `src/loop/package-runtime.ts` (`advanceLoopAfterPhaseSuccess`) for execution package state.

## 4. Iteration Decision Loop

Each iteration follows this 8-step cycle:

```
1. Read .forge/loop-state.json → current phase
2. Evaluate stopWhen (§7) → if true, halt
3. Call Skill(skill="forge", args="<phase>") via fresh-context subsession
4. Parse result: success / failure / blocked
5. On success: recordSuccess from three-strike module → commit
6. On failure: recordFailure → check shouldHalt (§6)
7. Compute next phase via `advanceLoopAfterPhaseSuccess` when `execution_packages` exist; otherwise use phase-transitions module
8. Schedule next iteration (§5) → update state → loop
```

**Fresh-context discipline**: Each Skill call starts a new context. State passes through files only (status.md, loop-state.json, progress/*.md). Never rely on conversation history.

## 5. Scheduling

Use `src/loop/scheduling-strategy.ts` to decide how to schedule the next iteration:

1. `computeDelay(tier, consecutiveFailures)` → delay in seconds
2. `selectScheduler(delay)` → `ScheduleWakeup` (≤300s, cache-warm) or `CronCreate` (>300s, cache-cold)
3. Call the selected tool with prompt: `/forge loop continue <id>`

**ScheduleWakeup** (preferred for short delays):
```
ScheduleWakeup({ delaySeconds: <delay>, prompt: "/forge loop continue <id>" })
```

**CronCreate** (fallback for long delays):
```
CronCreate({ cron: "<interval>", prompt: "/forge loop continue <id>", recurring: false })
```

On resume (`/forge loop continue <id>`): read state → determine phase → re-enter §4.

## 6. Three-Strike Circuit Breaker

Uses `src/loop/three-strike.ts`:

| Step | Action |
|------|--------|
| Failure | `recordFailure(state)` → increment `consecutiveFailures` |
| Check | `shouldHalt(state)` → true when `consecutiveFailures ≥ 3` |
| Halt | Set `phase: "halted"`, `haltReason: computeHaltReason(...)` |
| Rollback | If `shouldRollback(state)` → `git reset --hard <lastSuccessCommit>` |
| Success | `recordSuccess(state, commitHash)` → reset to 0, update `lastSuccessCommit` |

On halt: output summary → stop. User can `/forge loop continue <id>` after manual fix.

## 7. stopWhen Conditional Termination

Uses `src/loop/stopwhen.ts`:

| Condition | Format | Example |
|-----------|--------|---------|
| Max iterations | `max-iterations:N` | `--stop-when "max-iterations:20"` |
| Phase reached | `phase-reached:<phase>` | `--stop-when "phase-reached:ship"` |
| Commit count | `commit-count:N` | `--stop-when "commit-count:1"` |

Evaluate via `evaluateStopWhen(condition, state)` before each iteration.

## 8. Autonomous Mode Presets

All confirmation points use presets — no human prompts:

| Decision Point | Preset |
|---------------|--------|
| Router tier | `auto-detect` |
| Plan approval | `auto-approve` |
| Review P0/P1 | `auto-fix` (rollback to build) |
| Ship delivery | `keep branch` |

## 9. Commit / Rollback

| Phase | On Success | On Failure |
|-------|-----------|-----------|
| plan | commit | no commit |
| build | commit + update lastSuccessCommit | rollback to lastSuccessCommit |
| review/test | no commit | no commit |
| ship | no commit | no commit |

Commit format: `forge(<phase>): <summary>`

## 10. Shutdown

| Outcome | Cleanup |
|---------|---------|
| **Completed** | Clear loop fields from status.md. Set `phase: "idle"`. Delete `.forge/loop-state.json`. Output Mission Summary. |
| **Halted** (three-strike) | Keep state files for resume. Output failure summary. |
| **Aborted** (user) | Keep state files. Restore status.md to `phase: "idle"`. |
| **Error** | Keep `loop_run_id` + `phase` for resume. Clear other loop fields. |

**Mission Summary** (on any shutdown): total wall-clock · total iterations · phases completed · token budget used · known-failures matched.

## 11. Platform Compatibility

| Platform | Scheduling | Notes |
|----------|-----------|-------|
| Claude Code CLI | ScheduleWakeup / CronCreate | Full native support |
| Claude Code Desktop | ScheduleWakeup / CronCreate | Same as CLI |
| Claude.ai web | ScheduleWakeup only | No persistent cron; single-session only |

## 12. Edge Cases

- No `.forge/` → `/forge init`
- Active `loop_run_id` found → warn, cleanup, option to resume
- `--tier` invalid → error + list valid values
- Empty goal → reject
- Context exhaustion → write interim to `.forge/knowledge/sessions/` → `/clear` + `/forge loop continue <id>`

## Gotchas

- **Infinite loop**: Always set `max-iterations` or `stopWhen` for long tasks
- **Context rot**: Break loop every ~100k tokens; resume with fresh context
- **State drift**: Re-read loop-state.json before each decision, never cache in memory
- **Orphan cron**: On abort, call `CronList` + `CronDelete` for any pending jobs

## Package Iteration

When `/forge loop` runs with `execution_packages`, each loop iteration targets at most one package. Use `advanceLoopAfterPhaseSuccess({ loopState, statusContent, executionPackages, reviewResult })` after each successful phase to update `.forge/loop-state.json`, `.forge/status.md`, and the next `/forge` args (`build --package <id>`, `review --package <id>`, `test --package <id>`, then feature-scoped `ship`). The loop MUST NOT depend on legacy `forge-loop-cli` or `persistent-loop.sh` as the primary orchestrator.
