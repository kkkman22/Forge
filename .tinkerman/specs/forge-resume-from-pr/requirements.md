---
status: completed
feature: forge-resume-from-pr
layout: requirements
created: 2026-05-12
tier: standard
---
# Requirements Document

## Introduction

Claude Code 2.1.29（2026-01-30）起提供 `--from-pr <url-or-number>` 标志：恢复与指定 PR 关联的 Claude Code 会话（支持 GitHub、GitLab、Bitbucket）。CC 内部通过 `gh pr create` 时记录的 session-to-PR 映射实现。

Forge 目前的 `/forge resume` 通过读取 `.tinkerman/status.md` + `.tinkerman/progress/*.md` 推断当前工作上下文，无法跨机器/跨人恢复。典型场景：同事接手我未完成的 PR，或我在新机器上继续 review 一个开启中的 PR。

本 spec 在 Forge 中封装 CC 的 `--from-pr` 能力，加上 Forge 的状态解析：从 PR URL/number 反推关联的 spec、plan、progress 文件，并把"PR 工作上下文"注入 session。

## Glossary

- **CC_From_PR_Flag**：Claude Code 的 `claude --from-pr <url-or-number>` 和 `/resume <pr-url>` 两种入口（v2.1.29 + v2.1.122）。
- **Forge_Resume_Command**：`/forge resume`，当前从 `.tinkerman/status.md` 恢复上下文。
- **PR_Context_Bundle**：一个 PR 关联的 Forge 资源集合 — spec (`.tinkerman/specs/<slug>/`)、plan (`.tinkerman/plans/<slug>.md`)、progress (`.tinkerman/progress/<slug>.md`)、reviews (`.tinkerman/reviews/<pr>-*.md`)、ADR（若有）。
- **PR_Slug_Mapping**：PR URL/number → Forge slug 的映射关系，可能通过 PR title 前缀、branch name、或 `.tinkerman/decisions/` 中的关联记录推断。
- **Forge_Status_File**：`.tinkerman/status.md`，Forge 的跨会话状态单一事实源。
- **Remote_Git_Host**：GitHub、GitLab、Bitbucket 之一。
- **PR_Metadata_Fetcher**：通过 `gh`、`glab` 或 git 本身获取 PR title、branch、head commit、description 的模块。

## Requirements

### Requirement 1: `/forge resume --from-pr` 子命令支持

**User Story:** As a developer returning to a colleague's half-finished PR, I want a single command that restores both Claude Code session and Forge state for that PR, so that I can pick up work without manually locating the spec and plan files.

#### Acceptance Criteria

