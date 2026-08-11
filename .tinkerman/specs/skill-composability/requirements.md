---
status: completed
feature: skill-composability
layout: requirements
created: 2026-05-01
tier: standard
---
# Requirements Document

## Introduction

Forge 的大型 SKILL.md 文件（forge-build 500+ 行、forge-review 400+ 行、forge-plan 350+ 行）将编排逻辑、详细规则、格式模板和函数签名全部耦合在一个文件中。这导致三个问题：（1）token 效率低——每次加载都是全量；（2）跨 SKILL 无法复用——forge-debug 想引用 TDD 规则必须重复描述；（3）SKILL-TypeScript 耦合——函数签名变更需要同步修改 SKILL.md。

借鉴 addyosmani/agent-skills 的 `references/` 目录模式和 Anthropic Agent Skills 规范的三层渐进式披露模型，本改进将大型 SKILL 拆分为主体（编排逻辑）+ references/（详细规则），实现跨 SKILL 引用和 token 优化。

**明确不做的事情**：不改变 SKILL 的执行逻辑；不修改 commands/forge.md 的分发机制；不引入新的加载框架（利用 Agent 的文件读取能力）；不改变 Forge Loop 的驱动方式。

## Requirements

### Requirement 1: forge-build SKILL 拆分

**User Story:** As a developer, I want forge-build's detailed rules to be in separate reference files, so that the main SKILL loads fewer tokens and other SKILLs can reference specific rules.

#### Acceptance Criteria

1. THE `skills/forge-build/SKILL.md` main body SHALL be reduced to ≤200 lines, containing only: Overview, Pre-build Checks flow, Three Execution Paths (high-level), TDD Iron Rules (summary), Failure Handling (summary), Execution Discipline (summary), Status Updates, Execution Flow, Edge Cases.
2. THE following content SHALL be extracted to `skills/forge-build/references/`: `tdd-rules.md` (detailed TDD rules + simplicity check), `closure-probes.md` (Closure-First Probes detail), `context-budget.md` (Hard Token Limits table + lifecycle classification), `anti-drift.md` (Anti-drift guardrails + reflection triggers), `change-summary.md` (three-part change summary format), `dependency-discipline.md` (dependency review checklist).
3. THE main SKILL.md SHALL reference extracted content with `→ 详见 references/<filename>` pointers.
4. THE behavior of forge-build SHALL remain identical before and after the split — the split is purely organizational.

### Requirement 2: forge-review SKILL 拆分

**User Story:** As a developer, I want forge-review's filtering and dedup logic to be in reference files, so that the main SKILL focuses on the review orchestration flow.

#### Acceptance Criteria

1. THE `skills/forge-review/SKILL.md` main body SHALL be reduced to ≤150 lines.
2. THE following content SHALL be extracted to `skills/forge-review/references/`: `confidence-filtering.md` (confidence scoring + filtering rules), `dedup-pipeline.md` (fingerprint dedup + cross-validation), `quality-gate.md` (6-item report quality self-check).
3. THE main SKILL.md SHALL retain: Overview, Subagent Parallel Execution, Three-Layer Review (high-level), Severity Classification, Gate logic, Execution Flow, Edge Cases.

### Requirement 3: forge-plan SKILL 拆分

**User Story:** As a developer, I want forge-plan's task format templates to be in reference files, so that the main SKILL focuses on the planning process.

#### Acceptance Criteria

1. THE `skills/forge-plan/SKILL.md` main body SHALL be reduced to ≤150 lines.
2. THE following content SHALL be extracted to `skills/forge-plan/references/`: `atomic-task-format.md` (full task format with TDD step examples), `lightweight-task-format.md` (lightweight format with design references), `prohibited-content.md` (placeholder scan rules).

### Requirement 4: 跨 SKILL 引用

**User Story:** As a developer, I want SKILLs to reference each other's detailed rules without duplicating content, so that rules are maintained in one place.

#### Acceptance Criteria

1. THE `skills/forge-debug/SKILL.md` SHALL reference `skills/forge-build/references/tdd-rules.md` for Phase 4 (Fix Verification) TDD requirements, instead of re-describing TDD rules.
2. THE `skills/forge-test/SKILL.md` SHALL reference `skills/forge-build/references/tdd-rules.md` for TDD-related verification, instead of re-describing.
3. CROSS-SKILL references SHALL use relative paths: `→ 详见 ../forge-build/references/tdd-rules.md`.

### Requirement 5: 函数签名分离

**User Story:** As a maintainer, I want function call signatures to be in a separate reference file, so that TypeScript function changes don't require SKILL.md updates.

#### Acceptance Criteria

1. ALL "Function Call" blocks currently embedded in SKILL.md files SHALL be moved to `references/function-contracts.md` within each SKILL directory.
2. THE main SKILL.md SHALL reference function contracts with `→ 函数签名详见 references/function-contracts.md`.
3. THE function-contracts.md files SHALL contain the full function signatures, parameter descriptions, return types, and usage notes.

### Requirement 6: Persona 可覆盖声明

**User Story:** As a developer, I want to know that I can customize review and decision personas, so that I can adapt Forge's evaluation standards to my project.

#### Acceptance Criteria

1. THE `skills/forge-review/SKILL.md` §2 SHALL include a note: "用户可在 `.claude/agents/` 下定义同名文件（spec-check.md、quality-check.md、security-check.md）覆盖默认评审标准。用户定义优先于 Forge 默认。"
2. THE `skills/forge-decide/SKILL.md` §2 SHALL include a similar note for decision personas (product.md, architect.md, security.md, designer.md).
