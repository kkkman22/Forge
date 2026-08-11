---
updated: 2026-08-11
description: "Use when running /tinkerman refactor (DEPRECATED — use /tinkerman build with work_nature=refactor instead)"
deprecated: true
dispatch_mode: inline
allowed_tools:
  - Read
  - Write
---

# /tinkerman refactor — DEPRECATED

> ⚠️ 本 skill 已退化为 `/tinkerman build` 的 refactor mode。
> 请使用 `/tinkerman refactor` 或 `/tinkerman --nature=refactor <描述>` 进入 refactor mode。
> 独立 skill 将在下个版本移除。

本文件仅在 deprecation 期内保留入口兼容性。所有重构逻辑已迁移至：
- `../build/instructions.md` §1a Nature Mode 路由
- `../build/references/refactor-mode.md`
- `../build/references/refactor-method-library.md`

## 1. 概述

本 skill 已 deprecated。重构功能现在通过 `/tinkerman build` 的 refactor mode 提供。
