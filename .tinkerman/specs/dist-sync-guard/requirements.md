---
status: completed
feature: dist-sync-guard
layout: requirements
created: 2026-05-10
tier: standard
---
# Requirements Document

## Introduction

本特性为 Forge 增加一道 **src/dist 同步守卫**，防止"src/ 合并但 dist/ 未同步提交"的积压问题再次发生。2026-05-10 的审计暴露了这一类漂移——Sprint 1/2/3 累计添加了数十个 src/ 模块，但对应的 dist/ 产物从未随 src/ 一起提交，直到某次 `tsc` 运行才集体冒出 300+ 个 untracked 文件。这类漂移会导致运行时状态与代码状态背离（hooks 用旧 dist，新功能未生效），且靠人工 review 极难察觉。

问题陈述：Forge 的 dist/ 是 tracked in git（hooks.json 直接引用 `dist/src/check-frozen.js`、分发脚本 `scripts/build-dist.sh` 也读 dist/），因此 dist/ 必须与 src/ 保持同步。但目前没有任何自动化机制强制"改 src/ 必须同步 dist/"，仅靠开发者自律。实际上自律失效——Sprint 1/2/3 三位开发者各自忙于 src/ 功能代码，dist/ 默认被遗忘。

价值来源：

1. **漂移检测**：CI 中强制校验 "git tracked src/ 与 dist/ 一致"，有漂移即 fail
2. **一键修复**：提供 `npm run dist:resync` 让开发者本地一条命令完成 dist 同步，降低修复摩擦
3. **预防累积**：每个 PR 都必须带上对应 dist 变更，不再出现"几个 Sprint 后漂移 300 文件"
4. **低成本**：完全基于现有 tsc + git 工具链，不引入新依赖

架构选择（两层守卫）：本特性采用 **CI 层硬门禁 + 本地层便利工具** 双层架构。CI 层是强制的，PR 不过就 block。本地层是便利性的，开发者可选择用它自动处理也可手工。**不做** pre-commit hook 因为那会强制本地必须装 husky 类工具，成本高且容易被 `--no-verify` 绕过。

关键约束：

- **零运行时依赖**：实现完全基于 `tsc` / `git status` / 标准 shell 命令
- **不破坏既有流程**：现有 `npm run check` 和 `scripts/build-dist.sh` 继续工作
- **增量友好**：守卫首次启用时不追溯历史漂移（由 2026-05-10 的 `078e482` commit 一次性消除），只防止未来漂移
- **明确错误提示**：fail 时告诉开发者"运行 `npm run dist:resync` + commit dist/ 修复"

## Glossary

- **Dist_Sync_Guard**：本特性的统称。由 CI 校验器 + 本地 resync 脚本 + 文档约定组成的三件套。
- **Tracked_Src_Files**：被 git 跟踪的 `src/**/*.ts` 文件集合（不包括 `.d.ts`，不包括 `src/` 外的 TS 源文件）。
- **Tracked_Dist_Files**：被 git 跟踪的 `dist/src/**/*.js` + `dist/src/**/*.d.ts` 文件集合（对应 src 编译产物）。
- **Dist_Drift**：存在以下三种情况之一：
  - (A) `src/foo.ts` 存在但 `dist/src/foo.js` 不存在（新加的 src 未提交 dist）
  - (B) `dist/src/foo.js` 存在但 `src/foo.ts` 不存在（删除的 src 未删 dist）
  - (C) `dist/src/foo.js` 和 `src/foo.ts` 都在，但跑一次 `tsc` 后 `dist/src/foo.js` 有未提交修改（编译结果不一致）
- **Dist_Sync_Check**：CI 中运行的校验脚本 `scripts/check-dist-sync.mjs`。检测到任一 Dist_Drift 即 exit 1。
- **Dist_Resync_Script**：本地便利脚本 `scripts/dist-resync.sh`。一键跑 `tsc` 清理残留并 stage 所有 dist/ 变更。
- **Dogfooding_Baseline**：本 spec 启用前的最后一次 dist 全量同步 commit（`078e482` "chore(dist): resync"）。守卫的有效性以此 commit 之后的 dist 维持同步为标准。
- **Emergency_Bypass**：某些罕见情况（紧急 hotfix，src/ 和 dist/ 必须分开 commit）允许临时绕过。通过 commit message 含 `[dist-sync-skip]` 标签实现。

## Requirements

### Requirement 1: CI 层漂移检测

**User Story:** As a Forge maintainer, I want CI to fail any PR that leaves dist/ out of sync with src/, so that accumulated drift like the 2026-05-10 incident never happens again.

#### Acceptance Criteria

1. THE `scripts/check-dist-sync.mjs` SHALL be a Node.js script runnable via `node scripts/check-dist-sync.mjs` that performs these checks in sequence:
   - (A) For each `src/**/*.ts` file (excluding `*.d.ts`), verify that corresponding `dist/src/**/*.js` and `dist/src/**/*.d.ts` files exist and are tracked by git.
   - (B) For each `dist/src/**/*.js` file, verify that the corresponding `src/**/*.ts` source exists.
   - (C) Run `tsc --noEmit` first to ensure TS compiles cleanly. Then run `tsc` (with emit) to a **temporary outDir** (e.g., `.tinkerman/.dist-sync-check/`); diff the temp output against the tracked `dist/` to detect compilation drift.
