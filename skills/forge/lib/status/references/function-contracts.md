# Function Contracts

## `buildHealthSnapshot(options)`

- **参数**：
  - `options.projectRoot` — 项目根目录
  - `options.currentHead` — 当前 HEAD commit
- **返回**：包含当前任务、policy profile、artifact ids、gate 状态和 next-step blockers 的共享健康快照
- **用途**：`/forge status`、`forge-status` 和 `forge-doctor --json` 的共同状态模型

## `renderStatusSummary(snapshot)`

- **参数**：
  - `snapshot` — `buildHealthSnapshot(options)` 返回值
- **返回**：包含 Task / Phase / Tier / Profile / Next 和阻塞原因的简明文本
- **用途**：`/forge status` 与 `forge-status` 的终端输出

## `listActiveTasks(io, forgeRoot)`

- **参数**：
  - `io` — I/O 接口对象
  - `forgeRoot` — `.forge/` 目录路径
- **返回**：活跃任务列表（多任务模式下展示所有活跃任务汇总表）
- **用途**：扫描 `.forge/status.md` + `.forge/status/*.md`，返回所有活跃任务的状态摘要
