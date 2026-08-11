---
updated: 2026-08-11
---
# Handoff Block — R2 原子任务交接

> 由 forge-build SKILL.md §3.6 引用。每完成一个原子任务并准备 commit 前，build agent 必须在 `.tinkerman/progress/<topic>.md` 对应任务条目下追加一份 handoff block。

## 5 字段格式

fenced code block，语言标记 `yaml` 或 `handoff`：

- `task_id`: 任务编号
- `completed`: 已完成事项列表
- `not_completed`: 未完成事项（完整完成则 `[]`）
- `commands_executed`: 命令列表，每条含 `cmd` 和 `exit_code`
- `issues_found`: 发现的问题（无则 `[]`）
- `procedure_compliance`: TDD 阶段执行描述（RED/GREEN/REFACTOR 或 `skipped`）

下一个原子任务启动前，必须先读取上一任务的 handoff block 作为接续输入。

## Carry-Over Discipline（R2.AC6）

若上一任务的 `not_completed` 字段非空，下一任务 plan 阶段必须在三种处理之一中显式选择：

- (a) 纳入当前任务范围立即处理
- (b) 作为已知 backlog 写入 spec 的 `Out of Scope` 章节并附理由
- (c) 升级为新的 atomic task

**静默忽略 = P1**。

## Tier 降级

light tier：仅必填 `commands_executed` 和 `procedure_compliance`。

## Self-Check Handoff 项

§3.5 Final Validation 运行时验证：

- 已 commit 的每个原子任务都对应一份 handoff block
- 每份 handoff block 包含 5 个字段（standard/full tier）
- `commands_executed` 数组中至少有一条 `cmd`
- `procedure_compliance` 包含 RED/GREEN/REFACTOR 或 `skipped`

缺失即输出 P1，build 不结束。
