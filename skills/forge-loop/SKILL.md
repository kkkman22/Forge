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

## 2. Trigger

### Basic Usage

```
/forge loop "为用户 API 添加分页功能"
```

### CLI Options

| Option | Description | Values / Type |
|--------|-------------|---------------|
| `--tier` | Preset routing tier, skip route analysis | `light` / `standard` / `full` |
| `--type` | Preset task type | `frontend` / `backend` / `fullstack` / `data` / `infra` / `docs` |
| `--phase` | Preset project phase | `greenfield` / `iteration` / `refactor` / `bugfix` |
| `--nature` | Preset work nature | `feature` / `refactor` / `bugfix` |
| `--max-iterations <n>` | Maximum iteration count | positive integer |
| `--max-tokens <n>` | Cumulative token limit | positive integer |
| `--max-budget-usd <amount>` | Maximum USD budget | float |
| `--stop-when <condition>` | Natural language stop condition | string |
| `--worktree` | Run in isolated Git worktree | boolean flag |
| `--resume <branchName>` | Resume run on existing branch | branch name |
| `--prevent-sleep <on\|off>` | Control system sleep prevention | `on` (default) / `off` |
| `--pua` | Enable PUA quality engine | boolean flag |
| `--pua-task-type <type>` | PUA task type | `debug` / `build` / `research` / `architecture` / `performance` / `review` / `deploy` / `general` |

**`--tier` 验证**：仅接受 `light`、`standard`、`full`。无效值会输出有效选项列表并拒绝启动。

**未指定 `--tier` 时**，Loop 在第一轮迭代中执行路由分析（调用 forge-router）以确定档位。

---

## 3. Startup Sequence

### Step 1: Pre-flight Checks

1. **Git repository check**: Verify current directory is a Git repository.
2. **Working tree cleanliness check**: Verify no uncommitted changes (skipped when using `--worktree` or `--resume`).
3. **`.forge/` directory check**: If missing, prompt `forge init`. Must exist when using `--tier`/`--type`/`--phase`/`--nature` options.
4. **StatusFile active task detection**: If `.forge/status.md` has `phase` other than `completed`/`aborted`, output warning. In multi-task mode, call `listActiveTasks` to display active task list.
5. **`--tier` value validation**: Invalid values output valid option list and reject startup.
6. **hooks.json check**: Check if `hooks/hooks.json` exists and contains `PreToolUse` configuration. Output warning on missing but do not block startup.
7. **Worktree source branch check**: When using `--worktree`, confirm not currently on a `forge/` branch.

### Step 2: Write Execution Mode

**单任务模式**：在 `.forge/status.md` 中写入自主模式标记。

**多任务模式**：调用 `writeTaskStatus(io, forgeRoot, taskName, content)` 写入 `.forge/status/<task-id>.md`。Loop 字段（`mode`、`loop_run_id`、`loop_iteration`、`skill_sequence`）写入当前任务的 StatusFile，不影响其他任务。

```yaml
---
current_task: "为用户 API 添加分页功能"
mode: "autonomous"
loop_run_id: "<uuid>"
loop_iteration: 0
skill_sequence: "plan,build,review,test,ship"
updated: "YYYY-MM-DD HH:mm"
---
```

| Field | Description |
|-------|-------------|
| `mode` | Set to `"autonomous"`, instructs all Skills to skip human confirmation points |
| `loop_run_id` | Unique identifier for this Loop run, used for state tracking |
| `loop_iteration` | Current iteration number, starts from 0 |
| `skill_sequence` | Command sequence determined by tier (comma-separated) |

**残留状态处理**：如果检测到上次异常退出残留的 `loop_run_id`，先清理残留字段，再写入新的 Loop 状态，从当前 `phase` 继续执行。

### Step 3: Determine Command Sequence

| Tier | Command Sequence |
|------|-----------------|
| light | build → review |
| standard | plan → build → review → test → ship |
| full | plan → build → review → test → ship → learn |
| refactor_light | refactor-apply → review |
| refactor_standard | refactor-scan → refactor-apply → review → test → ship |
| fix_light | fix-apply → review |
| fix_standard | fix-analyze → fix-apply → review → test → ship |

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

