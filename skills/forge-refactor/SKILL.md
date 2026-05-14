---
name: forge-refactor
description: "DEPRECATED — Use /forge refactor (now routes to build refactor mode). Refactor code without changing external behavior while tests remain green."
skeleton_exempt_legacy: true
disable-model-invocation: true
---

# /forge refactor — DEPRECATED

> ⚠️ 本 skill 已退化为 `/forge build` 的 refactor mode。
> 请使用 `/forge refactor` 或 `/forge --nature=refactor <描述>` 进入 refactor mode。
> 独立 skill 将在下个版本移除。

## 1. Overview

本 skill 的所有功能已迁移至 `forge-build` 的 Nature Mode 路由。用户入口 `/forge refactor` 仍正常工作，dispatch 透传到 `forge-build`。

## 2. Migration

所有重构逻辑已迁移至：
- `skills/forge-build/SKILL.md` §1a Nature Mode 路由
- `skills/forge-build/references/refactor-mode.md`
- `skills/forge-build/references/refactor-method-library.md`
