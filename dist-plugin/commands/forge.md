---
name: forge
description: Forge 统一入口。支持子命令直接调用和任务描述路由两种模式。
argument-hint: "[子命令|任务描述] [--tier=light|standard|full]"
model: inherit
allowed-tools: Read, Glob, Grep, Skill
---

# /forge — 统一入口

当用户输入 `/forge <参数>` 时，**首先判断参数是子命令还是任务描述**，然后分发到对应的处理逻辑。

## 1. 子命令分发（优先匹配）

如果参数的**第一个词**精确匹配以下子命令之一，**直接调用对应的 Skill，不经过路由器**：

| 子命令 | 对应 Skill | 说明 |
|--------|-----------|------|
| `plan` | `forge-plan` | 规划引擎 |
| `build` | `forge-build` | 执行引擎 |
| `review` | `forge-review` | 评审引擎 |
| `test` | `forge-test` | 测试引擎 |
| `ship` | `forge-ship` | 交付引擎 |
| `learn` | `forge-learn` | 知识引擎 |
| `decide` | `forge-decide` | 决策引擎 |
| `spec` | `forge-spec` | 规格引擎 |
| `debug` | `forge-debug` | 调试引擎 |
| `loop` | `forge-loop` | 自主执行引擎 |
| `status` | `forge-status` | 状态查询 |
| `resume` | `forge-resume` | 会话恢复 |
| `abort` | `forge-abort` | 任务中止 |
| `refactor` | `forge-refactor` | 重构引擎 |
| `fix` | `forge-fix` | 修复引擎 |
| `accept` | `forge-accept` | 验收场景执行 |
| `verify` | `forge-verify` | 证据化验证引擎 |
| `control-cli` | `forge-control-cli` | CLI/TUI 外部验证 |
| `control-ui` | `forge-control-ui` | Web/Electron 外部验证 |
| `fix-conflicts` | `forge-fix-conflicts` | 三区感知合并冲突 |
| `recap` | `forge-recap` | 时间窗复盘 |
| `pack` | `forge-pack` | Pack 管理命令 |

**示例**：
- `/forge learn` → 直接调用 `Skill(forge-learn)`
- `/forge build` → 直接调用 `Skill(forge-build)`
- `/forge ship` → 直接调用 `Skill(forge-ship)`
- `/forge spec api-spec.yaml` → 调用 `Skill(forge-spec)`，传入 `api-spec.yaml` 作为参数
- `/forge accept` → 调用 `Skill(forge-accept)`，执行验收场景
- `/forge ship --with-acceptance` → 调用 `Skill(forge-ship)`，附带验收场景评估
- `/forge ship --promote-derived` → 调用 `Skill(forge-ship)`，derived scenario 参与阻断判定

**子命令后的剩余参数**作为该 Skill 的输入传递。

## 2. 任务路由（子命令未匹配时）

如果参数的第一个词**不匹配**任何子命令，则视为任务描述，进入路由流程：

1. 读取 `.forge/status.md` 检查是否有进行中的任务
2. 读取 `.forge/config.md` 获取项目配置
3. 调用 `Skill(forge-router)` 进行任务分析和档位建议
4. 用户确认或覆盖档位后，按命令序列依次调用对应的 forge skill

**示例**：
- `/forge 为用户 API 添加分页功能` → 路由器分析 → 建议标准路径 → `plan → build → review → test → ship`
- `/forge 搭建通知系统 --tier=full` → 路由器 → 全量路径

## 编排逻辑

```
用户输入 /forge <参数>
        │
        ▼
  参数第一个词是子命令？
        │
   ┌────┴────┐
   是        否
   │         │
   ▼         ▼
  直接调用   读取 .forge/status.md
  对应 Skill        │
   │         ▼
   │    调用 Skill(forge-router)
   │         │
   │         ▼
   │    用户确认档位
   │         │
   │         ▼
   │    按命令序列调用 Skill：
   │      轻量：build → review
   │      标准：plan → build → review → test → ship
   │      全量：decide → spec → plan → build → review → test → ship → learn
   │
   ▼
  完成
```

