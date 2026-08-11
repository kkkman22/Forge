---
status: completed
feature: ship-gate-commit-verification
layout: requirements
created: 2026-05-01
tier: standard
---
# Requirements Document

## Introduction

Forge 的 `/forge ship` 门禁检查依赖 `/forge review` 阶段写入的评审报告。当前 ship 只检查报告中的 `result`、`p0_count`、`p1_count` 字段，不验证报告是否仍然反映当前代码状态。如果 review 之后有新的代码提交（如手动修复 P2 问题、test 阶段修复后未重新 review），ship 读到的 review 结果可能已过时。

本改进在 review 报告中记录评审时的 commit hash，在 ship 门禁中增加 commit 比对步骤，检测 review 后的代码变更。

**设计决策**：不采用 addyosmani/agent-skills 的 `/ship` fan-out 重新评审模式——该模式在无状态架构下合理，但在 Forge 的有状态架构下会导致职责重叠和 token 浪费。本改进选择轻量的 commit hash 比对方案。

**明确不做的事情**：不在 ship 阶段重新执行评审；不硬阻断（只输出警告，用户可选择继续）；不修改 review 的执行逻辑。

## Requirements

### Requirement 1: Review 报告记录 Commit Hash

**User Story:** As a developer, I want the review report to record which commit was reviewed, so that the ship gate can verify the review is still current.

#### Acceptance Criteria

1. THE forge-review SKILL.md §9 review report YAML frontmatter SHALL include a `reviewed_at_commit` field containing the current HEAD commit hash at the time the review completes.
2. THE `reviewed_at_commit` field SHALL be populated by reading the output of `git rev-parse HEAD` (or equivalent).
3. THE `src/review.ts` module SHALL include the `reviewed_at_commit` field in the `ReviewReportFrontmatter` type definition.

### Requirement 2: Ship 门禁 Commit 比对

**User Story:** As a developer, I want the ship gate to warn me when code has changed since the last review, so that I don't ship unreviewed changes.

#### Acceptance Criteria

1. THE forge-ship SKILL.md §2 Gate Checks SHALL include a "Review Freshness" check after the existing Review Gate.
2. THE freshness check SHALL compare `reviewed_at_commit` from the review report with the current HEAD commit hash.
3. WHEN the hashes are identical, THE check SHALL pass silently.
4. WHEN the hashes differ, THE check SHALL compute the diff and categorize it:
   - Diff only involves `.forge/` files → pass (state updates don't affect code quality)
   - Diff involves project code → output ⚠️ warning recommending re-review
5. THE freshness check SHALL NOT hard-block ship — it outputs a warning, and the user can choose to continue or re-review.
6. WHEN the `reviewed_at_commit` field is missing (backward compatibility with old reports), THE check SHALL pass silently.

### Requirement 3: ship.ts 纯函数实现

**User Story:** As a developer, I want the commit freshness check to be a testable pure function, so that it can be verified with property-based tests.

#### Acceptance Criteria

1. THE `src/ship.ts` module SHALL export a `checkReviewFreshness(reviewedCommit: string | undefined, currentHead: string, changedFiles: string[])` pure function.
2. WHEN `reviewedCommit` is `undefined`, THE function SHALL return `{ fresh: true, reason: "no reviewed_at_commit field (backward compatible)" }`.
3. WHEN `reviewedCommit === currentHead`, THE function SHALL return `{ fresh: true, reason: "review matches current HEAD" }`.
4. WHEN `reviewedCommit !== currentHead` AND all `changedFiles` start with `.forge/`, THE function SHALL return `{ fresh: true, reason: "changes only in .forge/ state files" }`.
5. WHEN `reviewedCommit !== currentHead` AND any `changedFiles` does NOT start with `.forge/`, THE function SHALL return `{ fresh: false, reason: "project code changed since review", changedFiles: <list of non-.forge files> }`.
6. THE function SHALL have property-based tests verifying all 4 cases.
