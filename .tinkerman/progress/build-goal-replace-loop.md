---
topic: build-goal-replace-loop
tier: standard
created: "2026-05-30"
status: completed
---

# Build Progress: build-goal-replace-loop

## Task 1: build instructions /goal 循环逻辑 — ✅ 完成

- [x] 1.1 `skills/forge/lib/build/instructions.md` §3.2a /goal Mode 章节
- [x] 1.2 目标条件："所有 task 完成 AND ci_check_command 通过"
- [x] 1.3 每次迭代 TDD 步骤：RED→GREEN→REFACTOR
- [x] 1.4 Three-Strike 检测
- [x] 1.5 `build.use_goal: false` 回退行为（§3.2b）
- [x] 1.6 §2.7 No Confirmation Between Steps

**Verify-By**: code review — §3.2a (lines 119-148) 全部就位

## Task 2: persistent-loop.sh 职责缩减 — ✅ 完成

- [x] 2.1 审查 persistent-loop.sh 当前逻辑
- [x] 2.2 移除 build 内 TDD 循环重试逻辑（use_goal=true 时跳过）
- [x] 2.3 保留 phase transition 检测（Cases 5-9）
- [x] 2.4 phase=build 分支跳过逻辑（lines 376-379）

**Verify-By**: code review — Case 3 中 use_goal 检查就位

## Task 3: config.md 和 forge init 模板更新 — ✅ 完成

- [x] 3.1 `.tinkerman/config.md` 新增 `build.use_goal: true`
- [x] 3.2 `templates/config.md` 包含 `build.use_goal: true`
- [x] 3.3 注释说明 use_goal 作用

**Verify-By**: `grep 'use_goal' .tinkerman/config.md templates/config.md` — 两处均存在

## Task 4: loop instructions 更新 — ✅ 完成

- [x] 4.1 `skills/forge/lib/loop/instructions.md` §1.1 新循环机制
- [x] 4.2 /goal 驱动 build 内循环说明
- [x] 4.3 persistent-loop.sh 新职责范围说明

**Verify-By**: code review — §1.1 (lines 28-36) 就位

## Task 5: CI sandbox 安全配置 — ✅ 完成

- [x] 5.1 `plugin-validate` job 中 `SANDBOX_FAIL_IF_UNAVAILABLE: "1"`
- [x] 5.2 安全边界注释就位
- [x] 5.3 仅应用于 Claude Code step（plugin-validate）

**Verify-By**: `grep 'SANDBOX_FAIL_IF_UNAVAILABLE' .github/workflows/ci.yml` — 存在

## Task 6: 端到端验证 — ✅ 完成

- [x] 6.1 `npm run check` 通过：652 test files, 7894 tests passed
- [x] 6.2 README metrics 有基线漂移（pre-existing，非本次变更）

## Final Validation

```
npm run check: ✅ PASS (exit 0)
- tsc --noEmit: ✅
- biome check: ✅
- vitest run: 652 files, 7894 passed
- README metrics: 1 drift (total tests count, pre-existing)
```

## Commits on this branch

```
6d044908 fix(loop): correct read_field key from 'use_goal' to 'build.use_goal'
16269d6a chore: update status for build-goal-replace-loop task
9cb6ca78 feat(ci): add SANDBOX_FAIL_IF_UNAVAILABLE for plugin-validate step
215fc4d9 feat(config): add build.use_goal option for /goal TDD loop
3fd89737 fix(loop): skip TDD loop injection in persistent-loop when /goal active
```
