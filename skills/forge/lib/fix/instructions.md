---
description: "DEPRECATED — use /forge build with work_nature=bugfix instead. Fix a single identified defect with minimal change."
deprecated: true
dispatch_mode: inline
allowed_tools:
  - Read
  - Write
---

# /forge fix — DEPRECATED

> ⚠️ 本 skill 已退化为 `/forge build` 的 bugfix mode。
> 请使用 `/forge fix` 或 `/forge --nature=bugfix <描述>` 进入 bugfix mode。
> 独立 skill 将在下个版本移除。

本文件仅在 deprecation 期内保留入口兼容性。所有修复逻辑已迁移至：
- `../build/instructions.md` §1a Nature Mode 路由
- `../build/references/bugfix-mode.md`
- `../build/references/bugfix-method-library.md`

## 1. 概述

本 skill 已 deprecated。Bugfix 功能现在通过 `/forge build` 的 bugfix mode 提供。
