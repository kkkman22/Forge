---
feature: local-ci-parity
layout: tasks
created: 2026-05-16
spec_ref: ".forge/specs/local-ci-parity/requirements.md"
---

# Implementation Plan: Local CI Parity

## Overview

通过三层防御消除"本地与 GitHub CI 命令漂移"导致的推送失败循环：补齐 frontmatter、SKILL 漂移检测、pre-push hook 兜底。附加 `forge init` 智能默认与知识库沉淀。

**路由档位**：Standard（多文件改动 + Spec 已锁定）。

**TDD 顺序**：先实现纯函数（Task 2、3），再修文档与配置（Task 4、5、6），最后解锁冻结区做一次性绑定（Task 1），完成后沉淀知识（Task 7）。

每个原子任务完成后立即提交。

## Tasks

- [x] 1. 解锁并补齐 .forge/config.md frontmatter（用户授权后）
  - 1.1 用户解锁后，编辑 `.forge/config.md` 的 frontmatter，在 `post_push_verify_enabled: true` 之后新增一行 `ci_check_command: "npm run check"`
  - 1.2 验证：`grep '^ci_check_command:' .forge/config.md` 返回 `ci_check_command: "npm run check"`
  - 1.3 运行 `npm run typecheck` 确认现有 `parseConfigGraceful` / `safeParseConfigFile` 不因新字段崩溃
  - 1.4 运行 `npm run check` 确认全套 CI 通过
  - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - _Commit_: `chore(config): bind ci_check_command to npm run check in frontmatter`

- [x] 2. 实现 detectCiCommandDrift 纯函数（TDD）
  - 2.1 创建 `test/ci-command-drift.test.ts`，写 7 个 unit case（design.md 单元测试表）
  - 2.2 创建 `test/ci-command-drift.property.test.ts`，写 Property 1-3 的 fast-check 测试
  - 2.3 运行测试，确认全部 RED（模块不存在）
  - 2.4 创建 `src/ci-command-drift.ts`，实现 `DriftResult` 类型与 `detectCiCommandDrift` 函数
  - 2.5 运行 `npx vitest run test/ci-command-drift` 确认全部 GREEN
  - 2.6 运行 `npm run lint` + `npm run typecheck` 通过
  - _Requirements: 2.1, 2.2, 2.5_
  - _Commit_: `feat(ci-drift): add detectCiCommandDrift pure function with property tests`

- [x] 3. 实现 suggestCiCommand 与 scripts/suggest-ci-command.mjs（TDD）
  - 3.1 创建 `test/suggest-ci-command.test.ts`，写 4 个 unit case（design.md 单元测试表）
  - 3.2 运行测试，确认 RED
  - 3.3 创建 `scripts/suggest-ci-command.mjs`，实现 `suggestCiCommand` 函数 + CLI wrapper
  - 3.4 验证 CLI：`node scripts/suggest-ci-command.mjs` 在本仓库根目录输出 `npm run check` 且退出码 0
  - 3.5 验证 CLI：在 tmp 空目录运行退出码 1（无 `package.json`）
  - 3.6 运行测试与 `npm run lint` 通过
  - _Requirements: 4.5_
  - _Commit_: `feat(init): add suggestCiCommand helper and CLI wrapper`

- [x] 4. forge-test SKILL Layer 3 集成漂移检测
  - 4.1 编辑 `skills/forge-test/SKILL.md` §2 Layer 3，在 "CI 检查命令优先级" 段落里新增 "漂移检测" 子段落，描述四种 `DriftResult` 分支的处理流程
  - 4.2 描述 `drift_with_npm_check` 时一次性写入 `.forge/findings/<topic>-ci-drift.md` 的去重逻辑
  - 4.3 在 `test/contract.test.ts` 增加断言：SKILL.md 包含 "漂移检测" 字符串
  - 4.4 运行 `bash scripts/build-dist.sh` 同步 `dist/claude-code/bundles/forge/skills/forge-test/SKILL.md`
  - 4.5 运行 `bash scripts/validate-skill-length.sh` 确认 SKILL 仍在长度上限内
  - 4.6 运行 `npm run check` 确认完整 CI 通过
  - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - _Commit_: `feat(forge-test): detect ci_check_command drift and fallback to npm run check`

