---
name: forge-loop
description: "Orchestrate an approved plan end-to-end without interactive prompts across all queued tasks. Use when user runs `/forge loop`, wants unattended execution of an approved plan, or needs background completion of queued tasks."
skeleton_exempt_legacy: true
disable-model-invocation: true
---

# /forge loop — 自主执行引擎

> **触发方式**：用户输入 `/forge loop "目标描述"`
> **职责**：以自主模式驱动 Skills 完整命令序列，自动跳过所有人工确认点，按迭代推进直到目标完成或触发熔断
> **输出路径**：项目代码变更 + `.forge/status.md`（执行状态）+ `.forge/progress/<topic>.md`（进度）

---

## 1. Overview

`/forge loop` 是 Forge 工作流的自主执行模式——把一个目标描述交给它，它会自动驱动整个 Skills 命令序列（router → plan → build → review → test → ship），无需人工介入。每轮迭代对应一个 SKILL 阶段的执行，通过状态文件跟踪进度，通过质量门禁保障质量，通过熔断器防止无限循环。

**核心原则**：Loop 驱动 Skills，Skills 保障质量。自主模式不降低质量标准——所有门禁、TDD 铁律、评审流程照常执行，只是跳过人工确认点，用预设策略自动决策。

**与 `forge-loop` CLI 的关系**：`/forge loop` 是分发包环境下的入口，以 SKILL 内置的迭代控制逻辑驱动执行。`forge-loop` CLI 是 SDK 环境下的入口，通过 Agent SDK 启动独立会话驱动执行。两者共享相同的状态文件格式、质量门禁和命令序列，只是驱动方式不同。

---

**Not For**：
- 需求不明确需要人工讨论的任务
- 涉及不可逆操作需要人工确认的场景

## 2. Trigger

### Basic Usage

```
/forge loop "为用户 API 添加分页功能"
```

### CLI Options

| Option | Description | Values |
|--------|-------------|--------|
| `--tier` | Preset routing tier | `light` / `standard` / `full` |
| `--type` | Task type | `frontend` / `backend` / `fullstack` / `data` / `infra` / `docs` |
| `--phase` | Project phase | `greenfield` / `iteration` / `refactor` / `bugfix` |
| `--nature` | Work nature | `feature` / `refactor` / `bugfix` |
| `--max-iterations` | Max iteration count | positive integer |
| `--max-tokens` | Token limit | positive integer |
| `--max-budget-usd` | USD budget | float |
| `--stop-when` | Stop condition (natural language) | string |
| `--worktree` | Isolated Git worktree | flag |
| `--resume` | Resume on existing branch | branch name |
| `--prevent-sleep` | System sleep control | `on` / `off` |
| `--pua` | PUA quality engine | flag |
| `--pua-task-type` | PUA task type | `debug`/`build`/`research`/`architecture`/`performance`/`review`/`deploy`/`general` |

`--tier` 仅接受 light/standard/full。未指定时第一轮执行路由分析。

---

## 3. Startup Sequence

### Step 1: Pre-flight Checks

