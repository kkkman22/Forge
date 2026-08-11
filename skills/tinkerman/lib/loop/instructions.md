---
description: "Use when user runs /tinkerman loop, wants unattended execution, or needs background completion of queued tasks"
updated: 2026-08-11

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
Status: !`head -8 .tinkerman/status.md 2>/dev/null || echo "no status"`
Last commit: !`git log --oneline -1 2>/dev/null || echo "no commits"`

# /tinkerman loop — Native Fusion Loop Engine

> **Trigger**: `/tinkerman loop "goal"` | `/tinkerman loop continue <id>` | `/tinkerman loop status` | `/tinkerman loop abort`
> **Purpose**: Drive Skills end-to-end autonomously, using native Claude Code scheduling (ScheduleWakeup / CronCreate) instead of external CLI scripts.
> **State**: `.tinkerman/loop-state.json` (created from `.tinkerman/templates/loop-state.json`)

---

## 1. Entry Routing

| Command | Action |
|---------|--------|
| `/tinkerman loop "goal" [options]` | Initialize new loop run |
| `/tinkerman loop continue <id>` | Resume existing run after wake-up |
| `/tinkerman loop status` | Display current loop state |
| `/tinkerman loop abort` | Halt active run, output summary |

## 2. Initialization (`/tinkerman loop "goal"`)

1. **Pre-flight**: git repo check · clean tree (skip with `--worktree`/`--resume`) · `.tinkerman/` exists · no active `loop_run_id` in status.md (warn + cleanup if found)
2. **Create state**: Copy `.tinkerman/templates/loop-state.json` → `.tinkerman/loop-state.json`. Fill: `id` (UUID), `goal` (user input), `createdAt` (ISO now), `tier` (from `--tier` or auto-detect), `commitNarrativePath` (`.tinkerman/runs/<id>/commit-narrative.md`)
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
1. Read .tinkerman/loop-state.json → current phase
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
3. Call the selected tool with prompt: `/tinkerman loop continue <id>`

**ScheduleWakeup** (preferred for short delays):
```
ScheduleWakeup({ delaySeconds: <delay>, prompt: "/tinkerman loop continue <id>" })
```

**CronCreate** (fallback for long delays):
```
CronCreate({ cron: "<interval>", prompt: "/tinkerman loop continue <id>", recurring: false })
```

On resume (`/tinkerman loop continue <id>`): read state → determine phase → re-enter §4.

## 6. Three-Strike Circuit Breaker

Uses `src/loop/three-strike.ts`:

| Step | Action |
|------|--------|
| Failure | `recordFailure(state)` → increment `consecutiveFailures` |
| Check | `shouldHalt(state)` → true when `consecutiveFailures ≥ 3` |
| Halt | Set `phase: "halted"`, `haltReason: computeHaltReason(...)` |
| Rollback | If `shouldRollback(state)` → **先签发 rollback nonce**(`node -e "require('./dist/src/destructive-nonce.js').issueRollbackNonce(process.cwd())"` 或等价),再 `git reset --hard <lastSuccessCommit>`。nonce 在 destructive-guard 放行后即焚(单次有效),确保回滚畅通且不可被伪造复用。 |
| Success | `recordSuccess(state, commitHash)` → reset to 0, update `lastSuccessCommit` |

On halt: output summary → stop. User can `/tinkerman loop continue <id>` after manual fix.

## 7. stopWhen Conditional Termination

Uses `src/loop/stopwhen.ts`:

| Condition | Format | Example |
|-----------|--------|---------|
| Max iterations | `max-iterations:N` | `--stop-when "max-iterations:20"` |
| Phase reached | `phase-reached:<phase>` | `--stop-when "phase-reached:ship"` |
| Commit count | `commit-count:N` | `--stop-when "commit-count:1"` |

Evaluate via `evaluateStopWhen(condition, state)` before each iteration.

## 7b. Events_NDJSON 事件流（cmux-integration R14）

