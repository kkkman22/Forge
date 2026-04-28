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

## 1. 概述

`/forge loop` 是 Forge 工作流的自主执行模式——把一个目标描述交给它，它会自动驱动整个 Skills 命令序列（router → plan → build → review → test → ship），无需人工介入。每轮迭代对应一个 SKILL 阶段的执行，通过状态文件跟踪进度，通过质量门禁保障质量，通过熔断器防止无限循环。

**核心原则**：Loop 驱动 Skills，Skills 保障质量。自主模式不降低质量标准——所有门禁、TDD 铁律、评审流程照常执行，只是跳过人工确认点，用预设策略自动决策。

**与 `forge-loop` CLI 的关系**：`/forge loop` 是分发包环境下的入口，以 SKILL 内置的迭代控制逻辑驱动执行。`forge-loop` CLI 是 SDK 环境下的入口，通过 Agent SDK 启动独立会话驱动执行。两者共享相同的状态文件格式、质量门禁和命令序列，只是驱动方式不同。

---

## 2. 触发方式

### 2.1 基本用法

```
/forge loop "为用户 API 添加分页功能"
```

### 2.2 带预设选项

```
/forge loop "为用户 API 添加分页功能" --tier standard --type backend --phase iteration
```

### 2.3 CLI 选项

| 选项 | 说明 | 可选值 / 类型 |
|------|------|--------------|
| `--tier` | 预设路由档位，跳过路由分析 | `light` / `standard` / `full` |
| `--type` | 预设任务类型 | `frontend` / `backend` / `fullstack` / `data` / `infra` / `docs` |
| `--phase` | 预设项目阶段 | `greenfield` / `iteration` / `refactor` / `bugfix` |
| `--nature` | 预设工作性质 | `feature` / `refactor` / `bugfix` |
| `--max-iterations <n>` | 最大迭代次数 | 正整数 |
| `--max-tokens <n>` | 累计 token 上限 | 正整数 |
| `--max-budget-usd <amount>` | 最大美元预算 | 浮点数 |
| `--stop-when <condition>` | 自然语言停止条件 | 字符串 |
| `--worktree` | 在独立 Git worktree 中运行 | 布尔标志 |
| `--resume <branchName>` | 恢复已有分支上的运行 | 分支名 |
| `--prevent-sleep <on\|off>` | 控制系统休眠防止 | `on`（默认）/ `off` |
| `--pua` | 启用 PUA 质量引擎 | 布尔标志 |
| `--pua-task-type <type>` | PUA 任务类型 | `debug` / `build` / `research` / `architecture` / `performance` / `review` / `deploy` / `general` |

**`--tier` 验证**：仅接受 `light`、`standard`、`full`。无效值会输出有效选项列表并拒绝启动。

**未指定 `--tier` 时**，Loop 在第一轮迭代中执行路由分析（调用 forge-router）以确定档位。

---

## 3. 启动流程

### Step 1：前置检查

1. **Git 仓库检查**：确认当前目录是 Git 仓库。
2. **工作树清洁检查**：确认工作树无未提交变更（使用 `--worktree` 或 `--resume` 时跳过）。
3. **`.forge/` 目录检查**：不存在则提示 `forge init`。使用 `--tier`/`--type`/`--phase`/`--nature` 选项时必须存在。
4. **StatusFile 活跃任务检测**：如果 `.forge/status.md` 中 `phase` 非 `completed`/`aborted`，输出警告。
5. **`--tier` 值验证**：无效值输出有效选项列表并拒绝启动。
6. **hooks.json 检查**：检查 `hooks/hooks.json` 是否存在且包含 `PreToolUse` 配置。缺失时输出警告但不阻断启动。
7. **Worktree 源分支检查**：使用 `--worktree` 时，确认当前不在 `forge/` 分支上。

### Step 2：写入执行模式

在 `.forge/status.md` 中写入自主模式标记：

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

| 字段 | 说明 |
|------|------|
| `mode` | 设为 `"autonomous"`，告知所有 Skills 跳过人工确认点 |
| `loop_run_id` | 本次 Loop 运行的唯一标识，用于状态追踪 |
| `loop_iteration` | 当前迭代编号，从 0 开始 |
| `skill_sequence` | 根据档位确定的命令序列（逗号分隔） |

**残留状态处理**：如果检测到上次异常退出残留的 `loop_run_id`，先清理残留字段，再写入新的 Loop 状态，从当前 `phase` 继续执行。