1. Git repository check 2. Working tree clean (skip with `--worktree`/`--resume`) 3. `.forge/` exists (must when using preset options) 4. Active task detection via `listActiveTasks` 5. `--tier` value validation 6. hooks.json check (warn, don't block) 7. Worktree source branch check

### Step 2: Write Execution Mode

调用 `writeTaskStatus` 写入 StatusFile：`mode: "autonomous"`, `loop_run_id: <uuid>`, `loop_iteration: 0`, `skill_sequence: <tier命令序列>`。残留 `loop_run_id` → 清理后从当前 phase 继续。

### Step 3: Command Sequence

light: build→review · standard: plan→build→review→test→ship · full: +learn · refactor_light: refactor-apply→review · refactor_standard: refactor-scan→refactor-apply→review→test→ship · fix_light: fix-apply→review · fix_standard: fix-analyze→fix-apply→review→test→ship

### Step 4: Enter Iteration Loop

启动迭代循环，每轮迭代执行一个 SKILL 阶段。

---

## 4. Iteration Control Logic

8 步迭代流程、SKILL 调度状态机、质量门禁评估、自主模式预设：

→ 详见 references/iteration-control.md

## 5-7. Commit/Rollback · Fix Loop · Shutdown

提交/回滚决策表、修复循环与熔断器、关机序列：

→ 详见 references/iteration-control.md §5-§7

---

## 8. Reuse Existing Skills

Loop 驱动现有 Skills 执行，不重新实现：router→plan→build→review→test→ship→learn→refactor→fix。每个 SKILL 读取 `mode: autonomous` 自动跳过确认点。

---

## 9. Distribution Package Environment

分发包（无 Agent SDK）以 SKILL 内置状态机替代 SDK 循环。共享状态文件格式、质量门禁和命令序列。差异：SDK 用 `effect-executor.ts` 做 Git 事务，分发包由 Agent 直接执行。

---

## 10. Status File Format

Loop 字段（写入 §3 Step 2）：`mode`, `loop_run_id`, `loop_iteration`, `skill_sequence`。正常结束全清除；Error 保留 `phase`/`skill_sequence` 用于 resume。

## Common Rationalizations

| 合理化 | 反驳 |
|--------|------|
| "手动更可控" | 明确需求下，门禁保障相同但效率更高 |
| "会跳过重要检查" | 质量标准不变，只跳过人工确认点 |
| "出问题不好排查" | 每轮 commit/rollback + 熔断器 + 完整状态轨迹 |

---

## 11. Edge Cases

无 `.forge/` → forge init · Active task → warn · Residual `loop_run_id` → cleanup + continue · Empty objective → auto-reject · Invalid `--tier` → error + valid list · No hooks.json → warn · Invalid worktree branch → error · Resume branch missing → error

---

## 12. Examples

```
$ /forge loop "为用户 API 添加分页功能"
🚀 目标：为用户 API 添加分页功能 | 模式：autonomous
━━━ 迭代 1：路由 → standard ━━━
━━━ 迭代 2：规划 → 5 原子任务 ✅ ━━━
━━━ 迭代 3-7：构建 → Task 1-5 逐一 commit ✅ ━━━
━━━ 迭代 8：评审 → 通过 (0 P0, 0 P1) ━━━
━━━ 迭代 9：测试 → 42/42 ✅ ━━━
━━━ 迭代 10：交付 → keep branch ━━━
✅ Loop completed (10 iterations)
```

**Variants**: Fix loop: review blocked → fix → re-review pass · Circuit breaker: 3 fails → abort → /forge resume · Worktree: `--worktree` 隔离 · Resume: `--resume <branch>` 继续

## Gotchas
- **Infinite loop**: Task never completes → loop runs forever → set max iterations, stop on repeated failures
- **State drift**: Long loop session → .forge/ files diverge from git reality → periodic state reconciliation every N iterations
- **Context rot**: Loop runs 300k+ tokens → degraded intelligence → break loop, /clear, resume with fresh context
- **Persistent loop orphan**: Session ends but persistent loop script keeps running → zombie processes → cleanup on SessionStart

## 13. Fresh-Context Subsession Discipline（R4 — Mission-grade Loop）

forge-loop 调度下一个 SKILL 阶段时，**必须**通过 `Skill(skill="forge", args="<phase>")` 触发新 fresh-context 子会话。**禁止**在同一会话内串联多个 SKILL 实例。

**理由**：每次 SKILL 调用都从状态文件读取上下文，避免单一会话因长度膨胀超时。Factory Missions 实战验证：单 agent run 短（实现 51 turns / 验证 30 turns），靠 fresh-context 重启撑长周期。

**状态文件白名单**（交接仅通过这些文件）：
- `.forge/status.md`
- `.forge/specs/<topic>/spec.md`
- `.forge/plans/<topic>.md`
- `.forge/progress/<topic>.md`
- `.forge/findings/<topic>.md`
- `.forge/knowledge/known-failures.md`
- `.forge/runs/<run-id>/events.ndjson`

**禁止依赖**：上一阶段会话的对话历史、agent 的"记忆"、任何不在白名单中的内存变量。

**events.ndjson 增强字段**：phase_start / phase_end 事件必须包含 `session_id`、`wall_clock_elapsed_seconds`、`token_budget_used`。phase_end 额外含 `exit_code`。完整 schema 范例：

```json
{"type":"phase_start","ts":"2026-05-16T10:00:00Z","phase":"build",
 "iteration":3,"session_id":"<uuid>","wall_clock_elapsed_seconds":1234,
 "token_budget_used":234500}

{"type":"phase_end","ts":"2026-05-16T10:42:31Z","phase":"build",
 "iteration":3,"session_id":"<uuid>","exit_code":0,
 "wall_clock_elapsed_seconds":3785,"token_budget_used":456789}
```

> **文档定位说明**：此章节承担 design.md 中"Section 9 events.ndjson schema"的全部职责。原 §9 名 `Distribution Package Environment` 保留不动；本 §13 是 R4 完整入口（fresh-context discipline + events schema + Mission Summary）。

**Mission Summary（关机序列增量）**：forge-loop 正常或异常结束时输出：
- Total wall-clock
- Total skill invocations
- Total iterations
- Token budget used
- Milestones completed
- Known-failures matched / new
