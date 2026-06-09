---
title: 'Router 选择指南'
category: reference
audience:
- maintainer
updated: 2026-06-09
owner: forge-maintainers
---

# Router 选择指南

## 三级路由

Forge 使用三级路由系统，根据任务复杂度选择执行路径：

<!-- ssot:begin topic=routing render=routing-table locale=zh -->
| 档位 | 判定条件 | 命令序列 |
|------|---------|----------|
| **轻量路径** | 影响文件 ≤ 1 且改动 ≤ 20 行 | `build → review` |
| **标准路径** | 需求明确或已有 Spec | `plan → build → review → test → ship` |
| **全量路径** | 新服务 / 新数据库 / 认证变更 / 需求模糊 | `decide → spec → plan → build → review → test → ship → learn` |
<!-- ssot:end topic=routing -->

## 路由判定流程

```
用户输入 /forge <任务描述>
        │
        ▼
  影响文件数 ≤ 1 且改动 ≤ 20 行？
        │
   ┌────┴────┐
   是        否
   │         │
   ▼         ▼
  Light    需求明确或有 Spec？
              │
        ┌────┴────┐
        是        否
        │         │
        ▼         ▼
     Standard   Full
```

## 路由原则

1. **用户覆盖优先**：用户明确指定档位时，以用户为准
2. **宁重勿轻**：无法判定时，选择更重的档位
3. **不可跳步**：选定档位后，必须按序执行对应的命令序列

## 如何选择

- 修复 typo、更新版本号 → **Light**
- 已有 spec 的功能开发 → **Standard**
- 新功能需求不明确、需要多视角评估 → **Full**
- 涉及安全变更 → 至少 **Standard**，考虑 **Full**

## 相关文件

- 路由入口：`CLAUDE.md §1 Task Routing Rules`
- Router SKILL：`skills/forge/lib/router/instructions.md`
- 调度器：`src/skill-scheduler.ts`
