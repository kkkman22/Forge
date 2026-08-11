---
feature: build-goal-replace-loop
layout: tasks
created: 2026-05-30
spec_ref: ".forge/specs/build-goal-replace-loop/requirements.md"
---

# Tasks

## Task 1: build instructions /goal 循环逻辑

- [ ] 1.1 在 `skills/forge/lib/build/instructions.md` 中新增 `/goal 模式` 章节
- [ ] 1.2 定义 /goal 目标条件："所有 task 完成 AND ci_check_command 通过"
- [ ] 1.3 定义每次迭代的 TDD 步骤：RED→GREEN→REFACTOR
- [ ] 1.4 定义 Three-Strike 检测：同一 task 连续失败 3 次 → `/forge debug`
- [ ] 1.5 定义 `build.use_goal: false` 时的回退行为
- [ ] 1.6 确保遵循 §2.7 No Confirmation Between Steps

**Verify-By**: manual — `/forge build` 观察 /goal 自动循环
**关联需求**: R1, R3

## Task 2: persistent-loop.sh 职责缩减

- [ ] 2.1 审查 `scripts/persistent-loop.sh` 当前逻辑，识别 TDD 循环部分
- [ ] 2.2 移除 build 内 TDD 循环的重试逻辑
- [ ] 2.3 保留 phase transition 检测和自动触发
- [ ] 2.4 在 `phase=build` 分支中添加跳过逻辑（/goal 接管）

**Verify-By**: bash — `bash scripts/persistent-loop.sh` 在 build phase 不触发循环
**关联需求**: R2

## Task 3: config.md 和 forge init 模板更新

- [ ] 3.1 在 `.forge/config.md` 新增 `build.use_goal: true`
- [ ] 3.2 更新 `forge init` 模板（`templates/` 中的 config.md 模板）
- [ ] 3.3 添加注释说明 `use_goal` 的作用

**Verify-By**: bash — `grep 'use_goal' .forge/config.md`
**关联需求**: R3

## Task 4: loop instructions 更新

- [ ] 4.1 更新 `skills/forge/lib/loop/instructions.md` 说明新的循环机制
- [ ] 4.2 说明 /goal 驱动 build 内循环
- [ ] 4.3 说明 persistent-loop.sh 新职责范围

**Verify-By**: manual — 文档审阅
**关联需求**: R4

## Task 5: CI sandbox 安全配置

- [ ] 5.1 在 `.github/workflows/ci.yml` 中需要 Claude Code 的 step 添加 `SANDBOX_FAIL_IF_UNAVAILABLE: "1"`
- [ ] 5.2 添加注释说明安全边界目的
- [ ] 5.3 确认仅应用于需要 Claude Code 的 step

**Verify-By**: bash — `grep 'SANDBOX_FAIL_IF_UNAVAILABLE' .github/workflows/ci.yml`
**关联需求**: R5

## Task 6: 端到端验证

- [ ] 6.1 `/forge build`（use_goal=true）→ 观察 /goal 自动循环 TDD
- [ ] 6.2 连续失败 task → 确认 Three-Strike 触发 /forge debug
- [ ] 6.3 `build.use_goal: false` → 确认回退到旧 persistent-loop 行为
- [ ] 6.4 phase transition 仍正常（plan→build→review→test→ship）
- [ ] 6.5 `npm run check` 通过

**Verify-By**: manual — 全场景验证
**关联需求**: R1, R2, R3, R5, R6
