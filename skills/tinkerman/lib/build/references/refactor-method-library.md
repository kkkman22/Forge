---
updated: 2026-08-11
---
# Refactor Method Library

> 条件加载：仅当 `work_nature=refactor` 时加载到 build 上下文。

## L1 — 行为等价迁移（最低风险）

Rename | Move | Extract Constant | Extract Type | Inline

## L2 — Fowler 经典（中等风险）

Extract Method (>30行) | Extract Class | Replace Conditional with Polymorphism | Introduce Parameter Object (>3参数) | Replace Temp with Query | Encapsulate Field

## L3 — 结构拆分（较高风险）

Split Module | Split Class | Introduce Facade | Extract Layer

## L4 — 性能（需要度量验证）

Lazy Loading | Caching | Batch Processing | Memoization