- [x] 5. .githooks/pre-push 与 CONTRIBUTING 文档
  - 5.1 创建 `.githooks/pre-push`（chmod 0755），内容按 design.md Component 4
  - 5.2 在 `CONTRIBUTING.md` 增加 "Pre-push 验证" 段落，说明：(a) `git config core.hooksPath .githooks` 一次性安装，(b) `--no-verify` 应急通道，(c) `FORGE_PRE_PUSH_BRANCH` 环境变量重定向
  - 5.3 创建 `test/pre-push-hook.integration.test.ts`，验证：(a) push 到 `feature-x` 时 hook 退出 0 且不调用 `npm run check`（用桩替换 `npm`），(b) push 到 `main` 时 hook 调用 `npm run check` 桩
  - 5.4 运行 `npx vitest run test/pre-push-hook` 确认 GREEN
  - 5.5 在 `test/contract.test.ts` 增加断言：`.githooks/pre-push` 存在且模式为 `0755`
  - 5.6 运行 `bash scripts/check-doc-links.sh` + `bash scripts/check-doc-structure.sh` 确认文档变更无破链
  - 5.7 运行 `npm run check` 确认完整 CI 通过
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_
  - _Commit_: `feat(hooks): add opt-in pre-push hook for main branch CI parity`

- [x] 6. scripts/init.sh 集成智能默认
  - 6.1 编辑 `scripts/init.sh` 在 `ci_check_command` 提示前调用 `node scripts/suggest-ci-command.mjs`
  - 6.2 按 design.md Component 5 修改提示文案：检测到默认值时显示 `[npm run check]`，回车采纳
  - 6.3 在 `test/init-suggest.integration.test.ts`（新文件）写两个 case：(a) tmp 目录有 `package.json scripts.check` 时 `init.sh` 写入 `ci_check_command: "npm run check"`，(b) tmp 目录无 `package.json` 时保留原行为
  - 6.4 运行 `bash scripts/validate-scripts-help.mjs` 确认 init 脚本仍通过帮助校验
  - 6.5 运行 `npm run check` 确认完整 CI 通过
  - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - _Commit_: `feat(init): suggest npm run check as ci_check_command default when detected`

- [x] 7. /forge learn 沉淀知识
  - 7.1 运行 `/forge learn`，确认 `.forge/knowledge/known-failures.md` 新增 "frontmatter 字段在仓库 config.md 缺失" 模式条目，置信度 ≥ 0.7
  - 7.2 确认条目包含：检测信号、验证命令、修复路径、Spec 引用
  - 7.3 运行 `npm run check` 包含 `lint-evolved-rules.mjs`，确认知识文件格式合法
  - _Requirements: 5.1, 5.2, 5.3_
  - _Commit_: `docs(knowledge): record ci_check_command frontmatter drift pattern`

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["2", "3"],
      "description": "纯函数实现（detectCiCommandDrift、suggestCiCommand），可并行 TDD"
    },
    {
      "wave": 2,
      "tasks": ["4", "5", "6"],
      "description": "SKILL 集成、pre-push hook、init.sh 智能默认；4 依赖 2，6 依赖 3，5 独立"
    },
    {
      "wave": 3,
      "tasks": ["1"],
      "description": "用户授权解锁后补 frontmatter，端到端验证 SKILL 与 hook 生效"
    },
    {
      "wave": 4,
      "tasks": ["7"],
      "description": "/forge learn 沉淀知识，所有前序任务 ship 完成后触发"
    }
  ],
  "dependencies": {
    "2": [],
    "3": [],
    "4": ["2"],
    "5": [],
    "6": ["3"],
    "1": ["4", "5"],
    "7": ["1", "6"]
  }
}
```

**关键依赖说明**：

- Task 2 是 Task 4 的前置（SKILL 调用 `detectCiCommandDrift`）。
- Task 3 是 Task 6 的前置（init.sh 调用 `suggest-ci-command.mjs`）。
- Task 1 必须在 Task 4、5 之后：先让 SKILL 与 hook 具备能力，再用一次性变更证明端到端有效。
- Task 1 必须等待用户明确解锁冻结区指令；不得在 build 中静默修改。
- Task 7 是终态沉淀，必须在 Task 1-6 全部 ship 之后由 `/forge learn` 触发。

## Notes

**用户授权门**：Task 1 涉及修改 `.forge/config.md`（冻结区），按宪法 §2.2 的 `HARD-GATE: frozen-zone-protection`，build 阶段开始前必须由用户明确确认解锁。

**验证清单**（全部任务完成后核对）：

- `grep '^ci_check_command:' .forge/config.md` 返回非空
- `node scripts/suggest-ci-command.mjs` 在仓库根目录输出 `npm run check`
- `cat .githooks/pre-push` 存在且首行 `#!/usr/bin/env bash`
- `git config --get core.hooksPath` 在已配置开发者上返回 `.githooks`（手动验证）
- `npm run check` 全部通过
- `git push` 到 main 触发 hook（在测试分支模拟后回滚）
- `.forge/knowledge/known-failures.md` 含新条目

**Out of Scope**（本 spec 不做）：

- 不替换 GitHub `.github/workflows/ci.yml` 的任何 job
- 不删除或重写 `executePostPushVerify`（仍作为兜底）
- 不引入 husky / lint-staged
- 不为模板 `templates/config.md` 改默认值（保持向后兼容）