| Current Phase | Condition | Next Phase |
|--------------|-----------|------------|
| missing/router | — | router |
| plan | status ≠ approved | plan |
| plan | status = approved | build |
| build | has unfinished tasks | build |
| build | all tasks complete | review |
| review | result = fail | build (fix loop) |
| review | result = pass | test |
| test | tests passed | ship |
| ship | tier = full | learn |
| ship | tier ≠ full | completed |
| refactor-scan | — | refactor-apply |
| refactor-apply | all tasks complete | review |
| fix-analyze | — | fix-apply |
| fix-apply | all tasks complete | review |
| completed / aborted | — | terminal (idempotent) |
| unknown value | — | router (fallback) |

### 4.3 Quality Gate Evaluation

Loop 在 review、test、ship 阶段完成后独立评估质量门禁，不依赖 Agent 自报结果：

| Stage | Gate | Evaluation |
|-------|------|------------|
| review | Review Gate | Parse review report `p0_count`/`p1_count`, blocked if either > 0 |
| test | Test Gate | Parse test result `failed` field or `result` field |
| ship | Ship Gate | Triple combination: Review + Test + Progress (any blocked → overall blocked) |

门禁结果：`passed`（继续）/ `blocked`（修复循环）/ `skipped`（无法解析，不阻断也不算通过）

### 4.4 Confirmation Point Preset Strategy in Autonomous Mode

所有 Skills 中的人工确认点在 `mode: autonomous` 下自动采用预设策略：

| Confirmation Point | Preset Strategy |
|--------------------|-----------------|
| Router tier confirmation | `auto-detect` |
| Plan task breakdown confirmation | `auto-approve` |
| Build light path pause confirmation | `continue` |
| Review P0/P1 handling decision | `auto-fix` |
| Ship delivery method selection | `keep branch` (autonomous mode must not auto-execute irreversible operations) |
| Refactor scan selection / design review / apply steps | `auto-select-recommended` / `auto-approve` / `continue` |
| Fix report confirmation / analysis confirmation / apply verification | `auto-confirm` / `auto-recommend` / `auto-verify` |

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

### 7.1 Normal Completion

清除 StatusFile 中所有 Loop 相关字段，恢复为默认 interactive 模式：

```
✅ Loop completed
Objective: 为用户 API 添加分页功能
Tier: standard
Iterations: 12
Phases:
  ✅ plan  ✅ build  ✅ review  ✅ test  ✅ ship
Branch: forge/user-api-pagination
```

### 7.2 Circuit Breaker Abort

```
⛔ Loop aborted (circuit breaker)
Fix attempts exhausted: 3/3
Unresolved issues:
  P0: 硬编码数据库密码
Recovery: /forge resume
```

### 7.3 Error Abort

清除 `mode`、`loop_run_id`、`loop_iteration` 字段，**保留** `phase` 和 `skill_sequence`（便于 `/forge resume` 恢复）。

---

## 8. Reuse Existing Skills

Loop 不重新实现任何 SKILL 逻辑，而是驱动现有 Skills 的完整执行：

| Iteration Stage | Invoked SKILL |
|----------------|---------------|
| Route analysis | `/forge` (forge-router) |
| Planning | `/forge plan` (forge-plan) |
| Build | `/forge build` (forge-build) |
| Review | `/forge review` (forge-review) |
| Test | `/forge test` (forge-test) |
| Ship | `/forge ship` (forge-ship) |
| Learn | `/forge learn` (forge-learn) |
| Refactor scan/apply | `/forge refactor` (forge-refactor) |
| Fix analyze/apply | `/forge fix` (forge-fix) |

**每个 SKILL 在执行时读取 `mode: autonomous`，自动跳过确认点。**

---

## 9. Distribution Package Environment Notes