Loop 的每次状态转换 SHALL 通过 `src/event-writer.ts` 的 `writeEvent()` 写入 `.tinkerman/runs/<run_id>/events.ndjson`（append-only NDJSON），供 Mirror_Daemon / `/tinkerman learn --from-runs` / `/tinkerman debug` 消费。

| 事件 | 触发点 | 必填字段 |
|------|--------|---------|
| `session_started` | Loop 启动时 | `objective`, `max_iterations`, `stop_when`, `worktree_mode` |
| `iter_started` | 每次迭代开始 | `iteration` (正整数) |
| `iter_committed` | commit 成功后 | `iteration`, `commit_sha`, `subject` |
| `iter_rolled_back` | three-strike rollback 后 | `iteration`, `reason` |
| `circuit_breaker_tripped` | consecutiveFailures ≥ 3 | `consecutive_failures` |
| `loop_terminated` | stopWhen 或中止 | `reason` (`natural`/`interrupted`/`error`), `total_iterations`, `total_commits` |

**实现**：`writeEvent({ ts: ISO, type, run_id, schema_version: 1, ...fields }, forgeRoot)`。写入是 best-effort（失败仅 warn，不阻断 loop）。`objective`/`subject`/`reason` 字段 SHALL 经 redaction（`src/secret-redactor.ts`）后再写入（R14.8）。

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
| **Completed** | Clear loop fields from status.md. Set `phase: "idle"`. Delete `.tinkerman/loop-state.json`. Output Mission Summary. |
| **Halted** (three-strike) | Keep state files for resume. Output failure summary. |
| **Aborted** (user) | Keep state files. Restore status.md to `phase: "idle"`. |
| **Error** | Keep `loop_run_id` + `phase` for resume. Clear other loop fields. |

**Mission Summary** (on any shutdown): total wall-clock · total iterations · phases completed · token budget used · known-failures matched.

**关键改动复述段**（理解腐烂对策，loop-engineering-adoption R3）：摘录 `.tinkerman/runs/<id>/commit-narrative.md` 的关键节（≤5 条），每条输出 `what` + `why` 两要素，控制在能让没参与的人 30 秒内理解。**WHEN 关键改动超过 5 条**，输出 `⚠️ 建议人工逐条复核——loop 产出了 N 个改动，请确认你仍理解每一处的意图`，提示用户对抗认知投降（论文 §07 第三笔代价）。commit-narrative.md 不存在（如手动 build 非 loop）则跳过本段。

## 11. Platform Compatibility

| Platform | Scheduling | Notes |
|----------|-----------|-------|
| Claude Code CLI | ScheduleWakeup / CronCreate | Full native support |
| Claude Code Desktop | ScheduleWakeup / CronCreate | Same as CLI |
| Claude.ai web | ScheduleWakeup only | No persistent cron; single-session only |

## 12. Edge Cases

- No `.tinkerman/` → `/tinkerman init`
- Active `loop_run_id` found → warn, cleanup, option to resume
- `--tier` invalid → error + list valid values
- Empty goal → reject
- Context exhaustion → write interim to `.tinkerman/knowledge/sessions/` → `/clear` + `/tinkerman loop continue <id>`

## Gotchas

- **Infinite loop**: Always set `max-iterations` or `stopWhen` for long tasks
- **Context rot**: Break loop every ~100k tokens; resume with fresh context
- **State drift**: Re-read loop-state.json before each decision, never cache in memory
- **Orphan cron**: On abort, call `CronList` + `CronDelete` for any pending jobs

## Package Iteration

When `/tinkerman loop` runs with `execution_packages`, each loop iteration targets at most one package. Use `advanceLoopAfterPhaseSuccess({ loopState, statusContent, executionPackages, reviewResult })` after each successful phase to update `.tinkerman/loop-state.json`, `.tinkerman/status.md`, and the next `/tinkerman` args (`build --package <id>`, `review --package <id>`, `test --package <id>`, then feature-scoped `ship`). The loop MUST NOT depend on legacy `forge-loop-cli` or `persistent-loop.sh` as the primary orchestrator.