### Step 3：确定命令序列

根据 `--tier` 选项或路由分析结果，确定完整的命令序列：

| 档位 | 命令序列 |
|------|---------|
| light | build → review |
| standard | plan → build → review → test → ship |
| full | plan → build → review → test → ship → learn |
| refactor_light | refactor-apply → review |
| refactor_standard | refactor-scan → refactor-apply → review → test → ship |
| fix_light | fix-apply → review |
| fix_standard | fix-analyze → fix-apply → review → test → ship |

### Step 4：进入迭代循环

启动迭代循环，每轮迭代执行一个 SKILL 阶段。

---

## 4. 迭代控制逻辑

### 4.1 迭代流程

每轮迭代按以下步骤执行：

```
┌─────────────────────────────────────────────┐
│  1. 读取 StatusFile，确定当前 phase         │
│  2. 调用 SkillScheduler 决定下一个 SKILL     │
│  3. 构建 Skill 感知提示                      │
│  4. 执行对应 SKILL（Agent 调用）             │
│  5. 评估质量门禁（review/test/ship 阶段）    │
│  6. commit / rollback 决策                   │
│  7. 更新 StatusFile（phase + iteration）     │
│  8. 检查是否完成或需要熔断                   │
└─────────────────────────────────────────────┘
```

### 4.2 SKILL 调度状态机

SkillScheduler 根据当前状态决定下一个 SKILL：

```
[开始] → router → plan → build → review → test → ship → [完成]
                                    ↑        │
                                    │   fail │
                                    └────────┘
                                   (修复循环)
```

| 当前 phase | 条件 | 下一个 phase | 说明 |
|-----------|------|-------------|------|
| 缺失/router | — | router | 首次运行，执行路由分析 |
| plan | status ≠ approved | plan | 继续规划 |
| plan | status = approved | build | 进入执行阶段 |
| build | 有未完成任务 | build | 继续执行 |
| build | 所有任务完成 | review | 进入评审阶段 |
| review | result = fail | build | 修复循环（修复 P0/P1 问题） |
| review | result = pass | test | 进入测试阶段 |
| test | 测试通过 | ship | 进入交付阶段 |
| ship | tier = full | learn | 全量路径进入学习 |
| ship | tier ≠ full | completed | 完成 |
| learn | — | completed | 完成 |
| refactor-scan | — | refactor-apply | 进入重构应用 |
| refactor-apply | 有未完成任务 | refactor-apply | 继续重构 |
| refactor-apply | 所有任务完成 | review | 进入评审 |
| fix-analyze | — | fix-apply | 进入修复应用 |
| fix-apply | 有未完成任务 | fix-apply | 继续修复 |
| fix-apply | 所有任务完成 | review | 进入评审 |
| completed | — | completed | 终态（幂等） |
| aborted | — | aborted | 终态（幂等） |
| 未知值 | — | router | 回退到路由分析 |

### 4.3 质量门禁评估

Loop 在 review、test、ship 阶段完成后独立评估质量门禁，不依赖 Agent 自报结果：

| 阶段 | 门禁 | 评估内容 |
|------|------|---------|
| review | Review Gate | 解析 review 报告的 `p0_count`/`p1_count`，任一 > 0 则 blocked |
| test | Test Gate | 解析测试结果的 `failed` 字段或 `result` 字段 |
| ship | Ship Gate | 三重组合：Review + Test + Progress（任一 blocked 则整体 blocked） |

门禁结果：
- `passed`：门禁通过，继续下一阶段
- `blocked`：门禁阻断，触发修复循环或标记为 soft failure
- `skipped`：内容无法解析，不阻断也不算通过

### 4.4 自主模式下的确认点预设策略

所有 Skills 中的人工确认点在 `mode: autonomous` 下自动采用预设策略：

| 确认点 | 预设策略 | 说明 |
|--------|---------|------|
| Router 档位确认 | `auto-detect` | 自动采用 AI 建议的档位 |
| Plan 任务拆解确认 | `auto-approve` | 自动批准生成的计划 |
| Build 轻量路径暂停确认 | `continue` | 自动继续，不暂停 |
| Review P0/P1 处理决策 | `auto-fix` | 自动进入修复循环 |
| Ship 交付方式选择 | `keep branch` | 保留分支（最安全的选项） |
| Refactor 扫描选择 | `auto-select-recommended` | 自动选择推荐项 |
| Refactor 设计评审 | `auto-approve` | 自动批准 |
| Refactor 应用步骤 | `continue` | 连续执行 |
| Fix 报告确认 | `auto-confirm` | 自动确认 |
| Fix 分析确认 | `auto-recommend` | 自动采用推荐 |
| Fix 应用验证 | `auto-verify` | 自动验证 |

