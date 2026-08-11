---
status: completed
feature: ultrareview-ci-integration
layout: requirements
created: 2026-05-12
tier: standard
---
# Requirements Document

## Introduction

Claude Code 2.1.120（2026-04-28）起提供 `claude ultrareview [target]` CLI 子命令，可非交互式运行并行多 agent 代码评审，支持 `--json` 原始输出、完成后 exit 0、失败 exit 1。这是 Forge `/forge review` 的 CI 侧天然补强：本地 `/forge review` 负责深度对齐 spec 与 ADR，CI 侧 `ultrareview` 负责覆盖度与每次 push 的强制闸门。

本 spec 在 Forge 中集成 `claude ultrareview --json` 作为 CI 评审通道，并打通评审证据到 `.tinkerman/reviews/` 目录的落盘。解决的问题：

- **现状**：Forge `/forge review` 依赖开发者在本地手动触发，CI 侧只跑 `npm run check`，没有 AI 参与的代码评审。
- **目标**：每次 PR 推送自动触发 `claude ultrareview --json`，结果落到 `.tinkerman/reviews/<pr-number>-ci.md`，失败则阻断合并。

本 spec 仅涉及 CI workflow、一个新的包装脚本、`.tinkerman/reviews/` 命名约定更新，不改动任何现有 skill / agent 行为。

## Glossary

- **UltraReview_CLI**：`claude ultrareview [target] [--json]` 子命令（v2.1.120 引入），target 可省略（审当前分支）或是 GitHub PR URL / 编号；`--json` 输出结构化评审结果。
- **CI_Review_Channel**：通过 CI workflow 触发的 `UltraReview_CLI` 运行通道，与本地 `/forge review` 互补。
- **Local_Review_Channel**：开发者在本地 `/forge review` 触发的评审，使用 Forge 自己的三层并行评审 agent（spec-check、quality-check、security-check）。
- **Review_Artifact**：CI 产出的评审落盘文件，路径 `.tinkerman/reviews/<pr-number>-ci.md`。
- **Forge_Review_SKILL**：`skills/forge-review/SKILL.md`，Forge 本地评审引擎定义。
- **CI_Workflow**：`.github/workflows/ci.yml` 或新文件 `.github/workflows/ultrareview.yml`。
- **Review_Wrapper**：新脚本 `scripts/run-ci-ultrareview.sh`，封装 `claude ultrareview --json` 调用 + JSON 解析 + 落盘 + exit code 处理。
- **Severity_P0_P3**：评审发现的严重度分级，P0 阻断合并，P1 需要处理但允许合并并记录 follow-up，P2/P3 仅记录。

## Requirements

### Requirement 1: Review_Wrapper 脚本封装 UltraReview_CLI

**User Story:** As a CI maintainer, I want a single script that wraps `claude ultrareview --json` with Forge conventions, so that CI workflows don't duplicate argument construction and JSON parsing.

#### Acceptance Criteria

1. THE project SHALL include a new script at `scripts/run-ci-ultrareview.sh` that accepts a single argument `<pr-number-or-url>` and internally invokes `claude ultrareview "$1" --json`.
2. WHEN `UltraReview_CLI` is not installed or not on `$PATH`, THE Review_Wrapper SHALL exit with code 2 and print a diagnostic message pointing to the Claude Code installation docs, instead of failing silently.
3. WHEN `UltraReview_CLI` exits with code 0, THE Review_Wrapper SHALL parse the JSON output, write a human-readable Markdown report to `.tinkerman/reviews/<pr-number>-ci.md`, and exit 0.
4. WHEN `UltraReview_CLI` exits with a non-zero code, THE Review_Wrapper SHALL still attempt to write the partial JSON to `.tinkerman/reviews/<pr-number>-ci.md` with a clear `[CI review failed]` header, and propagate the original exit code.
5. WHEN any parsed finding has severity P0, THE Review_Wrapper SHALL exit with code 1 regardless of `UltraReview_CLI`'s exit code, ensuring the CI step fails.
6. THE Review_Wrapper SHALL be idempotent: running it twice on the same PR number overwrites the previous artifact without error.

### Requirement 2: CI_Workflow 触发 UltraReview 并上传 artifact

**User Story:** As a reviewer, I want every pull request to automatically receive a Claude Code ultra-review report as a CI artifact, so that I can read AI findings alongside the diff without leaving the PR page.

#### Acceptance Criteria

1. THE project SHALL include a GitHub Actions workflow at `.github/workflows/ultrareview.yml` that triggers on `pull_request` events (types: `opened`, `synchronize`, `reopened`).
2. WHEN the workflow runs, THE CI_Workflow SHALL install Claude Code via the official installer (or reuse a pre-built action), authenticate using a repository secret `ANTHROPIC_API_KEY`, and invoke `scripts/run-ci-ultrareview.sh "${{ github.event.pull_request.number }}"`.
3. IF `ANTHROPIC_API_KEY` secret is not configured, THEN THE CI_Workflow SHALL skip the ultra-review step with a neutral status (not failure) and emit a workflow warning indicating the secret is missing.
4. WHEN the Review_Wrapper produces `.tinkerman/reviews/<pr-number>-ci.md`, THE CI_Workflow SHALL upload that file as a workflow artifact named `ultrareview-pr-<pr-number>`.
5. WHEN the Review_Wrapper exits with code 1 (P0 findings), THE CI_Workflow SHALL post a PR comment containing a link to the artifact and a summary of the P0 findings, and THE workflow job SHALL exit with failure status.
6. WHEN the Review_Wrapper exits with code 0, THE CI_Workflow SHALL post a PR comment indicating the review passed with counts per severity, or skip the comment if no findings were produced.

