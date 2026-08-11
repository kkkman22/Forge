---
updated: 2026-08-11
description: "Use when user runs `/tinkerman resume`, a new session begins with prior work incomplete, or picking up interrupted work"

dispatch_mode: inline
allowed_tools:
  - Read
  - Bash
---

## Current Context

Phase: !`grep '^phase:' .forge/status.md 2>/dev/null || echo "no status"`
Task: !`grep '^current_task:' .forge/status.md 2>/dev/null || echo "no task"`
Package: !`grep '^current_package:' .forge/status.md 2>/dev/null || echo "no package"`
Last session: !`ls -t .forge/knowledge/sessions/*.md 2>/dev/null | head -1 || echo "no sessions"`
Branch: !`git branch --show-current`

# /tinkerman resume — 会话恢复

> **触发方式**：用户在新会话中输入 `/tinkerman resume`
> **职责**：在新会话中快速恢复之前的工作上下文，避免重复理解和重新开始
> **输出路径**：无文件输出，仅终端展示恢复的上下文
---

## 1. Overview
`/tinkerman resume` 通过五个问题快速重建工作上下文——正在解决什么问题、当前在哪一步、已知发现、下一步是什么、有什么阻塞。它从 `.forge/` 状态文件中自动提取答案，让开发者在新会话中无缝继续之前的工作。

**核心原则**：恢复上下文的成本应该接近零。

**Session Boundary Recovery**: `/tinkerman resume` 是会话边界后恢复上下文的推荐方法。从 `.forge/progress/` 读任务状态，从 `.forge/knowledge/sessions/` 读会话日志。建议 `/tinkerman` 命令间开启新 Claude Code 会话（详见 CLAUDE.md §6）。

## Delegation_Adapter

→ 详见 references/delegation-adapter.md（迁移指南：docs/slimming-migration.md）

**Not For**：首次开始新任务（用 `/tinkerman`）、上一个任务已完成（用 `/tinkerman` 开始新任务）

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
| `current_package` / `completed_packages` / `next_package` / `package_count` | 恢复 execution package 边界，避免重新加载全量 tasks |
| `updated` | 上次更新时间 |

**Session-level recovery**:
1. 检查 `.forge/knowledge/sessions/` 中是否存在 `*-interim.md` 文件（上次会话中途中断的执行上下文）。
2. 如果存在 interim 文件：读取"进度快照"→ 问题 2；"关键发现"→ 问题 3；"异常记录"→ 问题 5；"活跃约束"→ 恢复后首次 Restatement 重新注入。
3. 如果不存在 interim 文件，读取正式会话日志作为补充信息。

**恢复后的首次 Restatement**：通过 AskUserQuestion 选择继续 build 后，派发第一个 Subagent 前**立即执行 Restatement Checkpoint**。
**SKILL Reload（必读）**：恢复后执行任何阶段前：读 `status.md` phase → 读 `skills/tinkerman-{phase}/SKILL.md` → 按步骤执行。适用于所有阶段。Restatement 仅限 build。
**Recovery Priority Chain（R7）**：恢复时**先**执行 8 步恢复优先级链（读 status → 读 interim → 扫 git log → 查 git status → 对账 progress → 对账 phase → 分类中断点 → 生成 Recovery_Report），收集**全部**不一致后一次性呈现，不在第一个不一致处停下。纯函数 `runRecoveryChain(input)`（`src/resume.ts`）；编排细节与调用约定 → [references/recovery-priority-chain.md](references/recovery-priority-chain.md)。零不一致时进入下方 Five-Question 自动定位。

### Five-Question Mapping
| Question | Data Source |
|------|---------|
| 1. 正在解决什么问题？ | `.forge/plans/<topic>.md` 的 Objective 章节 |
| 2. 当前在哪一步？ | `status.md` 的 `phase` + `.forge/progress/<topic>.md` 中的"进行中"任务 |
| 3. 已知发现是什么？ | `.forge/findings/<topic>.md` |
| 4. 下一步是什么？ | `.forge/plans/<topic>.md` 的 Task Breakdown 中的下一个任务 |
| 5. 有什么阻塞？ | `.forge/progress/<topic>.md` 中的"阻塞"章节 |

