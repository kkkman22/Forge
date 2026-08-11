---
description: "Create, update, check, and display the project charter (.forge/charter.md). Use when user runs /tinkerman charter <sub>."
updated: 2026-08-11
context: fork
dispatch_mode: fork
allowed_tools: [Read, Write, Glob, Grep, Bash]
---

# /tinkerman charter — 项目宪章管理

> **触发方式**：用户输入 `/tinkerman charter <sub>`
> **职责**：管理 `.forge/charter.md` 项目宪章的创建、更新、校验和展示
> **输出路径**：`.forge/charter.md`

---

## 1. Overview

Charter 是项目的工程策略锚定物，记录核心约束、架构边界、技术选型基线和不可变量。它不是产品管理文档，而是**跨 spec 的工程一致性保证**。

Charter 位于 `.forge/` 开放区（AI 可自由创建/修改）。

## 2. Subcommand Routing

| 子命令 | 职责 |
|--------|------|
| `init` | 交互式创建 `.forge/charter.md` |
| `update` | 交互式更新现有 charter（逐章节审视） |
| `check` | 非交互式校验 charter 与代码库一致性 |
| `show` | 显示当前 charter 内容 |
| （无子命令） | 等同于 `show` |

→ 详细流程见 `references/subcommands.md`

## 3. Charter Drift Detection

当任何下游 skill（decide/spec/plan）检测到新决策与 charter invariant 矛盾时，提供三选一：

> **下游消费者**：decide / spec / plan（做决策时对照 invariant）+ build（§2.5 Charter Grounding，写代码时注入摘要，知情不裁决）+ review（spec-check Check Item 7 Charter Compliance）。

| 选项 | 行为 |
|------|------|
| (A) 修改 charter | 更新 invariant，可能触发 major bump |
| (B) 修改决策 | 在 charter 边界内重新设计方案 |
| (C) 标记为例外 | 记录理由到变更日志，不修改 charter |

## 4. Graceful Degradation

| 条件 | 行为 |
|------|------|
| `.forge/charter.md` 不存在 | 下游 skill 正常执行，标注 `ℹ No active charter` |
| `status: draft` | 不注入 grounding，提示用户激活 |
| `status: deprecated` | 停止读取，保留文件作为历史参考 |

## 5. Grounding Summary Format

下游 skill 读取 charter 时，只注入摘要（≤500 tokens）：

```
项目宪章约束：
- 核心问题：{一句话}
- 架构边界：{模块列表 + 通信契约}
- INV-001: {标题}
- INV-002: {标题}
请评估此决策是否与以上约束冲突。
```

如 charter 过长（>150 行），只注入 invariants 和 boundaries，省略可选章节。

## 6. Version Management

| 变更类型 | 版本变更 |
|---------|---------|
| 删除/修改 invariant | Major |
| 新增 invariant/boundary/baseline | Minor |
| 描述修正/理由补充 | Patch |

Major bump 时自动扫描 `.forge/specs/` 和 `.forge/decisions/` 产出影响报告。

## 7. Constraints

- Charter 总长度不超过 150 行（含 frontmatter）
- Invariants 上限 8 条（超过说明项目需要拆分）
- Grounding 摘要 ≤500 tokens
- 模板路径：`templates/charter-template.md`

## 8. Reference Documents

| Topic | Reference |
|-------|-----------|
| Subcommand details (init/update/check/show) | references/subcommands.md |