### Requirement 3: Review_Artifact 命名与结构约定

**User Story:** As a developer reading past reviews, I want CI-produced reviews to follow a predictable file naming and internal structure, so that I can correlate them with local review artifacts and spec history.

#### Acceptance Criteria

1. THE Review_Artifact SHALL be written to `.tinkerman/reviews/<pr-number>-ci.md` where `<pr-number>` is a positive integer without leading zeros.
2. THE Review_Artifact SHALL begin with a YAML frontmatter block containing: `source: "ci-ultrareview"`, `pr_number`, `commit_sha`, `branch`, `run_id`, `created_at` (ISO 8601 UTC), and `severity_counts` (map of P0/P1/P2/P3 to integer).
3. THE Review_Artifact SHALL include three markdown sections in order: `## Summary`, `## Findings` (grouped by severity, P0 first), and `## Raw JSON` (fenced code block with the unmodified UltraReview output).
4. WHEN a Local_Review_Channel artifact already exists for the same PR (e.g. `.tinkerman/reviews/<pr-number>-local.md`), THE Review_Artifact SHALL NOT overwrite it; the two artifacts coexist and may be cross-referenced.
5. THE `.tinkerman/reviews/` directory SHALL remain in the "受保护区" per `.tinkerman/config.md`: CI-produced artifacts are append-only relative to pre-existing reviews.

### Requirement 4: Forge_Review_SKILL 感知 CI_Review_Channel

**User Story:** As a developer running `/forge review` locally after a CI run, I want the local review to acknowledge the existing CI review without duplicating findings, so that review effort is not wasted.

#### Acceptance Criteria

1. WHEN `/forge review` starts and a `.tinkerman/reviews/<pr-number>-ci.md` exists for the current branch, THE Forge_Review_SKILL SHALL read that artifact's frontmatter and include its severity counts in the local review's opening context statement.
2. WHILE processing findings, IF a local finding matches a CI finding by file path + finding category, THEN THE Forge_Review_SKILL SHALL mark it as `[confirmed-by-ci]` in the local report rather than duplicate the finding.
3. THE Forge_Review_SKILL SHALL NOT block on CI review absence: when no `<pr-number>-ci.md` exists, the local review proceeds as before with no warnings.
4. THE Forge_Review_SKILL SHALL NOT modify `.tinkerman/reviews/<pr-number>-ci.md`; all CI artifacts are read-only from the local skill's perspective.

### Requirement 5: 失败模式与优雅降级

**User Story:** As a CI maintainer, I want the ultrareview integration to fail safely when upstream services are unavailable, so that a Claude Code outage does not block all PRs.

#### Acceptance Criteria

1. WHEN `UltraReview_CLI` returns a rate-limit error or authentication failure, THE Review_Wrapper SHALL write a stub `.tinkerman/reviews/<pr-number>-ci.md` noting the failure reason and exit with code 0 (non-blocking), unless `CI_ULTRAREVIEW_STRICT=1` is set.
2. WHEN `CI_ULTRAREVIEW_STRICT=1` is set in the workflow environment, THE Review_Wrapper SHALL propagate all failures as CI job failures, with no graceful degradation.
3. THE Review_Wrapper SHALL enforce a hard timeout of 15 minutes on the `UltraReview_CLI` subprocess; exceeding the timeout produces the same stub artifact as a rate-limit failure.
4. THE CI_Workflow SHALL run the ultra-review job in parallel with the existing `npm run check` job, so that a slow review never blocks the standard check pipeline.

### Requirement 6: 文档与初始化集成

**User Story:** As a new Forge adopter, I want the README and init script to surface the CI ultrareview option, so that I can opt into AI-powered CI review during project setup.

#### Acceptance Criteria

1. THE `README.md` SHALL include a new section "CI AI 评审" under the existing "🛡️ 安全与信任" area, describing the ultrareview integration, the required `ANTHROPIC_API_KEY` secret, and the opt-out path (delete `.github/workflows/ultrareview.yml`).
2. THE `scripts/init.sh` SHALL prompt the user during initialization: "是否启用 CI AI 评审（需要 ANTHROPIC_API_KEY GitHub secret）？[y/N]"; declining skips the workflow file installation.
3. WHEN the user accepts the CI review prompt during init, THE init script SHALL copy `.github/workflows/ultrareview.yml` into the project (or verify it already exists), and emit a reminder that `ANTHROPIC_API_KEY` must be set in the repo's GitHub secrets.
4. THE CHANGELOG SHALL include an entry under the next unreleased version documenting the new CI workflow, the Review_Wrapper script, and the Forge_Review_SKILL awareness of CI artifacts.