当 status 含 package 字段时，问题 2 必须展示 `current_package`、`completed_packages`、`next_package`、`package_count`。恢复上下文只读取当前 package 和直接依赖 package summary，不重新注入已完成 package 的完整 task 历史。

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

定位后：读取定位阶段对应的 SKILL.md，确认当前应执行的步骤编号/名称，从该步骤继续。需要人工选择时必须调用 Claude Code `AskUserQuestion`，提供继续当前定位、重新选择活跃 package、暂停恢复三个选项。用户选择继续后自动从定位任务/package 进入对应阶段；不要要求用户自己输入 `/tinkerman build`。

### 4.1 Auto-triggered Resume

Context Exhaustion Protocol 触发时（`exhaustion_pending: true` 或新鲜 interim 文件）：
1. **跳过确认** — 耗尽协议已决定继续
2. **先读 interim 文件** — `.forge/knowledge/sessions/` 中 `-interim.md` 含最准确状态
3. **立即 Restatement** — 派发第一个 Subagent 前
4. **SKILL Reload** — 读取当前阶段 SKILL.md 从中断步骤继续
5. **从 `next_task_number` 恢复** — 无效时回退到 progress 扫描

输出 `🔄 自动恢复（上下文耗尽恢复点）` 后立即开始 TDD 循环。

## Common Rationalizations

| 合理化 | 反驳 |
|--------|------|
| "我记得上次做到哪了不需要恢复" | 上下文窗口是有限的。写下来的状态比记忆可靠，尤其是跨会话时 |
| "直接从头开始更快" | 从头开始意味着丢弃已完成的工作和已发现的问题。恢复上下文的成本远低于重做 |
| "状态文件可能过时了" | 状态文件是 Forge 的单一真理源。如果过时了，resume 会检测到并提示 |
| "我记得上次的步骤不需要重读" | compaction 后 conversation summary 是高维压缩，丢失步骤细节。重读 SKILL.md 成本极低，跳过成本极高 |

---

## 5. 从 PR 恢复（`--from-pr`）

`/tinkerman resume --from-pr <url-or-number>` → 运行 `scripts/resume-from-pr.mjs` → 输出 context bundle → 按 phase 建议下一步。

**Slug 推断**：title `[spec:slug]` → branch `forge/slug` → description `.forge/specs/slug/` → decisions → interactive。**`--from-pr` 与 `--spec` 互斥**。失败模式 → 详见 references/from-pr-failure-modes.md。

---

## 6. 边界情况处理

| 条件 | 处理 |
|------|------|
| Context compaction 恢复 | 读取当前阶段 SKILL.md 完整内容后继续。不执行 Restatement（Restatement 仅限 build 阶段）。 |
| 无 `.forge/` 目录 | ⚠️ 没有可恢复的工作上下文。请运行 /tinkerman init 或 /tinkerman 开始新任务 |
| 无 Plan 文件 | ℹ️ 未找到计划文件。运行 /tinkerman 开始新任务 |
| 无 Progress 文件 | 展示全局状态 + Plan Objective，提示"建议从 Task 1 开始执行" |
| 所有任务已完成 | 提示"Build 阶段已完成。建议运行 /tinkerman review" |
| StatusFile 缺失或不一致 | 调用 `recoverPhase()` → 从 .forge/ 文件结构推断当前阶段（plans/ → plan, progress/ → build, reviews/ → review），展示推断结果和置信度，通过 AskUserQuestion 让用户确认/调整/取消。**不自动写入磁盘** |

---

## 7. 示例

→ 详见 references/output-format.md §示例

## 8. Gotchas
- **Stale state**: status.md phase ≠ actual git state → verify git matches forge state
- **Missing context/Phase skip**: reconstruct from sessions/; verify all prior phases completed
## 9. Events.ndjson Cursor Recovery（R4）

`/tinkerman resume <run-id>` 时：读取 `.forge/runs/<run-id>/events.ndjson` → `parseEventsNdjson` 解析 → `extractLatestCursor` 获取最新游标 → 结合 `.forge/status.md` 重启 forge-loop。容错：损坏行自动跳过。
