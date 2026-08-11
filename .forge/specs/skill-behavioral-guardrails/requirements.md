---
status: completed
feature: skill-behavioral-guardrails
layout: requirements
created: 2026-05-01
tier: standard
---
# Requirements Document

## Introduction

Forge 的 SKILL.md 文件定义了 Agent 在每个阶段应遵循的工作流程，但缺少两种关键的行为引导机制：（1）反合理化表——当 Agent 产生跳步念头时直接反驳其借口；（2）反触发条件——明确声明该 skill 不适用的场景，防止 Agent 在不合适的场景下执行。

借鉴 addyosmani/agent-skills 项目的设计，该项目的每个 SKILL.md 都包含 Common Rationalizations 表（借口 vs 反驳）和 When NOT to Use 段落。Forge 当前仅 forge-test 的 §3.4 有反合理化模式，其余 16 个 SKILL 均缺失。

本改进为所有 17 个 SKILL.md 增加这两种行为护栏，直接对抗 Agent 跳步倾向，对 Forge Loop 自主模式尤其有价值。

**明确不做的事情**：不修改任何 TypeScript 代码；不改变 SKILL 的执行逻辑或流程；不增加新的门禁或检查点；不修改 forge-test 已有的 §3.4（避免重复）。

## Glossary

- **反合理化表（Anti-Rationalization Table）**：列出 Agent 在该阶段最常见的跳步借口及对应反驳，在 Agent 产生跳步念头的那一刻介入。格式为 `| 合理化 | 反驳 |`。
- **反触发条件（Anti-Trigger / Not For）**：明确声明该 skill 不适用的场景，帮助 Agent（尤其是 Forge Loop 的 skill-scheduler）判断是否应跳过某些步骤。
- **Known AI Failure Patterns**：Forge 现有的失败模式表，格式为 `| 失败模式 | 错误行为 | 正确做法 |`。与反合理化表互补但不重复——前者描述"Agent 做错了什么"，后者预防"Agent 为什么会想做错"。

## Requirements

### Requirement 1: 反合理化表——核心执行阶段

**User Story:** As a developer using Forge, I want each core execution SKILL to include anti-rationalization rebuttals, so that the Agent is less likely to skip critical steps when it generates excuses.

#### Acceptance Criteria

1. THE following SKILL.md files SHALL each contain a "Common Rationalizations" section with a table of ≥3 rows: `forge-spec`, `forge-plan`, `forge-build`, `forge-review`, `forge-ship`, `forge-decide`.
2. EACH rationalization row SHALL contain two columns: "合理化"（the excuse the Agent would generate）and "反驳"（why the excuse is invalid）.
3. THE rationalizations SHALL be specific to the SKILL's phase, NOT generic across all phases. For example, forge-spec's rationalizations SHALL address spec-skipping excuses, NOT test-skipping excuses.
4. THE rationalizations SHALL NOT duplicate content already present in the SKILL's "Known AI Failure Patterns" table（if one exists）. The two tables are complementary: Known AI Failure Patterns describes "what went wrong", rationalizations prevent "why the Agent would want to go wrong".
5. THE forge-test SKILL.md SHALL NOT be modified, as it already contains §3.4 Rationalization Excuses Rebuttal which serves this purpose.

### Requirement 2: 反合理化表——辅助阶段

**User Story:** As a developer using Forge Loop, I want auxiliary SKILLs to also include anti-rationalization rebuttals, so that the autonomous execution engine doesn't skip learning, debugging, or recovery steps.

#### Acceptance Criteria

1. THE following SKILL.md files SHALL each contain a "Common Rationalizations" section with a table of ≥3 rows: `forge-learn`, `forge-debug`, `forge-resume`, `forge-abort`, `forge-status`, `forge-loop`.
2. THE rationalizations SHALL be specific to each SKILL's purpose. For example, forge-learn's rationalizations SHALL address knowledge-capture-skipping excuses; forge-debug's SHALL address investigation-skipping excuses.
3. FOR `forge-build-light`, `forge-fix`, `forge-refactor`: these SKILLs SHALL each contain a "Common Rationalizations" section with ≥2 rows, as they are lighter-weight variants.

### Requirement 3: 反触发条件——所有 SKILL

**User Story:** As a developer, I want each SKILL to clearly state when it should NOT be used, so that I (and the Forge Loop scheduler) can make better decisions about which phase to execute.

#### Acceptance Criteria

1. ALL 17 SKILL.md files SHALL contain a "Not For" paragraph immediately after the Overview section.
2. EACH "Not For" paragraph SHALL list 2-4 specific scenarios where the SKILL should not be invoked, using concrete examples rather than vague descriptions.
3. THE "Not For" conditions SHALL be consistent with the forge-router's tier routing logic. For example, forge-spec's "Not For" SHALL include "单文件 bug 修复" which aligns with the light tier skipping spec.
4. THE "Not For" paragraph SHALL use a consistent format across all SKILLs: a brief header line followed by a bullet list of exclusion scenarios.

### Requirement 4: 内容质量与一致性

**User Story:** As a maintainer, I want the new sections to follow consistent formatting and not break existing SKILL structure, so that the codebase remains maintainable.

#### Acceptance Criteria

1. ALL new sections SHALL use the same Markdown formatting conventions as existing SKILL content (same heading levels, table syntax, language).
2. THE "Common Rationalizations" section SHALL be placed after the "Known AI Failure Patterns" section (if present), or before "Edge Case Handling" (if no failure patterns section exists).
3. THE "Not For" paragraph SHALL be placed immediately after the first Overview paragraph, before any numbered sections.
4. ALL existing content in each SKILL.md SHALL remain unchanged — the new sections are purely additive.
5. THE contract.test.ts SHALL continue to pass after all modifications (SKILL frontmatter format unchanged).
