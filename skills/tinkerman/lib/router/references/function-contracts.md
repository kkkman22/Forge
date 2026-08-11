---
updated: 2026-08-11
---
# Function Contracts

## `detectGrillTrigger(userInput)`

- **参数**：
  - `userInput` — 用户输入文本
- **返回**：`boolean` — 是否命中 grill 触发关键词
- **用途**：识别用户输入中的 grill 触发信号（大小写不敏感子串匹配）：
  - `/tinkerman grill [topic]`
  - `grill me`
  - `grill harder`
  - `dig deeper`
  - `再挖深点`

---

## `buildGrillSuggestion(tier)`

- **参数**：
  - `tier` — 当前档位（`"full"` | `"standard"` | `"light"`）
- **返回**：grill 建议字符串，或 `null`（非全量档位）
- **用途**：全量档位下生成可选的 `/tinkerman grill` 前缀建议，提示用户可先进行苏格拉底式对齐

---

## `writeTaskStatus(io, forgeRoot, status)`

- **参数**：
  - `io` — I/O 接口对象
  - `forgeRoot` — `.tinkerman/` 目录路径
  - `status` — 状态对象（包含 `current_task`, `tier`, `task_type`, `project_phase`, `phase`, `hints`, `assumptions`, `updated`）
- **返回**：无
- **用途**：路由完成后将任务状态写入 `.tinkerman/status.md`（单任务）或 `.tinkerman/status/<task-id>.md`（多任务）
