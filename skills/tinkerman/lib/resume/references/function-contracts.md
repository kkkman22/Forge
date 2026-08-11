---
updated: 2026-08-11
---
# Function Contracts

## `listActiveTasks(io, forgeRoot)`

- **参数**：
  - `io` — I/O 接口对象
  - `forgeRoot` — `.forge/` 目录路径
- **返回**：活跃任务列表（多任务模式下让用户选择要恢复的任务）
- **用途**：扫描 `.forge/status.md` 和 `.forge/status/*.md`，返回所有活跃任务

---

## `recoverPhase()`

- **参数**：无
- **返回**：推断的阶段字符串（如 `"plan"`、`"build"`、`"review"`）及置信度
- **用途**：当 `.forge/status.md` 缺失或不一致时，从 `.forge/` 目录结构推断当前阶段：
  - `plans/` 存在 → `plan`
  - `progress/` 存在 → `build`
  - `reviews/` 存在 → `review`
