---
status: completed
feature: local-ci-parity
layout: requirements
created: 2026-05-16
tier: standard
---
# Requirements Document

## Introduction

Forge 项目本身在功能分支或 worktree 合并 main 后，推送远程时 GitHub CI 反复报错。根因不是 CI 配置错误，而是"本地与 CI 命令不一致"——本地从未真正跑过 GitHub CI 实际执行的 `npm run check`。

**现状链路**：

1. GitHub `.github/workflows/ci.yml` 的 `check` job 等价于 `npm run check`，包含 16 条以上的子检查（`tsc --noEmit`、`biome check`、`vitest run`、`check-public-api.mjs`、`check-readme-metrics.sh`、`check-skill-function-refs.sh`、`validate-skill-descriptions.sh`、`validate-skill-length.sh`、`validate-skill-skeleton.sh`、`check-evolution-marker-zones.sh`、`validate-scripts-help.mjs`、`lint-evolved-rules.mjs`、`verify-evolved-rule-infra-refs.mjs`、`check-dist-sync.mjs`、`check-doc-links.sh`、`check-doc-structure.sh`）。
2. `forge-test` SKILL Layer 3 的设计：读取 `.forge/config.md` **frontmatter** 的 `ci_check_command` 字段，非空则执行该命令；为空则逐项回退（AI 自行拼凑 typecheck/lint/test 三件套）。
3. **缺陷**：本仓库 `.forge/config.md` 的 frontmatter 缺少 `ci_check_command` 字段（仅 body 里有说明文字，SKILL 看不见）。导致 `/forge test` 永远走逐项回退分支，每次都漏掉十余条校验。
4. `forge-ship` §9 Post-Push Verify 兜底跑一遍 `npm run check`，但触发时机在 push 之后，与 GH CI 同步失败，对预防无意义。
5. dogfooding finding 4（2026-04-29）已记录此漏洞并定义了 `ci_check_command` 机制，但忘记在本仓库 config 里实际写入字段值。

**改进目标**：消除本地与 CI 的命令漂移，确保任何推送到远程的代码都已在本地通过 `npm run check`。

**设计决策**：

- 不修改 GitHub workflow，CI 仍是真理来源。
- 不强制所有项目改文件结构，只补本仓库缺失字段并增强 SKILL 防漂移。
- 不引入新工具，复用 git hooks 与现有 SKILL 体系。

**明确不做的事情**：不替换 Post-Push Verify（保留兜底）；不阻断本地开发循环（hook 仅作用于 push）；不扫描非本仓库项目（修复仅针对 Forge 自身）。

## Glossary

- **`ci_check_command`**：`.forge/config.md` frontmatter 中的字段，声明项目完整 CI 检查命令。
- **漂移（drift）**：本仓库 frontmatter 缺该字段，但 `package.json scripts.check` 已存在的状态。
- **三件套**：AI 自行拼凑的 `tsc --noEmit + biome check + vitest run`，缺少 `npm run check` 的其余十余条校验。
- **`forge_exec`**：Forge 提供的命令执行 + server-side trimming MCP 工具。
- **冻结区**：`.forge/config.md` 等文件按宪法 §2.2 受 `HARD-GATE` 保护，必须用户解锁才能修改。

## Requirements

### Requirement 1: 补齐本仓库 ci_check_command frontmatter 绑定

**User Story:** 作为 Forge 维护者，我希望 `.forge/config.md` frontmatter 显式声明 CI 命令，以便 `/forge test` Layer 3 自动跑完整命令而非逐项回退。

#### Acceptance Criteria

1. THE `.forge/config.md` frontmatter SHALL include a `ci_check_command` field with value `"npm run check"`.
2. THE field value SHALL exactly match the `scripts.check` command defined in `package.json`.
3. WHEN `forge-test` SKILL Layer 3 reads the frontmatter, THE check SHALL detect `ci_check_command` and trigger the single-command execution path instead of the fallback path.
4. THE update SHALL be performed via explicit user unlock of the frozen zone (per `HARD-GATE: frozen-zone-protection`); the change SHALL NOT be made silently.

### Requirement 2: SKILL 漂移防御

**User Story:** 作为任何 Forge 用户，当我的 `.forge/config.md` 没有声明 `ci_check_command` 但 `package.json` 已有 `scripts.check` 时，我希望 SKILL 给出醒目警告并自动降级到 `npm run check`，避免再次发生"模板有字段、仓库忘补"的漂移。