**为什么 Ship 默认"保留分支"？** 自主模式下不应自动执行不可逆操作（如合并到 main 或丢弃分支）。保留分支让用户在 Loop 完成后自行决定交付方式。

---

## 5. Commit / Rollback 决策

每轮迭代完成后，根据 SKILL 阶段和执行结果决定 Git 操作：

| SKILL 阶段 | 成功时 | 失败时 | Commit Message 格式 |
|-----------|--------|--------|-------------------|
| plan | commit | 不 commit | `forge(plan): <objective> plan approved` |
| build | commit | rollback | `forge(build): <agent summary>` |
| fix / fix-apply | commit | rollback | `forge(fix): resolve P0/P1 from review` |
| refactor-apply | commit | rollback | `forge(refactor): apply refactoring changes` |
| review | 不 commit | 不 commit | — |
| test | 不 commit | 不 commit | — |
| ship | 不 commit（由 ship 自身处理） | 不 commit | — |
| router | 不 commit | 不 commit | — |
| learn | 不 commit | 不 commit | — |
| refactor-scan | 不 commit | 不 commit | — |
| fix-analyze | 不 commit | 不 commit | — |

**原则**：只有产生代码变更的阶段（build、plan、fix、fix-apply、refactor-apply）在成功时 commit。评审和测试阶段只产生报告，不 commit。未知阶段默认不 commit（安全默认值）。

**Commit 失败处理**：如果 Git commit 操作失败，标记为 hard failure 并触发指数退避机制。

---

## 6. 修复循环与熔断保护

### 6.1 修复循环

当 Review Gate 返回 `blocked`（存在 P0/P1 问题）时，Loop 自动进入修复循环：

1. 递增 `reviewFixAttempts` 计数器。
2. 将 `phase` 回退到 `build`。
3. 在下一轮迭代的提示中注入 P0/P1 问题详情。
4. 指示 Agent 针对性修复问题。
5. 修复完成后重新进入 review。
6. Review Gate 返回 `passed` 时，重置 `reviewFixAttempts` 为 0。

### 6.2 熔断条件

Loop 维护一个 `reviewFixAttempts` 计数器：

| 事件 | 计数器操作 |
|------|-----------|
| Review Gate 返回 `blocked` | 计数器 +1 |
| Review Gate 返回 `passed` | 计数器重置为 0 |

**熔断触发**：当 `reviewFixAttempts` 达到最大值（默认 3）且 review 仍为 `fail` 时，SkillScheduler 返回 `aborted`，Loop 中止执行。

### 6.3 其他中止条件

| 条件 | 说明 |
|------|------|
| Agent 连续失败达到 Orchestrator 熔断阈值 | 底层状态机的保护机制 |
| Commit 操作失败 | 标记为 hard failure，触发退避机制 |
| 冻结区违规（FrozenZoneViolation） | 立即终止循环，不触发退避 |
| 用户手动中止（`/forge abort`） | 用户主动终止 |
| `--stop-when` 条件满足 | Agent 报告停止条件达成 |
| `--max-iterations` / `--max-tokens` / `--max-budget-usd` 达到上限 | 资源限制 |

---

## 7. 结束流程

### 7.1 正常完成

当所有 SKILL 阶段执行完毕（SkillScheduler 返回 `completed`）：

1. 清除 StatusFile 中的**所有** Loop 相关字段（`mode`、`loop_run_id`、`loop_iteration`、`skill_sequence`），恢复为默认的 interactive 模式。

2. 输出完成摘要：

```
✅ Loop completed
Objective: 为用户 API 添加分页功能
Tier: standard
Iterations: 12
Phases:
  ✅ plan
  ✅ build
  ✅ review
  ✅ test
  ✅ ship
Branch: forge/user-api-pagination
```

### 7.2 熔断中止

当修复循环超过最大重试次数时：

