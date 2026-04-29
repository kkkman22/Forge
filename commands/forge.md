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

**示例**：
- `/forge learn` → 直接调用 `Skill(forge-learn)`
- `/forge build` → 直接调用 `Skill(forge-build)`
- `/forge ship` → 直接调用 `Skill(forge-ship)`
- `/forge spec api-spec.yaml` → 调用 `Skill(forge-spec)`，传入 `api-spec.yaml` 作为参数

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

## 注意

- 这是一个 Command（用户主动触发的编排入口），不是 Skill
- 子命令分发是精确匹配，不是模糊匹配——`/forge learning` 不会匹配 `learn`
- 内部通过 Skill tool 调用各个 forge skill
- forge-router skill 保留为任务分析逻辑的载体，仅在非子命令模式下调用
