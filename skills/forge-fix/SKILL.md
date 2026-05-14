---
name: forge-fix
description: "DEPRECATED — Use /forge fix (now routes to build bugfix mode). Fix a single identified defect with minimal change and without rerunning full build."
skeleton_exempt_legacy: true
disable-model-invocation: true
---

# /forge fix — DEPRECATED

> ⚠️ 本 skill 已退化为 `/forge build` 的 bugfix mode。
> 请使用 `/forge fix` 或 `/forge --nature=bugfix <描述>` 进入 bugfix mode。
> 独立 skill 将在下个版本移除。

## 1. Overview

本 skill 的所有功能已迁移至 `forge-build` 的 Nature Mode 路由。用户入口 `/forge fix` 仍正常工作，dispatch 透传到 `forge-build`。

## 2. Migration

所有修复逻辑已迁移至：
- `skills/forge-build/SKILL.md` §1a Nature Mode 路由
- `skills/forge-build/references/bugfix-mode.md`
- `skills/forge-build/references/bugfix-method-library.md`