#### Acceptance Criteria

1. WHERE `.forge/config.md` frontmatter does NOT contain `ci_check_command` AND `package.json` exists AND `scripts.check` is defined, THE `forge-test` SKILL Layer 3 SHALL output a warning identifying the drift.
2. THE warning SHALL include three pieces of information: (a) the missing config field name, (b) the detected `npm run check` candidate, (c) instructions to add the field to frontmatter.
3. WHEN the drift is detected, THE SKILL SHALL fallback to executing `npm run check` directly, NOT the AI-assembled three-piece (`tsc + biome + vitest`).
4. WHERE `.forge/config.md` frontmatter does NOT contain `ci_check_command` AND no `package.json scripts.check` is defined, THE existing per-item fallback path SHALL remain unchanged (backward compatible).
5. THE drift detection logic SHALL be implemented as a pure function `detectCiCommandDrift(frontmatter, packageJson): DriftResult` in `src/ci-command-drift.ts` (new module) with property tests covering all four cases.

### Requirement 3: pre-push git hook 兜底

**User Story:** 作为 Forge 维护者，无论 SKILL 是否被遵守，我希望本地 git push 之前自动运行一次 `npm run check`，将"本地绿、CI 红"的差距彻底消除。

#### Acceptance Criteria

1. THE repository SHALL provide a tracked git hooks directory (`.githooks/`) containing a `pre-push` script.
2. THE `pre-push` script SHALL run `npm run check` only when the push targets `refs/heads/main` (other branches skip silently).
3. WHEN `npm run check` exits non-zero, THE hook SHALL block the push with a clear message including the failed command and exit code.
4. WHEN `npm run check` exits zero, THE hook SHALL allow the push without additional output.
5. THE repository SHALL document hook installation in `CONTRIBUTING.md` (or equivalent), recommending `git config core.hooksPath .githooks` as a one-time setup.
6. THE installation SHALL NOT be auto-enforced (developers must opt-in by setting `core.hooksPath`); this avoids surprising fresh clones.
7. THE hook SHALL be idempotent: re-running it produces the same result given the same working tree.
8. WHEN the developer wishes to skip the hook, THE hook SHALL respect `git push --no-verify` (default git behavior, no extra logic needed).

### Requirement 4: forge init 智能默认

**User Story:** 作为新建 Forge 项目的开发者，初始化时如果项目已有 `npm run check`，我希望 `forge init` 自动在交互提示里把它作为默认值，避免漂移从第一天就埋下。

#### Acceptance Criteria

1. WHEN `scripts/init.sh` runs the `ci_check_command` interactive prompt, IF `package.json` exists AND `scripts.check` is defined, THE prompt SHALL display the detected command as the default suggestion (e.g. `[npm run check]`).
2. WHEN the user accepts the default by pressing Enter, THE generated `.forge/config.md` frontmatter SHALL contain `ci_check_command: "npm run check"`.
3. WHEN the user types a different value, THE typed value SHALL be sanitized and written verbatim.
4. WHERE no `package.json` exists OR `scripts.check` is not defined, THE existing prompt behavior SHALL remain unchanged.
5. THE detection SHALL use a pure function `suggestCiCommand(packageJsonContent): string | null` with unit tests for: (a) valid `scripts.check` returns `"npm run check"`, (b) missing `scripts.check` returns `null`, (c) missing `package.json` returns `null`, (d) malformed JSON returns `null` without throwing.

### Requirement 5: 知识库沉淀

**User Story:** 作为 Forge 维护者，我希望本次根因分析与修复方案进入知识库，避免未来重复诊断同一类漂移问题。

#### Acceptance Criteria

1. WHEN this spec is shipped, THE `.forge/knowledge/known-failures.md` SHALL append an entry: "frontmatter 字段在仓库 config.md 缺失但模板存在，导致 SKILL 走回退分支" with confidence ≥ 0.7.
2. THE entry SHALL include: (a) detection signal (CI failures from missing checks the AI did not run), (b) verification command (`grep ci_check_command .forge/config.md`), (c) fix reference (this spec ID).
3. THE entry SHALL be written via `/forge learn` after Task 5 completion, NOT manually edited mid-build.
