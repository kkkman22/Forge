---
feature: forge-gate-shared-protocol
layout: tasks
created: 2026-06-04
spec_ref: ".forge/specs/forge-gate-shared-protocol/requirements.md"
---

# Implementation Plan: Gate 共享协议提取

## Overview

小改动 — 提取 2 个 Gate 的共享结构到独立 reference，减少漂移。1 个新增文件，2 个修改文件。预估 1 小时。

## Task Breakdown

### Task 1: 创建共享 Gate 协议文档
- **Goal**: 创建 `skills/forge/lib/shared/references/gate-protocol.md`，参数化定义 Tier 路由/提问方式/回答注入/反馈日志
- **File**: `skills/forge/lib/shared/references/gate-protocol.md` (NEW)
- **Verify**: 文件存在且包含参数表
- **Commit**: `docs: add shared gate protocol reference`
- **Depends On**: `[]`

### Task 2: decide 引用共享协议
- **Goal**: 删除 decide Round 0.5 中 4 个共享子节的内联定义，替换为 reference 引用
- **File**: `skills/forge/lib/decide/instructions.md`
- **Verify**: `grep -c "gate-protocol" skills/forge/lib/decide/instructions.md` ≥ 1
- **Commit**: `refactor(decide): reference shared gate protocol`
- **Depends On**: `[1]`

### Task 3: spec 引用共享协议
- **Goal**: 删除 spec Step 0.5 中 4 个共享子节的内联定义，替换为 reference 引用
- **File**: `skills/forge/lib/spec/instructions.md`
- **Verify**: `grep -c "gate-protocol" skills/forge/lib/spec/instructions.md` ≥ 1
- **Commit**: `refactor(spec): reference shared gate protocol`
- **Depends On**: `[1]`

### Task 4: Manifest 更新 + CI 验证
- **Goal**: 更新 manifest.json SHA256，确认 `npm run check` 通过
- **Verify**: 0 新增测试失败
- **Commit**: `chore: update manifest SHA256`
- **Depends On**: `[2, 3]`
