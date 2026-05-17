# forge zoom-out — 退后一步整体视角

> **PoC 状态**：本文件由方案 A PoC 创建，用于验证 Agent + lib/instructions.md 调度链路。
> 原 SKILL.md 仍保留在 `skills/forge-zoom-out/SKILL.md` 不动，避免破坏现状。

> **职责**：暂停当前 skill，固定三段式讲清「我在整个系统里的哪个位置」
> **输出**：无文件输出 —— 仅回话到对话框，不写 `.forge/` 任何文件

## 1. 概述

信息性辅助 skill，补足「钻太深想换口气」的轻量出口。不做诊断、不改状态、不落盘。核心原则：三段，每段 ≤ 5 行；对话结束后原 skill 从暂停点恢复。

**Not For**：定位 bug 根因（debug）· 质询需求边界（grill）· 查看任务进度（status）

## 2. Goals

Produce a three-section architecture snapshot that tells the user exactly where they are in the system, what their current focus is responsible for, and where the boundaries to neighbors lie. The snapshot must be concise enough to read in seconds and accurate enough to reorient a session that has gone deep into details.

## 3. Constraints

- Output is conversation-only: no files written to `.forge/`.
- Each of the three sections must be ≤ 5 non-empty lines. Exceeding this triggers one retry; if still exceeded, truncate to 5 lines with a truncation note.
- Must not trigger review / test / ship. Must not affect three-strike counters.
- Read-only exploration — no modifications.

## 4. OUTPUT FORMAT

Fixed three-section Markdown, each section ≤ 5 non-empty lines:

```
## 整体位置
<当前代码/决策在整个系统中的位置>

## 当前职责
<当前关注点的单一职责>

## 与邻居的边界
<与上下游模块的接口、不变量、职责边界>
```

## 5. Topic 解析

调用方传入的 `topic` 参数指定要 zoom-out 的对象（一个目录路径、一个 SKILL 名、一个文件、或描述性主题）。如果没有 topic，给出项目级总览。

## 6. PoC 执行步骤

1. 解析 topic（必填，PoC 简化）
2. 用 Glob/Grep/Read 工具收集 topic 相关的代码/文档（≤5 次工具调用）
3. 按上述三段式格式输出
4. 不要写任何文件
5. 在响应末尾追加一行：`[PoC marker] zoom-out completed via Agent + lib/instructions.md`
