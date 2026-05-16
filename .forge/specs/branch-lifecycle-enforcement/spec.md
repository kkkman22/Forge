---
status: locked
contract_legacy: true
created: "2026-04-29"
source: ".kiro/specs/branch-lifecycle-enforcement"
---

# Spec: Branch Lifecycle Enforcement

> 来源: `.kiro/specs/branch-lifecycle-enforcement/`

## 概述

Forge 的分支生命周期管理存在系统性缺陷：分支门禁仅做前缀匹配，缺少出口流程、topic 级校验和过期检测。引入四个纯函数模块修复。

## 需求来源

- bugfix.md — 5 个当前缺陷 (1.1–1.5)，5 个预期行为 (2.1–2.5)，7 个回归保护 (3.1–3.7)
- design.md — 根因分析、6 个正确性属性、实现方案（`src/branch-lifecycle.ts` 新模块 + `src/loop-types.ts` 新类型 + SKILL 文档更新）
- tasks.md — 4 个任务的 TDD 实现计划（bug condition test → preservation test → implementation → checkpoint）