2. WHEN any check fails, the script SHALL exit with code 1 and print a human-readable report listing affected files and the specific drift category (missing in dist / orphan in dist / compilation mismatch).
3. WHEN all checks pass, the script SHALL exit 0 with a one-line summary `dist-sync: OK — {N} src files matched with dist/`.
4. THE script SHALL clean up its temp outDir (`.tinkerman/.dist-sync-check/`) before exiting, regardless of success or failure.
5. THE script SHALL be added to `package.json` `check` script (same place as `verify-evolved-rule-infra-refs.mjs`).
6. THE script SHALL also be added to `.github/workflows/ci.yml` as a step named "Verify dist sync" (or confirmed already covered by `npm run check`).
7. THE script SHALL be **skippable** when the commit being checked has `[dist-sync-skip]` in its commit message OR when env `FORGE_SKIP_DIST_SYNC=1` is set. Skip SHALL be logged loudly with a warning so reviewers notice.

### Requirement 2: 本地一键同步工具

**User Story:** As a Forge contributor, I want a single command to regenerate dist/ and stage it for commit, so that fixing dist sync doesn't require knowing tsc internals.

#### Acceptance Criteria

1. THE `scripts/dist-resync.sh` SHALL be a shell script that:
   - Deletes any `.tsbuildinfo` cache file to ensure a full rebuild.
   - Runs `npx tsc` to regenerate dist/.
   - Runs `git status dist/` and prints a summary of changed files.
   - Asks the user (interactive) whether to stage the changes: `y` to run `git add dist/`; any other input to leave unstaged.
   - Supports `--yes` flag to skip interactive prompt and auto-stage.
2. THE script SHALL be added to `package.json` `scripts` as `dist:resync` calling the shell script.
3. WHEN the working tree has untracked dist/ files before running, the script SHALL list them explicitly (so users know what will be staged).
4. THE script SHALL NOT commit or push on the user's behalf — staging only.
5. THE script SHALL print a guidance line at the end: `Done. Commit with: git commit -m "chore(dist): resync"` when changes exist.

### Requirement 3: CONTRIBUTING.md 约定

**User Story:** As a new Forge contributor, I want the dist-sync requirement documented in CONTRIBUTING.md, so that I understand why my PR was blocked and how to fix it.

#### Acceptance Criteria

1. THE `CONTRIBUTING.md` SHALL gain a new section "dist/ Sync Requirement" under an appropriate existing heading (e.g., "Pull Request Checklist" or under Code Style).
2. THE section SHALL document:
   - Why dist/ is tracked (hooks.json + distribution bundle need committed JS)
   - The rule: "every PR modifying `src/**/*.ts` must include corresponding `dist/src/**` changes in the same PR"
   - How to fix: `npm run dist:resync` + `git add dist/` + `git commit`
   - The CI check that enforces this (`npm run check` invokes `check-dist-sync.mjs`)
   - The emergency bypass (`[dist-sync-skip]` commit message tag, use sparingly)
3. THE section SHALL cross-reference the 2026-05-10 incident as motivation (link to the audit report or the `078e482` commit).

### Requirement 4: evolved-rules R6 条目

**User Story:** As an AI agent starting a session where src/ changes are imminent, I want an evolved-rule reminder that dist/ must be synced, so that I don't repeat the 2026-05-10 drift.

#### Acceptance Criteria

1. THE `.tinkerman/knowledge/evolved-rules.md` SHALL gain a new entry R6 titled "src/dist 同步是 PR 合约一部分".
2. R6 SHALL reference the Infra_Ref pointing to `scripts/check-dist-sync.mjs` + `CONTRIBUTING.md` section.
3. R6 `Confidence` SHALL be 0.85 (new rule, to be validated by absence of future drift).
4. THE frontmatter `rule_count` SHALL update from 5 to 6.
5. R6 SHALL NOT duplicate the full guard logic (that lives in the scripts and CI) — it only reminds the AI agent to stage dist/ alongside src/.

### Requirement 5: 非功能需求

**User Story:** As a Forge maintainer, I want the guard to be fast, maintainable, and non-flaky.

#### Acceptance Criteria

1. PERFORMANCE: `check-dist-sync.mjs` SHALL complete in ≤30 seconds on the current Forge repo size (~300 src/ files).
2. DETERMINISM: The script SHALL produce identical output for identical git states (no timestamp sensitivity in checksums).
3. FALSE-POSITIVE AVOIDANCE: The script SHALL ignore files that tsc intentionally skips (e.g., `src/**/*.test.ts` if excluded from rootDir output, though current tsconfig emits test/ too — verify the tsconfig's include behavior and match it).
4. ERROR CLARITY: On failure, the error message SHALL include the specific missing files and the exact command to fix (`npm run dist:resync`).
5. ZERO-NEW-DEPENDENCIES: The script SHALL rely only on existing devDeps (typescript, node built-ins). No `rimraf`, no `globby`, no new npm packages.
6. UNIT-TESTED: A test file `test/dist-sync.test.ts` SHALL verify the script's core logic (missing-in-dist detection, orphan detection, compilation-diff detection) using fast-check property tests or minimal fixtures under `test/fixtures/dist-sync/`.
