---
updated: 2026-08-11
---
# Function Contracts

## `listActiveTasks(io, forgeRoot)`

- **参数**：
  - `io` — I/O 接口对象
  - `forgeRoot` — `.tinkerman/` 目录路径
- **返回**：活跃任务列表（多任务模式下用于枚举可中止的任务）
- **用途**：扫描 `.tinkerman/status.md` 和 `.tinkerman/status/*.md`，返回所有活跃任务供用户选择中止目标

---

## `archiveTaskStatus(io, forgeRoot, taskName, date)`

- **参数**：
  - `io` — I/O 接口对象
  - `forgeRoot` — `.tinkerman/` 目录路径
  - `taskName` — 要归档的任务名称
  - `date` — 归档日期（ISO 格式字符串）
- **返回**：无
- **用途**：将指定任务的状态文件从活跃状态归档，记录中止时间和原因
