---
name: forge-zoom-out
description: "Audit the current focus with a three-section architecture overview covering position, responsibilities, and boundaries. Use when user says zoom out, gets lost in details during skill execution, or runs `/forge zoom-out`."
skeleton_exempt_legacy: true
disable-model-invocation: true
---

# /forge zoom-out — 退后一步整体视角

> **触发**：任意 skill 执行中用户说 `zoom out` / `放大视角` / `讲整体`，或运行 `/forge zoom-out [topic]`
> **职责**：暂停当前 skill，调只读 explore subagent，固定三段式讲清「我在整个系统里的哪个位置」
> **输出**：无文件输出——仅回话到对话框，不写 `.forge/` 任何文件

## 1. Overview

信息性辅助 skill，补足「钻太深想换口气」的轻量出口。不做诊断、不改状态、不落盘。核心原则：三段，每段 ≤ 5 行；对话结束后原 skill 从暂停点恢复。

**Not For**：定位 bug 根因（`/forge debug`）· 质询需求边界（`/forge grill`）· 查看任务进度（`/forge status`）

## 2. Triggers

| 入口 | 条件 |
|---|---|
| `/forge zoom-out [topic]` | 用户主动调用 |
| `zoom out` / `放大视角` / `讲整体` | 任意 skill 执行中途，由 `isZoomOutTrigger` 识别 |

## 3. Core Workflow

五步流程，纯函数在 `src/zoom-out.ts`，driver 负责 IO：

1. **Pause** — `pauseForZoomOut(statusContent)` 把 `.forge/status.md` 的 `phase` 改为 `zoom_out_paused`，原 `phase` 存入 `original_phase`
2. **Prompt** — `buildZoomOutPrompt({ currentSkill, currentTopic, focusedFile? })` 构造 prompt
3. **Explore** — 派发 `explore` subagent（只读），拿回三段式文本解析为 `ZoomOutOutput`
4. **Validate & render** — `validateZoomOutOutput(output)` 超行返回违规，driver 可重试一次；通过则 `renderZoomOut(output)` 输出
5. **Resume** — 用户回 `continue` / `继续` 或无反应后，`resumeFromZoomOut(statusContent)` 恢复原 `phase`

## 4. Function Calls

| Function | Parameters | Returns |
|---|---|---|
| `buildZoomOutPrompt(input)` | `{ currentSkill, currentTopic, focusedFile? }` | Prompt 字符串 |
| `renderZoomOut(output)` | 三段式字段对象 | 固定三段式 Markdown |
| `validateZoomOutOutput(output)` | 同上 | `{ valid, violations[] }`；每段 ≤ 5 非空行 |
| `isZoomOutTrigger(userInput)` | 用户文本 | `boolean` |
| `pauseForZoomOut(statusContent)` | status.md 内容 | 新 status：`phase=zoom_out_paused` + `original_phase` |
| `resumeFromZoomOut(statusContent)` | 暂停后的 status | 新 status：`phase` 恢复，移除 `original_phase` |

所有函数 IO-free。

## 5. Output & No-Side-Effect 保证

固定三段式 Markdown，每段 ≤ 5 非空行：

```
## 整体位置
<当前代码/决策在整个系统中的位置>

## 当前职责
<当前关注点的单一职责>

## 与邻居的边界
<与上下游模块的接口、不变量、职责边界>
```

超行由 `validateZoomOutOutput` 判定：driver 重试一次；仍超行则截断前 5 行并附注「段落超长已截断」。

zoom-out **仅**改 `.forge/status.md` 的 `phase` / `original_phase` 作为暂停标记。除此之外不写 `.forge/findings/*`、`decisions/*`、`knowledge/*`、`progress/*`；不触发 review / test / ship；不影响 three-strike 计数器。触发前后（除这两个字段外）`.forge/` 内容完全一致，integration test 验证此不变量。

## 6. Boundary with forge-debug

| Skill | 定位 | 触发 | 是否改状态 |
|---|---|---|---|
| `/forge zoom-out` | **信息性** — 重建全局观 | 主动说 `zoom out` 或迷路 | 仅临时 pause/resume |
| `/forge debug` | **诊断性** — 质疑架构 | three-strike 重路由 | 可能改 plan / 触发 ADR |

互补而非替代。zoom-out 输出可为 debug 提供背景，但本 skill **不**介入 three-strike 机制——连败计数器由 build / review 维护，zoom-out 既不重置也不推进。

## 7. Edge Cases & Rationalizations

| 情况 / 合理化 | 处理 / 反驳 |
|---|---|
| `phase` 为空 | 跳过 pause，直接给出项目级概览 |
| 已处于 `zoom_out_paused` | `pauseForZoomOut` 幂等返回原内容 |
| Subagent 两次均超行 | 截断每段至 5 行并附注「段落超长已截断」 |
| 用户未回 continue | 下次 `/forge` 命令时 driver 先调 `resumeFromZoomOut` 再分发 |
| "我知道结构不用 zoom out" | 记忆与实际代码常漂移；5 行摘要成本极低 |
| "直接看代码就行" | 价值是**聚合**——把散落多文件的职责归纳成三段 |
| "和 status 重叠" | status 讲**任务进度**，zoom-out 讲**架构位置** |

## Common Rationalizations

| 合理化 | 反驳 |
|---|---|
| "我知道结构不用 zoom out" | 记忆与实际代码常漂移；5 行摘要成本极低 |
| "直接看代码就行" | 价值是**聚合**——把散落多文件的职责归纳成三段 |
| "和 status 重叠" | status 讲**任务进度**，zoom-out 讲**架构位置** |