## 全局分支保护规则

**任何会修改项目文件的阶段**（build、review 修复、test 修复）启动前，必须检查当前分支：

1. 如果在 `main` 或 `master` 分支上 → **阻断**，提示切换到功能分支
2. 功能分支命名：`feature/<topic>` 或 `forge/<topic>`
3. `<topic>` 从 `.forge/status.md` 的 `current_task` 字段提取

**不修改项目文件的阶段**（plan、decide、spec、status、learn）可以在任意分支上执行。

**示例阻断输出**：
```
🚫 分支保护：当前在 main 分支上，不允许直接修改代码
请先切换到功能分支：
  git checkout -b feature/<topic>
```

此规则是 forge-build §2.1 Branch Gate 的全局扩展，确保即使在 build 之外的修复阶段也不会在 main 上直接提交。

## 阶段间自动推进

当一个阶段**成功完成**后，如果命令序列中还有后续阶段，**必须立即自动调用下一阶段，不得停下来等待用户确认**。只在阶段失败时才停下来，让用户决定如何处理。

### 成功时：自动推进（不等确认）

| 完成阶段 | 下一步行为 |
|---------|-----------|
| plan | 输出摘要 → **立即调用** `Skill(skill="forge", args="build")` |
| build | 输出摘要 → **立即调用** `Skill(skill="forge", args="review")` |
| review（通过） | 输出摘要 → **立即调用** `Skill(skill="forge", args="test")`（标准/全量）或 `Skill(skill="forge", args="ship")`（轻量） |
| test（通过） | 输出摘要 → **立即调用** `Skill(skill="forge", args="ship")` |
| ship | 输出摘要 → **立即调用** `Skill(skill="forge", args="learn")`（全量）或标记完成（标准） |

每个阶段完成时输出一行摘要即可，格式：`✅ <阶段> 完成 → 自动进入 <下一阶段>`，然后直接调用，不要输出"是否继续？"之类的确认提示。

### 失败时：停下来等用户决定

| 失败阶段 | 停止行为 |
|---------|---------|
| review（未通过） | 输出问题清单 → 停止，提示用户：`修复后运行 /forge review` |
| test（未通过） | 输出失败详情 → 停止，提示用户：`修复后运行 /forge test` |
| 任何阶段出错 | 输出错误信息 → 停止，等待用户指示 |

### 单独调用子命令时

当用户直接调用单个子命令（如 `/forge build`）而非通过任务路由进入完整序列时，同样遵循自动推进规则：完成后自动调用序列中的下一阶段。如果用户只想执行单个阶段不自动推进，可以加 `--no-advance` 参数。

## 注意

- 这是一个 Command（用户主动触发的编排入口），不是 Skill
- 子命令分发是精确匹配，不是模糊匹配——`/forge learning` 不会匹配 `learn`
- 内部通过 Skill tool 调用各个 forge skill
- forge-router skill 保留为任务分析逻辑的载体，仅在非子命令模式下调用

## ⚠️ AI 调用约束（关键）

**所有子 skill（forge-plan、forge-build、forge-review 等）都设置了 `disable-model-invocation: true`，AI 不能直接通过 `Skill("forge-review")` 调用它们。**

正确的调用方式：

```
✅ 正确：Skill(skill="forge", args="review")
✅ 正确：Skill(skill="forge", args="plan .forge/specs/xxx")
✅ 正确：Skill(skill="forge", args="ship")

❌ 错误：Skill(skill="forge-review")        → Unknown skill
❌ 错误：Skill(skill="forge-plan")           → Unknown skill
❌ 错误：Skill(skill="forge-ship")           → Unknown skill
```

**原因**：`forge` 是唯一注册的统一入口 skill。子 skill 目录虽然存在于 `skills/` 下，但 `disable-model-invocation: true` 阻止了 AI 直接调用。所有子命令必须通过 `/forge <子命令>` 路由分发。

**编排后续阶段时**：当 AI 需要自动推进到下一阶段（如 review 通过后进入 test），必须使用 `Skill(skill="forge", args="test")` 而非 `Skill(skill="forge-test")`。
