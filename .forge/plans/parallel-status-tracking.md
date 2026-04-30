---
topic: "parallel-status-tracking"
spec_ref: ".kiro/specs/parallel-status-tracking"
status: "approved"
created: "2026-04-30"
---

# Plan: Parallel Status Tracking

> 来源: `.kiro/specs/parallel-status-tracking/tasks.md`

## Objective

引入多文件状态追踪，使并行任务拥有独立状态文件。两个新模块 + 现有模块适配，保持单任务向后兼容。

## 任务摘要

1. **slugify + Status_Resolver** — `src/status-resolver.ts`：`slugify`、`resolveStatusPath`、`isMultiTaskMode` + 属性测试 P1/P2/P3/P12
2. **Status_Manager 核心读写** — `src/status-manager.ts`：`readTaskStatus`、`writeTaskStatus`、`listActiveTasks`、`getMostRecentActiveTask` + 属性测试 P4/P5/P6/P9
3. **迁移与归档逻辑** — `migrateToMultiTask`、`archiveTaskStatus` + 属性测试 P7/P10/P11
4. **sdk-driver 适配** — 通过 StatusManager 路由 StatusFileIO + 属性测试 P8
5. **SKILL 文档适配** — router/resume/abort/status/loop 五个 SKILL.md
6. **hooks 适配** — hooks.json 三个 hook 脚本兼容多文件模式
7. **端到端验证** — 全量测试 + 向后兼容验证 + 迁移流程验证

## 依赖关系

```
Task 1 (resolver) → Task 2 (manager 核心) → Task 3 (迁移归档) → Task 4 (sdk-driver)
                                                                             ↓
                                                          Task 5 (SKILL) → Task 6 (hooks) → Task 7 (验证)
```

Task 5 和 Task 6 可与 Task 4 并行开始。

## 风险评估

- **中风险**：涉及 sdk-driver 核心路径修改，需确保 Loop 字段读写不受影响
- **向后兼容**：单任务模式行为必须完全不变（Property 5 保证）
- **注意点**：barrel-file test 需更新 export 数量（新增两个模块导出）