在分发包环境下（无 Agent SDK），`/forge loop` 以 SKILL 内置的迭代控制逻辑替代 SDK 驱动的循环：

| Capability | SDK Environment (CLI) | Distribution Package (SKILL) |
|------------|----------------------|------------------------------|
| Iteration driver | Agent SDK loop | SKILL built-in state machine, advances within single session |
| State management | SdkDriver + StatusFile | StatusFile (same format) |
| Quality gates | `quality-gate.ts` pure functions | Same gate logic, Agent invokes during iteration |
| Git transactions | `effect-executor.ts` (with guarded zone checks) | Agent directly executes Git commands |
| Circuit breaker | Orchestrator state machine + SkillScheduler | Agent reads `reviewFixAttempts` counter |

---

## 10. Status File Format

Loop 运行期间，`.forge/status.md` 的完整格式：

```yaml
---
current_task: "为用户 API 添加分页功能"
tier: "standard"
task_type: "backend"
project_phase: "iteration"
phase: "build"
hints: "api-contract-check,backward-compat"
mode: "autonomous"
loop_run_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
loop_iteration: 5
skill_sequence: "plan,build,review,test,ship"
updated: "2025-01-15 14:30"
---
```

### Loop Field Lifecycle

| Field | Written When | Cleared When |
|-------|-------------|--------------|
| `mode` | Loop startup | Loop end (normal/error) |
| `loop_run_id` | Loop startup | Loop end (normal/error) |
| `loop_iteration` | Loop startup (=0), updated after each iteration | Loop end (normal/error) |
| `skill_sequence` | Loop startup | Cleared on normal completion; retained on error exit (for resume) |
| `phase` | After routing complete, updated after each iteration | Set to `completed` on normal completion; retained on error exit |

---

## 11. Edge Case Handling

| Condition | Output |
|-----------|--------|
| No `.forge/` directory | ⚠️ 未检测到 .forge/ 目录。请先运行 forge init |
| Existing active task | Warning: StatusFile has an active task in phase "<phase>". Starting may overwrite |
| Loop restart after error exit | Detect residual `loop_run_id` → cleanup → rewrite → continue from current `phase` |
| Empty objective description | CLI `<objective>` is a required parameter, Commander auto-rejects |
| Unsupported `--tier` value | Error: Invalid --tier value "medium". Valid options: light, standard, full |
| hooks.json missing | hooks protection missing: hooks/hooks.json not found（警告不阻断） |
| Invalid worktree source branch | Error: Cannot create a worktree from a forge/ branch |
| Resume branch does not exist | Error: Branch "<branchName>" does not exist |

---

## 12. Examples

### Example: Standard Path Autonomous Execution

```
$ /forge loop "为用户 API 添加分页功能"

🚀 启动自主执行模式

目标：为用户 API 添加分页功能
模式：autonomous

━━━ 迭代 1：路由分析 ━━━
  档位：standard
  命令序列：plan → build → review → test → ship

━━━ 迭代 2：规划 ━━━
  生成 5 个原子任务，Plan 自动批准 ✅

━━━ 迭代 3-7：执行 ━━━
  Task 1-5 逐一完成并 commit ✅

━━━ 迭代 8：评审 ━━━
  结果：通过（0 P0, 0 P1, 1 P2）

━━━ 迭代 9：测试 ━━━
  42/42 测试通过 ✅

━━━ 迭代 10：交付 ━━━
  交付方式：保留分支（autonomous 预设）

✅ Loop completed
  Objective: 为用户 API 添加分页功能
  Tier: standard
  Iterations: 10
```

**Other Scenario Variants**:
- **Completion after fix loop**: Review Gate blocked → fix P1 → re-review passed → continue subsequent stages
- **Circuit breaker abort**: Fix loop fails 3 times → ⛔ Loop aborted (circuit breaker) → Recovery: /forge resume
- **Worktree isolation**: `--worktree` runs in isolated worktree, does not affect main working tree
- **Resume interrupted run**: `--resume forge/api-pagination` continues from interruption point on specified branch