```
⛔ Loop aborted (circuit breaker)
Fix attempts exhausted: 3/3
Unresolved issues:
  P0: 硬编码数据库密码
  P1: 缺少错误处理
Recovery: /forge resume
```

### 7.3 错误中止

当 Loop 因错误中止时：

1. 清除 `mode`、`loop_run_id`、`loop_iteration` 字段。
2. **保留** `phase` 字段为当前阶段和 `skill_sequence`（便于 `/forge resume` 恢复）。

```
❌ Loop aborted (error)
Reason: Agent SDK timeout after 30 minutes
Recovery: /forge resume
```

---

## 8. 复用现有 Skills

Loop 不重新实现任何 SKILL 逻辑，而是**驱动现有 Skills 的完整执行**：

| 迭代阶段 | 调用的 SKILL | 说明 |
|---------|-------------|------|
| 路由分析 | `/forge`（forge-router） | 三维路由分析，确定档位和行为提示 |
| 规划 | `/forge plan`（forge-plan） | 五步规划流程，生成原子任务 |
| 执行 | `/forge build`（forge-build） | TDD 驱动的代码实现 |
| 评审 | `/forge review`（forge-review） | 三层独立评审 |
| 测试 | `/forge test`（forge-test） | 三层验证 |
| 交付 | `/forge ship`（forge-ship） | 门禁检查 + 交付（自主模式默认保留分支） |
| 学习 | `/forge learn`（forge-learn） | 五维度知识沉淀（仅全量路径） |
| 重构扫描 | `/forge refactor`（forge-refactor） | 重构目标扫描分析 |
| 重构应用 | `/forge refactor`（forge-refactor） | 应用重构变更 |
| 修复分析 | `/forge fix`（forge-fix） | Bug 根因分析 |
| 修复应用 | `/forge fix`（forge-fix） | 应用修复变更 |

**每个 SKILL 在执行时读取 `mode: autonomous`，自动跳过确认点。** Loop 不需要修改 Skills 的内部逻辑，只需要通过 StatusFile 传递执行模式。

---

## 9. 分发包环境说明

在分发包环境下（无 Agent SDK），`/forge loop` 以 SKILL 内置的迭代控制逻辑替代 SDK 驱动的循环：

| 能力 | SDK 环境（`forge-loop` CLI） | 分发包环境（`/forge loop` SKILL） |
|------|---------------------------|--------------------------------|
| 迭代驱动 | Agent SDK 的 `claudeClient.sendMessage()` 循环 | SKILL 内置的状态机驱动，Agent 在单次会话中按状态机推进 |
| 状态管理 | SdkDriver + StatusFile | StatusFile（相同格式） |
| 质量门禁 | `quality-gate.ts` 纯函数（独立评估） | 相同的门禁逻辑，由 Agent 在迭代中调用 |
| Git 事务 | `effect-executor.ts`（含冻结区检查） | Agent 直接执行 Git 命令 |
| 熔断保护 | Orchestrator 状态机 + SkillScheduler | Agent 读取 StatusFile 中的 `reviewFixAttempts` 计数，超限时中止 |

**关键差异**：SDK 环境下，每轮迭代是一次独立的 Agent 会话调用；分发包环境下，Agent 在单次会话中持续执行，通过读写 StatusFile 维护状态。两种模式产生相同的状态文件和产出物，对下游 Skills 透明。

---

## 10. 状态文件格式

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

### Loop 字段生命周期

| 字段 | 写入时机 | 更新时机 | 清除时机 |
|------|---------|---------|---------|
| `mode` | Loop 启动 | — | Loop 结束（正常/异常） |
| `loop_run_id` | Loop 启动 | — | Loop 结束（正常/异常） |
| `loop_iteration` | Loop 启动 (=0) | 每轮迭代完成 | Loop 结束（正常/异常） |
| `skill_sequence` | Loop 启动 | — | 正常完成时清除；异常退出时保留（供 `/forge resume`） |
| `phase` | 路由完成后 | 每轮迭代完成 | 正常完成时设为 `completed`；异常退出时保留当前值 |

---

## 11. 边界情况处理

### 11.1 无 `.forge/` 目录

```
⚠️ 未检测到 .forge/ 目录。请先运行 forge init 初始化项目。
```

使用 `--tier`/`--type`/`--phase`/`--nature` 选项时，`.forge/` 目录为必需。

### 11.2 已有进行中的任务

```
Warning: StatusFile has an active task in phase "<phase>". Starting a new loop may overwrite in-progress state.
```

