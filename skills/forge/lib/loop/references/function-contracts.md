# Function Contracts

## `listActiveTasks(io, forgeRoot)`

- **参数**：
  - `io` — I/O 接口对象
  - `forgeRoot` — `.forge/` 目录路径
- **返回**：活跃任务列表
- **用途**：扫描 `.forge/status/` 目录，返回所有状态为活跃的任务

---

## `writeTaskStatus(io, forgeRoot, taskId, status)`

- **参数**：
  - `io` — I/O 接口对象
  - `forgeRoot` — `.forge/` 目录路径
  - `taskId` — 任务标识符
  - `status` — 任务状态对象（包含 phase、updated 等字段）
- **返回**：无
- **用途**：将任务状态写入 `.forge/status/<taskId>.md`

---

## `SkillScheduler`

- **类型**：类/调度器
- **方法**：
  - `schedule(skillName, cron, prompt)` — 注册定时任务
  - `unschedule(skillName)` — 取消定时任务
  - `listScheduled()` — 列出所有已注册任务
  - `runPending(now)` — 执行到期的任务
- **用途**：管理 `/forge loop` 的定时任务调度，支持 cron 表达式和一次性任务
