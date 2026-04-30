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

---

## 2. 触发方式

```
/forge loop "为用户 API 添加分页功能"
```

| 选项 | 说明 | 可选值 / 类型 |
|------|------|--------------|
| `--tier` | 预设路由档位 | `light` / `standard` / `full` |
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
| `--pua` / `--pua-task-type <type>` | PUA 质量引擎及任务类型 | `debug`/`build`/`research`/`architecture`/`performance`/`review`/`deploy`/`general` |

`--tier` 仅接受 `light`/`standard`/`full`，无效值输出有效选项并拒绝启动。未指定时，Loop 在第一轮迭代执行路由分析。

---

## 3. 启动流程

### Step 1：前置检查

1. Git 仓库检查；2. 工作树清洁检查（`--worktree`/`--resume` 时跳过）；3. `.forge/` 目录检查；4. StatusFile 活跃任务检测（多任务模式调用 `listActiveTasks`）；5. `--tier` 值验证；6. hooks.json 存在性检查（缺失警告不阻断）；7. `--worktree` 时确认不在 `forge/` 分支上。

### Step 2：写入执行模式

写入 `.forge/status.md`（多任务模式写入 `.forge/status/<task-id>.md`）：

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

`mode: autonomous` 告知所有 Skills 跳过人工确认点。`loop_run_id` 为本次运行唯一标识。残留 `loop_run_id` 时先清理再写入，从当前 `phase` 继续。

### Step 3：确定命令序列

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

每轮迭代：读取 StatusFile → SkillScheduler 决定下一个 SKILL → 构建感知提示 → 执行 SKILL → 评估质量门禁 → commit/rollback → 更新 StatusFile → 检查完成/熔断。

### 4.2 SKILL 调度状态机

→ 完整状态转换见 `src/skill-scheduler.ts`。非显而易见的转换：

| 转换 | 说明 |
|------|------|
| review fail → build | 触发修复循环（§6.1） |
| completed/aborted → 终态 | 幂等，不触发任何操作 |
| 未知 phase → router | 安全回退到路由分析 |

### 4.3 质量门禁评估

Loop 在 review/test/ship 阶段完成后独立评估，不依赖 Agent 自报：

| 阶段 | 评估内容 |
|------|---------|
| review | 解析 `p0_count`/`p1_count`，任一 > 0 则 blocked |
| test | 解析 `failed` 或 `result` 字段 |
| ship | 三重组合：Review + Test + Progress |

门禁结果：`passed`（继续）/ `blocked`（修复循环）/ `skipped`（无法解析，不阻断也不算通过）。

### 4.4 自主模式确认点预设

`mode: autonomous` 下：Router → `auto-detect`；Plan → `auto-approve`；Build 轻量暂停 → `continue`；Review P0/P1 → `auto-fix`；Ship → `keep branch`（不自动执行不可逆操作）；Refactor 扫描/评审/应用 → `auto-select-recommended`/`auto-approve`/`continue`；Fix 确认/分析/验证 → `auto-confirm`/`auto-recommend`/`auto-verify`。

---

## 5. Commit / Rollback 决策

| SKILL 阶段 | 成功 | 失败 | Commit Message |
|-----------|------|------|---------------|
| plan | commit | 不 commit | `forge(plan): <objective> plan approved` |
| build | commit | rollback | `forge(build): <agent summary>` |
| fix / refactor-apply | commit | rollback | `forge(fix/refactor): ...` |
| review/test/ship/router/learn/refactor-scan/fix-analyze | 不 commit | 不 commit | — |

Commit 失败时标记 hard failure 并触发指数退避。

---

## 6. 修复循环与熔断保护

### 6.1 修复循环

Review Gate blocked（P0/P1 存在）时：递增 `reviewFixAttempts` → phase 回退到 build → 注入 P0/P1 详情 → 修复后重新 review → passed 时重置计数器。

### 6.2 熔断条件

`reviewFixAttempts` 达到最大值（默认 3）且 review 仍 fail → Loop 中止。

### 6.3 其他中止条件

Agent 连续失败达阈值；Commit 失败（hard failure + 退避）；冻结区违规（立即终止）；用户 `/forge abort`；`--stop-when` 条件满足；`--max-iterations`/`--max-tokens`/`--max-budget-usd` 达到上限。

