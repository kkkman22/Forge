---
updated: 2026-08-11
description: "Use when user says zoom out, gets lost in details during skill execution, or runs `/tinkerman zoom-out`"
context: fork

dispatch_mode: fork
allowed_tools:
  - Read
  - Glob
  - Grep
---

# /tinkerman zoom-out — 退后一步整体视角

> **触发**：任意 skill 执行中用户说 `zoom out` / `放大视角` / `讲整体`，或运行 `/tinkerman zoom-out [topic]`
> **职责**：暂停当前 skill，调只读 explore subagent，固定三段式讲清「我在整个系统里的哪个位置」
> **输出**：无文件输出——仅回话到对话框，不写 `.forge/` 任何文件

## 1. 概述

信息性辅助 skill，补足「钻太深想换口气」的轻量出口。不做诊断、不改状态、不落盘。核心原则：三段，每段 ≤ 5 行；对话结束后原 skill 从暂停点恢复。

**Not For**：定位 bug 根因（`/tinkerman debug`）· 质询需求边界（`/tinkerman grill`）· 查看任务进度（`/tinkerman status`）

## Triggers

| 入口 | 条件 |
|---|---|
| `/tinkerman zoom-out [topic]` | 用户主动调用 |
| `zoom out` / `放大视角` / `讲整体` | 任意 skill 执行中途，由 `isZoomOutTrigger` 识别 |

## Goals

Produce a three-section architecture snapshot that tells the user exactly where they are in the system, what their current focus is responsible for, and where the boundaries to neighbors lie. The snapshot must be concise enough to read in seconds and accurate enough to reorient a session that has gone deep into details.

## Constraints

- Output is conversation-only: no files written to `.forge/` (except temporary `phase` / `original_phase` markers in `status.md` for pause/resume).
- Each of the three sections must be ≤ 5 non-empty lines. Exceeding this triggers one retry; if still exceeded, truncate to 5 lines with a truncation note.
- The only state mutation is setting `.forge/status.md` phase to `zoom_out_paused` (saving `original_phase`) and later restoring it. Everything else in `.forge/` must be identical before and after.
- Must not trigger review / test / ship. Must not affect three-strike counters.
- Must use a read-only explore subagent for gathering architecture context — no modifications.
- Must restore the original skill phase after zoom-out completes (user says `continue`/`继续`, or next `/tinkerman` command auto-resumes).

## Edge Cases

| 情况 | 处理 |
|---|---|
| `phase` 为空 | Skip pause, give project-level overview directly |
| Already in `zoom_out_paused` | Idempotent — return existing content unchanged |
| Both retries exceed line limit | Truncate each section to 5 lines with truncation note |
| User never says continue | Next `/tinkerman` command auto-resumes before dispatch |

## Boundary with forge-debug

- **zoom-out** is informational — rebuilds global mental model. Triggers on user request. Only temporary pause/resume.
- **debug** is diagnostic — questions architecture. Triggers on three-strike reroute. May change plan or trigger ADR.
- Complementary, not interchangeable. zoom-out output can feed debug context, but zoom-out must not interfere with three-strike mechanics.

## OUTPUT FORMAT

Fixed three-section Markdown, each section ≤ 5 non-empty lines:

```
## 整体位置
<当前代码/决策在整个系统中的位置>

## 当前职责
<当前关注点的单一职责>

## 与邻居的边界
<与上下游模块的接口、不变量、职责边界>
```

## Gotchas
- **Lost in details**: Zoom-out reads too many files → becomes another deep-dive → focus on interfaces and responsibilities, skip implementation
- **Stale architecture view**: Architecture changed since last zoom-out → outdated mental model → always verify against current code
- **No action items**: Zoom-out produces description but no actionable findings → wasted effort → always include recommendations
