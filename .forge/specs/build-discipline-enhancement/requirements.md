---
status: completed
feature: build-discipline-enhancement
layout: requirements
created: 2026-05-01
tier: standard
---
# Requirements Document

## Introduction

Forge 的 forge-build SKILL.md 定义了完整的构建执行流程，但缺少从 addyosmani/agent-skills 项目中观察到的 6 项工程纪律规则：简洁性检查、三段式变更摘要、源码驱动开发规则、Chesterton's Fence 触发器、依赖纪律和 Dead Code Hygiene。

这些规则在 agent-skills 中分散在 `incremental-implementation`、`git-workflow-and-versioning`、`source-driven-development`、`code-simplification`、`code-review-and-quality` 等多个独立 skill 中。Forge 将它们整合到 forge-build 的执行纪律框架中。

**依赖**：本 Spec 应在 Spec 1（skill-behavioral-guardrails）完成后执行，避免同时修改 forge-build SKILL.md 产生冲突。

**明确不做的事情**：不修改 TypeScript 代码；不改变 build 的执行路径或门禁逻辑；不增加新的 Subagent 或 Hook；不创建独立的 SKILL 文件。

## Requirements

### Requirement 1: 简洁性检查

**User Story:** As a developer, I want the build phase to enforce simplicity in the GREEN stage of TDD, so that the Agent doesn't over-engineer implementations before correctness is proven.

#### Acceptance Criteria

1. THE forge-build SKILL.md SHALL include a §4.1 "Simplicity Check" subsection after §4 TDD Iron Rules.
2. THE simplicity check SHALL require that GREEN stage implementations are "the simplest code that makes the test pass".
3. THE simplicity check SHALL state that abstractions, factory patterns, and config-driven designs are ONLY allowed in the REFACTOR stage, and ONLY when duplication has occurred 3+ times.
4. THE simplicity check SHALL include 2-3 concrete before/after examples showing over-engineered vs simple implementations.

### Requirement 2: 三段式变更摘要

**User Story:** As a developer, I want each Subagent to output a structured change summary before committing, so that scope discipline is visible and reviewable.

#### Acceptance Criteria

1. THE forge-build SKILL.md SHALL include a §6.6 "Change Summary" subsection in Execution Discipline.
2. THE change summary SHALL require Subagents to output three sections before each atomic commit: "变更"（what changed）, "未触碰（有意）"（what was noticed but intentionally not changed）, "关注点"（decisions needing user confirmation）.
3. THE "未触碰" section SHALL prove scope discipline — it shows the Agent noticed adjacent issues but chose not to fix them.
4. THE change summary format SHALL be defined as a structured output exempt from conciseness constraints.

### Requirement 3: Source-Driven Development 规则

**User Story:** As a developer, I want the build phase to verify framework API signatures against project dependency versions, so that the Agent doesn't use outdated APIs from training data.

#### Acceptance Criteria

1. THE forge-build SKILL.md §3.2 Subagent Instruction Construction SHALL include a rule about framework API verification.
2. THE rule SHALL state: when a task involves framework-specific APIs, the Subagent SHOULD verify API signatures against the project's dependency versions (from package.json or equivalent), not rely on training data memory.
3. THE rule SHALL NOT require fetching external documentation for every API call — only when the API is non-trivial or the Agent is uncertain about the current version's signature.

### Requirement 4: Chesterton's Fence 触发器

**User Story:** As a developer, I want the build phase to trigger a comprehension check before deleting or significantly modifying existing code, so that the Agent doesn't remove code it doesn't understand.

#### Acceptance Criteria

1. THE forge-build SKILL.md Reflection Triggers table SHALL include a new row for "删除或大幅修改现有代码".
2. THE trigger SHALL ask: "我理解这段代码为什么被写成这样吗？git blame 的上下文是什么？"
3. THE interactive handling SHALL be: explain the reason, then confirm the modification.
4. THE autonomous handling SHALL be: record to findings (reason + modification rationale), continue execution.

### Requirement 5: 依赖纪律

**User Story:** As a developer, I want the build phase to enforce a dependency review before adding new packages, so that the Agent doesn't introduce unnecessary or risky dependencies.

#### Acceptance Criteria

1. THE forge-build SKILL.md SHALL include a §6.7 "Dependency Discipline" subsection in Execution Discipline.
2. THE dependency check SHALL require confirming 4 items before adding any new dependency: (1) existing stack can't solve it, (2) dependency size is acceptable, (3) actively maintained, (4) license compatible.
3. THE rule SHALL state: prefer standard library and existing project utilities over new dependencies.

### Requirement 6: Dead Code Hygiene

**User Story:** As a developer, I want the REFACTOR stage to check for orphaned code after refactoring, so that unused imports, functions, and types don't accumulate.

#### Acceptance Criteria

1. THE forge-build SKILL.md §4 TDD REFACTOR step description SHALL include a dead code scan step.
2. THE scan SHALL check for unused imports, functions, types, and variables introduced or orphaned by the refactoring.
3. THE scan results SHALL be recorded to `.forge/findings/` — the Agent SHALL NOT auto-delete without confirmation.