---

## 7. 结束流程

### 7.1 正常完成

清除 StatusFile 中所有 Loop 相关字段，恢复 interactive 模式：

```
✅ Loop completed
Objective: 为用户 API 添加分页功能
Tier: standard | Iterations: 12
Phases: ✅ plan  ✅ build  ✅ review  ✅ test  ✅ ship
```

### 7.2 熔断中止

```
⛔ Loop aborted (circuit breaker)
Fix attempts exhausted: 3/3 | Unresolved: P0: 硬编码数据库密码
Recovery: /forge resume
```

### 7.3 错误中止

清除 `mode`/`loop_run_id`/`loop_iteration`，**保留** `phase`/`skill_sequence`（供 `/forge resume` 恢复）。

---

## 8. 复用现有 Skills

Loop 不重新实现任何 SKILL 逻辑，只驱动现有 Skills 的完整执行。`mode: autonomous` 下每个 SKILL 自动跳过确认点。

---

## 9. 分发包环境说明

在分发包环境下（无 Agent SDK），`/forge loop` 以 SKILL 内置迭代控制逻辑替代 SDK 驱动：

| 能力 | SDK 环境（CLI） | 分发包环境（SKILL） |
|------|---------------|-------------------|
| 迭代驱动 | Agent SDK 循环 | SKILL 内置状态机，单次会话推进 |
| 状态管理 | SdkDriver + StatusFile | StatusFile（相同格式） |
| 质量门禁 | `quality-gate.ts` 纯函数 | 相同门禁逻辑 |
| Git 事务 | `effect-executor.ts`（含冻结区检查） | Agent 直接执行 Git 命令 |
| 熔断保护 | Orchestrator + SkillScheduler | Agent 读取 `reviewFixAttempts` |

---

## 10. 状态文件格式

Loop 运行期间，`.forge/status.md` 增加以下字段：

```yaml
---
current_task: "..."
tier: "standard"
phase: "build"
mode: "autonomous"
loop_run_id: "<uuid>"
loop_iteration: 5
skill_sequence: "plan,build,review,test,ship"
updated: "YYYY-MM-DD HH:mm"
---
```

`mode`/`loop_run_id`/`loop_iteration` 在 Loop 结束时清除。`skill_sequence`/`phase` 在异常退出时保留（供 resume 恢复）。

---

## 11. 边界情况处理

| 条件 | 输出 |
|------|------|
| 无 `.forge/` 目录 | ⚠️ 请先运行 forge init |
| 已有进行中任务 | Warning: active task in phase "<phase>"，可能被覆盖 |
| 异常退出后重启 | 检测残留 `loop_run_id` → 清理 → 从当前 phase 继续 |
| 目标描述为空 | Commander 自动拒绝 |
| 无效 `--tier` | Error: Valid options: light, standard, full |
| hooks.json 缺失 | Warning（不阻断） |
| Worktree 源分支无效 | Error: Cannot create worktree from forge/ branch |
| Resume 分支不存在 | Error: Branch does not exist |

---

## 12. 示例

### Canonical：标准路径自主执行

```
$ /forge loop "为用户 API 添加分页功能"
🚀 启动自主执行 | 目标：为用户 API 添加分页功能 | 模式：autonomous
━━━ 迭代 1：路由分析 → 档位：standard ━━━
━━━ 迭代 2：规划 → 5 个任务，Plan 自动批准 ✅ ━━━
━━━ 迭代 3-7：执行 → Task 1-5 逐一完成并 commit ✅ ━━━
━━━ 迭代 8：评审 → 通过（0 P0, 0 P1, 1 P2） ━━━
━━━ 迭代 9：测试 → 42/42 通过 ✅ ━━━
━━━ 迭代 10：交付 → 保留分支 ━━━
✅ Loop completed | standard | 10 iterations
```

**变体**：修复循环（review blocked → 修复 P1 → re-review passed → 继续）；熔断中止（3 次修复失败 → ⛔ → `/forge resume`）；Worktree 隔离（`--worktree`）；恢复中断（`--resume <branch>`）。