### 11.3 Loop 异常退出后重启

如果 StatusFile 中残留 `mode: autonomous` 和 `loop_run_id`（上次 Loop 异常退出），新的 Loop 启动时：

1. 检测到残留的 `loop_run_id`。
2. 清理残留字段。
3. 重新写入新的 Loop 状态。
4. 从当前 `phase` 继续执行（而非从头开始）。

### 11.4 目标描述为空

CLI 的 `<objective>` 为必需参数，Commander 会自动拒绝空输入。

### 11.5 不支持的 `--tier` 值

```
Error: Invalid --tier value "medium". Valid options: light, standard, full
```

### 11.6 hooks.json 缺失

```
hooks protection missing: hooks/hooks.json not found
```

输出警告但不阻断启动。

### 11.7 Worktree 源分支无效

从 `forge/` 分支创建 worktree 时拒绝启动：

```
Error: Cannot create a worktree from a forge/ branch. Switch to main or another non-forge branch first.
```

### 11.8 Resume 分支不存在

```
Error: Branch "<branchName>" does not exist. Cannot resume.
```

---

## 12. 示例

### 示例 1：标准路径自主执行

```
$ /forge loop "为用户 API 添加分页功能"

🚀 启动自主执行模式

目标：为用户 API 添加分页功能
模式：autonomous
Run ID：a1b2c3d4

━━━ 迭代 1：路由分析 ━━━
  调用 forge-router...
  档位：standard
  命令序列：plan → build → review → test → ship

━━━ 迭代 2：规划 ━━━
  调用 forge-plan...
  生成 5 个原子任务
  Plan 自动批准 ✅

━━━ 迭代 3-7：执行 ━━━
  调用 forge-build...
  Task 1/5：创建分页参数类型 ✅ → commit
  Task 2/5：实现分页查询逻辑 ✅ → commit
  Task 3/5：添加分页 API 路由 ✅ → commit
  Task 4/5：实现分页响应格式 ✅ → commit
  Task 5/5：添加分页边界测试 ✅ → commit

━━━ 迭代 8：评审 ━━━
  调用 forge-review...
  结果：通过（0 P0, 0 P1, 1 P2）

━━━ 迭代 9：测试 ━━━
  调用 forge-test...
  结果：42/42 测试通过

━━━ 迭代 10：交付 ━━━
  调用 forge-ship...
  门禁通过 ✅
  交付方式：保留分支（autonomous 预设）

✅ Loop completed
  Objective: 为用户 API 添加分页功能
  Tier: standard
  Iterations: 10
  Branch: forge/user-api-pagination
```

### 示例 2：修复循环后完成

```
$ /forge loop "实现订单批量导出" --tier standard --type backend

🚀 启动自主执行模式

...（省略 plan 和 build 阶段）

━━━ 迭代 8：评审 ━━━
  调用 forge-review...
  Review Gate: blocked（0 P0, 1 P1）
  P1: src/routes/export.ts — 缺少错误处理

━━━ 迭代 9：修复循环 #1 ━━━
  修复 P1 问题...
  commit: forge(fix): resolve P0/P1 from review

━━━ 迭代 10：重新评审 ━━━
  调用 forge-review...
  Review Gate: passed ✅

━━━ 迭代 11-12：测试 + 交付 ━━━
  ...

✅ Loop completed（12 轮迭代，含 1 次修复循环）
```

### 示例 3：熔断中止

```
$ /forge loop "重构认证系统" --tier full

🚀 启动自主执行模式

...（省略前置阶段）

━━━ 迭代 10：评审 ━━━
  Review Gate: blocked（1 P0）— 硬编码密钥

━━━ 迭代 11-16：修复循环 #1-#3 + 重新评审 ━━━
  3 次修复尝试均未解决 P0 问题

⛔ Loop aborted (circuit breaker)
Fix attempts exhausted: 3/3
Unresolved issues:
  P0: src/config/auth.ts — 硬编码密钥
Recovery: /forge resume
```

### 示例 4：使用 Worktree 隔离执行

```
$ /forge loop "添加缓存层" --worktree --tier standard

在独立 worktree 中运行，不影响主工作树...
```

### 示例 5：恢复中断的运行

```
$ /forge loop "继续完成 API" --resume forge/api-pagination

Resuming run abc123 on branch forge/api-pagination from iteration 7
```
