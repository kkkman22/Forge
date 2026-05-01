---
name: forge-loop
description: "自主执行引擎。以 Loop 模式驱动 Skills 完整命令序列，自动完成 router → plan → build → review → test → ship 全流程。"
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

1. Git repository check 2. Working tree clean (skip with `--worktree`/`--resume`) 3. `.forge/` exists (must when using preset options) 4. Active task detection in StatusFile 5. `--tier` value validation 6. hooks.json check (warn, don't block) 7. Worktree source branch check

### Step 2: Write Execution Mode

写入 StatusFile：`mode: "autonomous"`, `loop_run_id: <uuid>`, `loop_iteration: 0`, `skill_sequence: <tier命令序列>`。残留 `loop_run_id` → 清理后从当前 phase 继续。

### Step 3: Command Sequence

light: build→review · standard: plan→build→review→test→ship · full: +learn · refactor_light: refactor-apply→review · refactor_standard: refactor-scan→refactor-apply→review→test→ship · fix_light: fix-apply→review · fix_standard: fix-analyze→fix-apply→review→test→ship

### Step 4: Enter Iteration Loop

启动迭代循环，每轮迭代执行一个 SKILL 阶段。

---

## 4. Iteration Control Logic

### 4.1 Iteration Flow

每轮迭代按以下步骤执行：

1. Read StatusFile, determine current phase
2. Call SkillScheduler to determine next SKILL
3. Build SKILL-aware prompt
4. Execute corresponding SKILL (Agent invocation)
5. Evaluate quality gates (review/test/ship stages)
6. Commit / rollback decision
7. Update StatusFile (phase + iteration)
8. Check for completion or circuit breaker trigger

### 4.2 SKILL Scheduling State Machine

→ 完整状态转换见 `src/skill-scheduler.ts`。非显而易见的转换：
- review fail → build（fix loop）· ship + tier=full → learn · completed/aborted → terminal（幂等）· unknown → router（fallback）

### 4.3 Quality Gate Evaluation

Loop 在 review、test、ship 阶段完成后独立评估质量门禁，不依赖 Agent 自报结果：

| Stage | Gate | Evaluation |
|-------|------|------------|
| review | Review Gate | Parse review report `p0_count`/`p1_count`, blocked if either > 0 |
| test | Test Gate | Parse test result `failed` field or `result` field |
| ship | Ship Gate | Triple combination: Review + Test + Progress (any blocked → overall blocked) |

门禁结果：`passed`（继续）/ `blocked`（修复循环）/ `skipped`（无法解析，不阻断也不算通过）

### 4.4 Autonomous Mode Presets

| Confirmation Point | Preset |
|--------------------|--------|
| Router tier | `auto-detect` |
| Plan breakdown | `auto-approve` |
| Build light pause | `continue` |
| Review P0/P1 | `auto-fix` |
| Ship delivery | `keep branch`（不可逆操作不自动执行） |
| Refactor scan/design/apply | `auto-select-recommended` / `auto-approve` / `continue` |
| Fix report/analysis/verify | `auto-confirm` / `auto-recommend` / `auto-verify` |

---

## 5. Commit / Rollback Decisions

| SKILL Stage | On Success | On Failure | Commit Message Format |
|-------------|-----------|-----------|----------------------|
| plan | commit | no commit | `forge(plan): <objective> plan approved` |
| build | commit | rollback | `forge(build): <agent summary>` |
| fix / fix-apply | commit | rollback | `forge(fix): resolve P0/P1 from review` |
| refactor-apply | commit | rollback | `forge(refactor): apply refactoring changes` |
| review / test / ship / router / learn / refactor-scan / fix-analyze | no commit | no commit | — |

**Commit 失败处理**：如果 Git commit 操作失败，标记为 hard failure 并触发指数退避机制。

---

## 6. Fix Loop and Circuit Breaker Protection

### 6.1 Fix Loop

当 Review Gate 返回 `blocked`（存在 P0/P1 问题）时：

1. Increment `reviewFixAttempts` counter
2. Roll back `phase` to `build`
3. Inject P0/P1 issue details in next iteration
4. After fix, re-enter review
5. When Review Gate returns `passed`, reset counter to 0

### 6.2 Circuit Breaker Conditions

当 `reviewFixAttempts` 达到最大值（默认 3）且 review 仍为 `fail` 时，Loop 中止执行。

### 6.3 Other Abort Conditions

| Condition | Description |
|-----------|-------------|
| Agent consecutive failures reach threshold | Underlying state machine protection |
| Commit operation failed | Marked as hard failure, triggers backoff mechanism |
| Guarded zone violation | Immediately terminates loop, no backoff |
| User manual abort (`/forge abort`) | User-initiated termination |
| `--stop-when` condition met | Agent reports stop condition satisfied |
| `--max-iterations` / `--max-tokens` / `--max-budget-usd` limit reached | Resource limit |

---

## 7. Shutdown Sequence

**Normal**: 清除所有 Loop 字段，恢复 interactive 模式。**Circuit breaker**: 报告未解决问题 + `/forge resume` 恢复。**Error**: 清除 `mode`/`loop_run_id`/`loop_iteration`，**保留** `phase`/`skill_sequence`（便于 resume）。

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