1. THE `/forge resume` command SHALL accept a new optional flag `--from-pr <url-or-number>`, which takes either a full PR URL (GitHub/GitLab/Bitbucket) or a positive integer (interpreted as PR number in the current repo's default remote).
2. WHEN `--from-pr` is provided, THE Forge_Resume_Command SHALL first invoke `claude --from-pr <value>` (or `/resume <value>` if already inside CC) to restore the Claude Code session, then apply Forge-specific state recovery.
3. IF `claude --from-pr` exits non-zero (PR not found, no session associated, CC version too old), THEN THE Forge_Resume_Command SHALL fall back to "best-effort Forge-only recovery" using the PR metadata alone.
4. WHEN `--from-pr` and no other flag is given, THE Forge_Resume_Command SHALL NOT prompt the user for spec selection; it derives everything from the PR.
5. THE `--from-pr` flag SHALL be mutually exclusive with `--spec <slug>`; when both are specified, the command exits with an error and explains.

### Requirement 2: PR_Slug_Mapping 推断

**User Story:** As a developer, I want the resume command to automatically locate the spec/plan/progress files tied to a given PR, so that I don't have to remember the slug naming conventions.

#### Acceptance Criteria

1. WHEN resolving PR to Forge slug, THE PR_Slug_Mapping module SHALL try the following sources in order: (a) PR title prefix matching `[spec:<slug>]` or `(<slug>)`; (b) PR branch name matching `forge/<slug>` or `feature/<slug>`; (c) PR description link matching `.tinkerman/specs/<slug>/`; (d) `.tinkerman/decisions/` records linking PR to spec.
2. WHEN no source yields a match, THE PR_Slug_Mapping SHALL prompt the user interactively: "未找到 PR 关联的 spec，请选择或输入 slug:"; in non-interactive mode (e.g. piped input), it fails with a clear diagnostic.
3. WHEN multiple sources yield conflicting slugs, THE PR_Slug_Mapping SHALL prefer the source with the highest specificity (explicit PR description link > title prefix > branch name) and log the resolution path in the recovery report.
4. THE PR_Slug_Mapping SHALL cache resolved mappings in `.tinkerman/.pr-slug-cache.json` (git-ignored) to speed up repeated resume operations on the same PR.

### Requirement 3: PR_Context_Bundle 加载

**User Story:** As a developer resuming work, I want the Forge session to auto-load the spec/plan/progress/reviews associated with the PR, so that my first Claude Code interaction has full context.

#### Acceptance Criteria

1. WHEN PR_Slug_Mapping resolves a slug, THE Forge_Resume_Command SHALL construct a PR_Context_Bundle containing: the spec directory (all `.md` files), the plan file, the progress file, any `.tinkerman/reviews/<pr-number>-*.md` files, any ADR linked in the spec.
2. THE Forge_Resume_Command SHALL emit a context summary (spec title, current phase, last progress checkmark, unresolved review findings) via `SessionStart` hook output, so that Claude Code sees it as part of the initial prompt.
3. IF any file in the expected PR_Context_Bundle is missing (e.g. progress file deleted, spec archived), THEN THE Forge_Resume_Command SHALL warn but not fail; missing files are listed in the context summary as "⚠ missing".
4. THE PR_Context_Bundle loader SHALL respect `.tinkerman/config.md` frozen-zone rules: frozen files are loaded read-only and flagged as such in the context summary.

### Requirement 4: PR_Metadata_Fetcher 多 Remote_Git_Host 支持

**User Story:** As a team using GitLab or Bitbucket, I want the resume command to work on our host without requiring GitHub CLI, so that the feature isn't GitHub-only.

#### Acceptance Criteria

1. THE PR_Metadata_Fetcher SHALL support three fetchers: `gh` for GitHub URLs/numbers, `glab` for GitLab URLs, and native `git` + Bitbucket REST for Bitbucket URLs.
2. WHEN only a PR number is given (no URL), THE PR_Metadata_Fetcher SHALL infer the Remote_Git_Host from `git remote get-url origin`; unknown hosts fall back to "best-effort Forge-only recovery" without fetching remote metadata.
3. WHEN the required CLI (`gh`/`glab`) is not installed, THE PR_Metadata_Fetcher SHALL emit a warning and continue with branch-name-based mapping only, without failing the whole resume.
4. THE PR_Metadata_Fetcher SHALL cap each remote call at 10 seconds; timeouts log a warning and proceed without metadata.
5. THE PR_Metadata_Fetcher SHALL NOT store PAT/token values; it relies on the host CLIs' own authentication (`gh auth login`, `glab auth login`).

### Requirement 5: Forge_Status_File 同步更新

**User Story:** As a developer, I want `--from-pr` to keep `.tinkerman/status.md` consistent with the resumed state, so that subsequent `/forge status` calls show the right PR/branch/spec.

#### Acceptance Criteria

1. WHEN `--from-pr` successfully recovers a PR_Context_Bundle, THE Forge_Resume_Command SHALL update `.tinkerman/status.md` with: the slug, current phase (inferred from progress file), the PR number, the current branch, and a timestamp.
2. IF `.tinkerman/status.md` already exists with a different slug or phase, THEN THE Forge_Resume_Command SHALL prompt: "当前 status.md 指向 <other-slug>，是否覆盖？[y/N]"; declining aborts the resume without side effects.
3. THE Forge_Resume_Command SHALL create `.tinkerman/status.md` if it doesn't exist, using the template from `templates/status.md`.
4. THE Forge_Resume_Command SHALL NOT modify any file other than `.tinkerman/status.md` and `.tinkerman/.pr-slug-cache.json` during the resume (read-only for everything else).

### Requirement 6: 失败模式与可观测性

**User Story:** As a developer debugging a broken resume, I want clear diagnostics at each failure point, so that I know whether to fix the PR, fix the CC version, or run `/forge init`.

#### Acceptance Criteria

1. WHEN any step fails (CC version too old, PR not found, metadata fetch timeout, slug mapping ambiguous), THE Forge_Resume_Command SHALL emit a structured diagnostic with: step name, error category, suggested remediation.
2. THE Forge_Resume_Command SHALL write a resume report to `.tinkerman/runs/<timestamp>-resume-from-pr.md` containing: PR URL/number, resolution path (which source yielded the slug), loaded files, warnings, and final `.tinkerman/status.md` snapshot.
3. THE Forge_Resume_Command SHALL emit an OTel event `forge.resume.from_pr` with attributes: `pr_number`, `host`, `slug`, `success`, `fallback_used`, when OTel is enabled in the environment.
4. THE resume run report SHALL be append-only (never modify existing entries) and is subject to the `findings_retention_days` policy from `.tinkerman/config.md`.

### Requirement 7: 文档与 skill contract

**User Story:** As a Forge maintainer, I want the new flag documented in the skill and README, and the contract tests updated, so that users discover the feature and CI catches regressions.

#### Acceptance Criteria

1. THE `skills/forge-resume/SKILL.md` SHALL add a section "从 PR 恢复（`--from-pr`）" documenting the flag, the slug resolution order, the interactive fallback, and failure modes.
2. THE `README.md` "快速开始" area SHALL add a mini example showing `/forge resume --from-pr <url>` as the preferred way to continue a teammate's PR.
3. THE `test/contract.skills.test.ts` SHALL assert `skills/forge-resume/SKILL.md` contains the "从 PR 恢复" section, the `--from-pr` flag documentation, and the mutual exclusion rule with `--spec`.
4. THE CHANGELOG SHALL include an entry under the next unreleased version documenting `--from-pr` support with a cross-reference to Claude Code 2.1.29.
