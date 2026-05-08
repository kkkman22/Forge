---
name: forge-resume
description: "Resume an interrupted task by reconstructing state from status file and knowledge sessions. Use when user runs `/forge resume`, new session begins with prior task incomplete, or picking up interrupted work."
disable-model-invocation: true
---

# /forge resume — 会话恢复

> **触发方式**：用户在新会话中输入 `/forge resume`
> **职责**：在新会话中快速恢复之前的工作上下文，避免重复理解和重新开始
> **输出路径**：无文件输出，仅终端展示恢复的上下文

---

## 1. Overview

`/forge resume` 通过五个问题快速重建工作上下文——正在解决什么问题、当前在哪一步、已知发现、下一步是什么、有什么阻塞。它从 `.forge/` 状态文件中自动提取答案，让开发者在新会话中无缝继续之前的工作。

**核心原则**：恢复上下文的成本应该接近零。开发者不应该花时间回忆"我上次做到哪了"。

**Session Boundary Recovery**: 每个 `/forge` 命令构成一个自然的 Session Boundary。`/forge resume` 是会话边界后恢复上下文的推荐方法。它从 `.forge/progress/` 读取任务完成状态，从 `.forge/knowledge/sessions/` 读取会话日志。建议用户在 `/forge` 命令之间开启新的 Claude Code 会话，以避免上下文累积（详见 CLAUDE.md §6 Session Boundaries）。

---

**Not For**：
- 首次开始新任务（用 `/forge`）
- 上一个任务已完成（用 `/forge` 开始新任务）

## 2. Data Sources & Five-Question Recovery

### Prerequisite: Read Status Files

**数据来源**：`.forge/status.md` 或 `.forge/status/*.md` + `.forge/knowledge/sessions/`

**单任务模式**：直接读取 `.forge/status.md`。

**多任务模式**：调用 `listActiveTasks(io, forgeRoot)` 获取活跃任务列表。多个活跃任务时，显示编号列表让用户选择。仅一个活跃任务时自动恢复。

先读取状态文件获取全局上下文：

| Field | Purpose |
|------|------|
| `current_task` | 确定当前任务主题，定位对应的 plan/progress/findings 文件 |
| `tier` | 确定当前档位，判断下一步应执行哪个命令 |
| `phase` | 确定当前阶段 |
| `updated` | 上次更新时间 |

**Session-level recovery**:

1. 检查 `.forge/knowledge/sessions/` 中是否存在 `*-interim.md` 文件（上次会话中途中断的执行上下文）。
2. 如果存在 interim 文件：读取"进度快照"→ 问题 2；"关键发现"→ 问题 3；"异常记录"→ 问题 5；"活跃约束"→ 恢复后首次 Restatement 重新注入。
3. 如果不存在 interim 文件，读取正式会话日志作为补充信息。

**恢复后的首次 Restatement**：恢复上下文后，如果用户确认继续 build，在派发第一个 Subagent 之前**立即执行一次 Restatement Checkpoint**。

### Five-Question Mapping

| Question | Data Source |
|------|---------|
| 1. 正在解决什么问题？ | `.forge/plans/<topic>.md` 的 Objective 章节 |
| 2. 当前在哪一步？ | `status.md` 的 `phase` + `.forge/progress/<topic>.md` 中的"进行中"任务 |
| 3. 已知发现是什么？ | `.forge/findings/<topic>.md` |
| 4. 下一步是什么？ | `.forge/plans/<topic>.md` 的 Task Breakdown 中的下一个任务 |
| 5. 有什么阻塞？ | `.forge/progress/<topic>.md` 中的"阻塞"章节 |

---

## 3. Output Format

五段式恢复输出（全局状态 → 问题 → 当前步骤 → 发现 → 下一步 → 阻塞）+ 完整示例：

→ 详见 references/output-format.md

---

## 4. 自动定位

恢复完成后，自动定位到上次中断的任务：

1. 读取 Progress 中的"进行中"任务 → 有则定位到该任务
2. 无进行中任务 → 找到第一个未完成的任务
3. 所有任务已完成 → 提示进入下一阶段（review/test/ship）

定位后等待用户确认：确认 → 从定位的任务继续 `/forge build`；拒绝 → 等待用户指示。

## Common Rationalizations

| 合理化 | 反驳 |
|--------|------|
| "我记得上次做到哪了不需要恢复" | 上下文窗口是有限的。写下来的状态比记忆可靠，尤其是跨会话时 |
| "直接从头开始更快" | 从头开始意味着丢弃已完成的工作和已发现的问题。恢复上下文的成本远低于重做 |
| "状态文件可能过时了" | 状态文件是 Forge 的单一真理源。如果过时了，resume 会检测到并提示 |

---

## 5. 边界情况处理

| 条件 | 处理 |
|------|------|
| 无 `.forge/` 目录 | ⚠️ 没有可恢复的工作上下文。请运行 forge init 或 /forge 开始新任务 |
| 无 Plan 文件 | ℹ️ 未找到计划文件。运行 /forge 开始新任务 |
| 无 Progress 文件 | 展示全局状态 + Plan Objective，提示"建议从 Task 1 开始执行" |
| 所有任务已完成 | 提示"Build 阶段已完成。建议运行 /forge review" |
| StatusFile 缺失或不一致 | 调用 `recoverPhase()` → 从 .forge/ 文件结构推断当前阶段（plans/ → plan, progress/ → build, reviews/ → review），展示推断结果和置信度，等待用户确认。**不自动写入磁盘** |

---

## 6. 示例

→ 详见 references/output-format.md §示例
