---
name: forge
description: Forge 统一入口路由器。分析任务复杂度，建议执行档位（轻量/标准/全量），启动对应命令序列。
argument-hint: "[任务描述] [--tier=light|standard|full]"
model: inherit
allowed-tools: Read, Glob, Grep, Skill
---

# /forge — 入口路由器

当用户输入 `/forge <任务描述>` 时，执行以下流程：

1. 读取 `.forge/status.md` 检查是否有进行中的任务
2. 读取 `.forge/config.md` 获取项目类型（greenfield/brownfield）
3. 调用 `forge-router` skill 进行任务分析和档位建议
4. 用户确认或覆盖档位后，按命令序列依次调用对应的 forge skill

## 编排逻辑

```
用户输入 /forge <任务描述>
        │
        ▼
  读取 .forge/status.md（检查进行中任务）
        │
        ▼
  调用 Skill(forge-router)（分析复杂度、建议档位）
        │
        ▼
  用户确认档位
        │
        ▼
  按命令序列调用对应 Skill：
    轻量：Skill(forge-build) → Skill(forge-review)
    标准：Skill(forge-plan) → Skill(forge-build) → Skill(forge-review) → Skill(forge-test) → Skill(forge-ship)
    全量：Skill(forge-decide) → Skill(forge-spec) → ... → Skill(forge-learn)
```

## 注意

- 这是一个 Command（用户主动触发的编排入口），不是 Skill
- 内部通过 Skill tool 调用各个 forge skill
- forge-router skill 保留为分析逻辑的载体，本 Command 负责编排
