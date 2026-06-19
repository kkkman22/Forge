---
title: "Deferred Decisions Ledger"
tags: ["deferred", "yagni", "tech-debt"]
date: "2026-06-18"
confidence: 0.5
---

# Deferred Decisions Ledger

> 由 `/forge learn` 自动维护。回收 build agent 在代码中留下的 `forge:defer` 注释。
> 每条代表一个"有已知上限的简化"——现在不需要，但升级触发条件到来时要动手。

## 台账

| 日期 | Feature | 文件:行 | Ceiling | 升级触发 | 升级路径 |
|------|---------|---------|---------|---------|---------|
| _(empty — `/forge learn` 会在检出 `forge:defer` 注释后填充)_ | | | | | |

## 置信度规则

- 触发条件**可量化**（QPS / 用户数 / 延迟 / 数据量）→ confidence 0.5+，保留。
- 触发条件**模糊**（"以后需要时" / "量大时"）→ confidence < 0.3，由 `maintainKnowledgeBase` 自动清理（AGENTS.md §4.2）。

## 与 known-failures.md 的区别

- `known-failures.md`：已发生的错误模式（事后教训）。
- `deferred.md`：主动延迟的决策（事前权衡）。两者正交。
