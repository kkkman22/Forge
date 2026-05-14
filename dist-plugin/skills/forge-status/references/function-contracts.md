# Function Contracts

## `listActiveTasks(io, forgeRoot)`

- **参数**：
  - `io` — I/O 接口对象
  - `forgeRoot` — `.forge/` 目录路径
- **返回**：活跃任务列表（多任务模式下展示所有活跃任务汇总表）
- **用途**：扫描 `.forge/status.md` + `.forge/status/*.md`，返回所有活跃任务的状态摘要
