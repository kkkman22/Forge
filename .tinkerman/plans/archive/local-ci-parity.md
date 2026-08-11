---
topic: "local-ci-parity"
status: "approved"
date: "2026-05-16"
spec_ref: ".kiro/specs/local-ci-parity"
format: "lightweight"
---

# Plan: Local CI Parity

> 来源: `.kiro/specs/local-ci-parity/tasks.md`

## Objective

消除"本地与 GitHub CI 命令不一致"导致的推送失败循环。三层防御：frontmatter 补齐、SKILL 漂移检测、pre-push hook 兜底。附加 `forge init` 智能默认。

## Research Findings

- **`.tinkerman/config.md` frontmatter 缺 `ci_check_command`**：仅 body 有说明文字，SKILL Layer 3 走逐项回退分支
- **`.githooks/` 目录存在但无 `pre-push`**：需新建
- **`package.json scripts.check` 已存在**：完整 CI 命令可用
- **`scripts/init.sh` 已有 `ci_check_command` 提示段**：需增加智能默认
- **`src/ci-command-drift.ts` 不存在**：需新建纯函数模块

## File Mapping

| File Path | Operation | Description |
|-----------|-----------|-------------|
| `src/ci-command-drift.ts` | CREATE | `detectCiCommandDrift` 纯函数 + `DriftResult` 类型 |
| `scripts/suggest-ci-command.mjs` | CREATE | `suggestCiCommand` 纯函数 + CLI wrapper |
| `.githooks/pre-push` | CREATE | pre-push hook（main 分支拦截 npm run check） |
| `test/ci-command-drift.test.ts` | CREATE | 7 个 unit case |
| `test/ci-command-drift.property.test.ts` | CREATE | Property 1-3 fast-check 测试 |
| `test/suggest-ci-command.test.ts` | CREATE | 4 个 unit case |
| `test/pre-push-hook.integration.test.ts` | CREATE | hook 集成测试 |
| `skills/forge-test/SKILL.md` | MODIFY | Layer 3 漂移检测子段落 |
| `scripts/init.sh` | MODIFY | ci_check_command 智能默认 |
| `CONTRIBUTING.md` | MODIFY | Pre-push 验证段落 |
| `.tinkerman/config.md` | MODIFY | frontmatter 加 `ci_check_command: "npm run check"`（冻结区，需用户解锁） |
| `test/contract.test.ts` | MODIFY | 新增断言（SKILL 漂移检测、githooks 存在性） |

## Tasks

### Task 1: detectCiCommandDrift 纯函数（TDD）

**Depends On**: []
**Files**: `src/ci-command-drift.ts` (CREATE), `test/ci-command-drift.test.ts` (CREATE), `test/ci-command-drift.property.test.ts` (CREATE)

**RED**: 写 7 个 unit case + 3 个 property test，确认模块不存在
**GREEN**: 实现 `DriftResult` 类型 + `detectCiCommandDrift(frontmatter, packageJsonRaw)` 函数
**REFACTOR**: 清理
**Verify**: `npx vitest run test/ci-command-drift` + `npm run lint` + `npm run typecheck`
**Commit**: `feat(ci-drift): add detectCiCommandDrift pure function with property tests`
**Requirements**: 2.1, 2.2, 2.5

### Task 2: suggestCiCommand 纯函数 + CLI（TDD）

**Depends On**: []
**Files**: `scripts/suggest-ci-command.mjs` (CREATE), `test/suggest-ci-command.test.ts` (CREATE)

**RED**: 写 4 个 unit case，确认模块不存在
**GREEN**: 实现 `suggestCiCommand(packageJsonRaw)` 函数 + CLI wrapper
**REFACTOR**: 清理
**Verify**: `npx vitest run test/suggest-ci-command` + CLI 手动验证
**Commit**: `feat(init): add suggestCiCommand helper and CLI wrapper`
**Requirements**: 4.5

### Task 3: forge-test SKILL Layer 3 漂移检测

**Depends On**: ["1"]
**Files**: `skills/forge-test/SKILL.md` (MODIFY), `test/contract.test.ts` (MODIFY)

- SKILL.md §Layer 3 增加"漂移检测"子段落，四种 DriftResult 分支处理流程
- contract.test.ts 增加 SKILL.md 包含"漂移检测"字符串断言
**Verify**: `bash scripts/build-dist.sh` + `bash scripts/validate-skill-length.sh` + `npm run check`
**Commit**: `feat(forge-test): detect ci_check_command drift and fallback to npm run check`
**Requirements**: 2.1, 2.2, 2.3, 2.4

### Task 4: .githooks/pre-push + CONTRIBUTING 文档

**Depends On**: []
**Files**: `.githooks/pre-push` (CREATE), `CONTRIBUTING.md` (MODIFY), `test/pre-push-hook.integration.test.ts` (CREATE), `test/contract.test.ts` (MODIFY)

- `.githooks/pre-push`（chmod 0755）：仅 refs/heads/main 时跑 npm run check
- CONTRIBUTING.md 增加 Pre-push 验证段落
- 集成测试：feature 分支跳过、main 分支拦截
- contract 断言：.githooks/pre-push 存在且 0755
**Verify**: `npx vitest run test/pre-push-hook` + `bash scripts/check-doc-links.sh` + `npm run check`
**Commit**: `feat(hooks): add opt-in pre-push hook for main branch CI parity`
**Requirements**: 3.1–3.8

### Task 5: scripts/init.sh 智能默认

**Depends On**: ["2"]
**Files**: `scripts/init.sh` (MODIFY)

- ci_check_command 提示前调用 `node scripts/suggest-ci-command.mjs`
- 检测到默认值时显示 `[npm run check]`，回车采纳
**Verify**: `bash scripts/validate-scripts-help.mjs` + `npm run check`
**Commit**: `feat(init): suggest npm run check as ci_check_command default when detected`
**Requirements**: 4.1, 4.2, 4.3, 4.4

### Task 6: 补齐 .tinkerman/config.md frontmatter（冻结区）

**Depends On**: ["3", "4"]
**Files**: `.tinkerman/config.md` (MODIFY)

- 用户解锁后，frontmatter 新增 `ci_check_command: "npm run check"`
**Verify**: `grep '^ci_check_command:' .tinkerman/config.md` + `npm run typecheck` + `npm run check`
**Commit**: `chore(config): bind ci_check_command to npm run check in frontmatter`
**Requirements**: 1.1, 1.2, 1.3, 1.4

### Task 7: /forge learn 知识沉淀

**Depends On**: ["6", "5"]
**Files**: `.tinkerman/knowledge/known-failures.md` (MODIFY)

- 运行 `/forge learn` 沉淀 ci_check_command frontmatter 漂移模式
**Verify**: `npm run check`（含 lint-evolved-rules.mjs）
**Commit**: `docs(knowledge): record ci_check_command frontmatter drift pattern`
**Requirements**: 5.1, 5.2, 5.3

## Dependency Graph

```
Wave 1 (并行): Task 1 + Task 2
Wave 2 (并行): Task 3 (←1) + Task 4 + Task 5 (←2)
Wave 3:        Task 6 (←3, ←4)
Wave 4:        Task 7 (←6, ←5)
```

## Notes

- Task 6 涉及冻结区 `.tinkerman/config.md`，需用户明确授权解锁
- Task 7 通过 `/forge learn` 触发，非手动编辑
- R6: src/dist 同步 — Task 3 修改 SKILL.md 后需 `bash scripts/build-dist.sh`
