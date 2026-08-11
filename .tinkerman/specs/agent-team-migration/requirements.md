---
status: completed
feature: agent-team-migration
layout: requirements
created: 2026-04-29
tier: standard
---
# Requirements Document

## Introduction

Forge 项目当前在三个场景中使用 Claude Code Agent Teams：`/forge review`（三层评审）、`/forge decide`（四视角决策）、`/forge build` 全量路径研究阶段。由于 Agent Teams 存在已知的可靠性问题（无会话恢复、shutdown 阻塞、状态不持久化），需要将这三个场景全部迁移到独立 Subagent 并行执行模式。迁移完成后，同步更新所有引用 Agent Team 的文档和配置，并清理废弃的 teams 目录。

## Glossary

- **Agent_Team**：Claude Code 的 Agent Teams 特性，允许一个 lead agent 创建和管理多个 teammate agent 协作完成任务。当前存在会话恢复、shutdown 阻塞、状态不持久化等已知限制。
- **Subagent**：通过 Claude Code 的 Agent tool 独立启动的子代理，拥有独立的上下文窗口，生命周期由调用方控制，不依赖 Team 协议。
- **Forge**：本项目的 AI 编码工作流引擎，通过 `/forge` 命令驱动 decide → spec → plan → build → review → test → ship → learn 的完整开发流程。
- **Review_Engine**：`/forge review` 命令的执行引擎，负责三层独立评审（Spec 对齐、代码质量、安全与风险）。
- **Decide_Engine**：`/forge decide` 命令的执行引擎，负责从产品、架构、安全、设计四个视角进行前置决策。
- **Build_Engine**：`/forge build` 命令的执行引擎，负责按计划以 TDD 方式逐任务实现代码。
- **SKILL_Document**：位于 `skills/` 目录下的 SKILL.md 文件，定义了每个 Forge 命令的完整执行流程和规则。
- **Orchestrator**：主 Agent，负责派发 Subagent 任务、收集结果、执行合并逻辑。
- **Critic_Agent**：`/forge decide` 中的交叉审查角色，负责审查其他视角输出中的盲点和不一致。

## Requirements

### Requirement 1: Review 评审迁移

**User Story:** As a developer, I want `/forge review` to use independent Subagents instead of Agent Teams, so that the three-layer review process is reliable and does not suffer from Team shutdown blocking or session loss.

#### Acceptance Criteria

1. WHEN `/forge review` is triggered, THE Review_Engine SHALL spawn three independent Subagents (spec-check, quality-check, security-check) in parallel using the Agent tool, instead of creating an Agent_Team.
2. WHEN all three Subagents complete their review, THE Orchestrator SHALL collect their outputs and execute the existing finding merge pipeline (confidence filtering, deduplication, cross-reviewer consistency boost).
3. WHILE the review is in lightweight mode (no Spec available), THE Review_Engine SHALL spawn only two Subagents (quality-check, security-check), omitting spec-check.
4. THE Review_Engine SHALL produce the same review report format (YAML frontmatter with severity counts, three-layer structured findings) as the current Agent_Team-based implementation.
5. WHEN a Subagent fails or times out during review, THE Orchestrator SHALL report the failure for that specific layer and continue processing results from the remaining Subagents, instead of blocking the entire review.
6. THE Review_Engine SHALL eliminate the Agent_Team cleanup step (teammate shutdown and team resource cleanup) from the review execution flow.

### Requirement 2: Decide 决策迁移

**User Story:** As a developer, I want `/forge decide` to use independent Subagents instead of Agent Teams, so that the multi-perspective decision process completes reliably without Team lifecycle issues.

#### Acceptance Criteria

1. WHEN `/forge decide` is triggered, THE Decide_Engine SHALL execute a two-round Subagent process: Round 1 spawns perspective Subagents (product, architect, security, and optionally designer) in parallel; Round 2 spawns a Critic_Agent to cross-review all Round 1 outputs.
2. WHEN Round 1 completes, THE Orchestrator SHALL pass all perspective outputs to the Critic_Agent as input context for Round 2 cross-review.
3. WHILE the task involves UI changes (detected by the existing `involvesUIChanges` logic in `src/decide.ts`), THE Decide_Engine SHALL include the designer Subagent in Round 1.
4. WHEN the Critic_Agent identifies blocking issues in Round 2, THE Decide_Engine SHALL mark the decision document status as `needs_revision` and present the issues to the developer.
5. THE Decide_Engine SHALL produce the same decision document format (YAML frontmatter with topic, date, status; sections for each perspective and veto record) as the current Agent_Team-based implementation.
6. THE Decide_Engine SHALL eliminate the Agent_Team cleanup step (teammate shutdown and team resource cleanup) from the decide execution flow.
7. THE Decide_Engine SHALL maintain the existing 500-token output limit per perspective Subagent.

### Requirement 3: Build 全量路径研究阶段迁移

**User Story:** As a developer, I want the full-path research phase of `/forge build` to use independent Subagents instead of Agent Teams, so that parallel research is reliable and does not block on Team shutdown.

#### Acceptance Criteria

1. WHEN `/forge build` enters the full-path research phase (Phase 1), THE Build_Engine SHALL spawn multiple independent research Subagents in parallel using the Agent tool, instead of creating an Agent_Team.
2. WHEN all research Subagents complete, THE Orchestrator SHALL merge their findings into `.tinkerman/findings/<topic>.md`.
3. WHEN a research Subagent fails or times out, THE Orchestrator SHALL report the failure and continue processing results from the remaining research Subagents.
4. THE Build_Engine SHALL transition from Phase 1 (research) to Phase 2 (implementation) using the merged findings, maintaining the same data flow as the current Agent_Team-based implementation.

### Requirement 4: SKILL 文档更新

**User Story:** As a developer, I want all SKILL documents to accurately reflect the new Subagent-based execution model, so that the workflow instructions are consistent with the actual implementation.

#### Acceptance Criteria

1. WHEN the migration is complete, THE SKILL_Document for `forge-review/SKILL.md` SHALL replace all Agent_Team configuration sections (Section 2), Agent_Team startup instructions, and Agent_Team cleanup steps with Subagent parallel execution instructions.
2. WHEN the migration is complete, THE SKILL_Document for `forge-decide/SKILL.md` SHALL replace all Agent_Team configuration sections (Section 2), Agent_Team startup instructions, and Agent_Team cleanup steps with two-round Subagent execution instructions.
3. WHEN the migration is complete, THE SKILL_Document for `forge-build/SKILL.md` SHALL replace the Agent_Team-based research phase description (Section 3.3 Phase 1) with independent Subagent parallel research instructions.
4. THE SKILL_Document updates SHALL preserve all non-Agent_Team-related content (severity grading, confidence filtering, merge pipeline, TDD rules, quality gates) without modification.

### Requirement 5: 项目宪法和模板更新

**User Story:** As a developer, I want `CLAUDE.md` and `templates/CLAUDE.md` to accurately describe the Subagent-based execution model, so that all Agents in the project follow the correct behavioral guidelines.

#### Acceptance Criteria

1. WHEN the migration is complete, THE `CLAUDE.md` file SHALL replace the "Agent Team 配置" section with a "Subagent 并行执行配置" section that describes the new Subagent-based execution model for decide and review.
2. WHEN the migration is complete, THE `templates/CLAUDE.md` file SHALL replace the "Agent Team 配置" section with a "Subagent 并行执行配置" section template.
3. THE `CLAUDE.md` Section 3.1 (执行与评估分离) SHALL update the description from "Agent Team（spec-check、quality-check、security-check）" to "独立 Subagent（spec-check、quality-check、security-check）".
4. THE `templates/CLAUDE.md` Section 3.1 SHALL apply the same update as the project `CLAUDE.md`.

### Requirement 6: 废弃配置清理

**User Story:** As a developer, I want all obsolete Agent Team configuration files and directories to be removed, so that the codebase does not contain misleading references to the deprecated Agent_Team approach.

#### Acceptance Criteria

1. WHEN the migration is complete, THE Forge project SHALL remove the `teams/` directory (including `teams/decide/config.json`, `teams/review/config.json`, `teams/README.md`, and `.gitkeep` files).
2. WHEN the migration is complete, THE Forge project SHALL remove the `.claude/teams/` directory (including `.claude/teams/decide/config.json` and `.claude/teams/review/config.json`).
3. WHEN the migration is complete, THE SKILL_Document files SHALL remove all references to `.claude/teams/` JSON files as "参考材料" (reference materials).
4. IF any other file in the project references the `teams/` directory or Agent_Team configuration, THEN THE migration SHALL update or remove those references.

### Requirement 7: Subagent 调用协议

**User Story:** As a developer, I want a consistent Subagent invocation protocol across all three migrated scenarios, so that the Subagent lifecycle management is uniform and maintainable.

#### Acceptance Criteria

1. THE Orchestrator SHALL use the Claude Code Agent tool to spawn each Subagent with explicit parameters: prompt (task-specific instructions), permissionMode, and maxTurns.
2. THE Orchestrator SHALL pass the relevant agent type (e.g., `spec-check`, `quality-check`, `security-check`, `product`, `architect`, `security`, `designer`, `critic`) to each Subagent invocation.
3. WHEN spawning parallel Subagents, THE Orchestrator SHALL launch all Subagents concurrently and wait for all to complete (or timeout), rather than launching them sequentially.
4. WHEN a Subagent returns its result, THE Orchestrator SHALL validate that the result conforms to the expected output format before incorporating it into the merge pipeline.
5. THE Subagent invocation protocol SHALL NOT require any Team lifecycle management (create, message, wait, shutdown, delete sequence).

### Requirement 8: 向后兼容性

**User Story:** As a developer, I want the migration to preserve all existing behavioral contracts, so that the review quality, decision quality, and research quality are not degraded by the architectural change.

#### Acceptance Criteria

1. THE Review_Engine SHALL maintain the same finding merge pipeline behavior: confidence filtering (threshold 0.8), deduplication (fingerprint matching with ±3 line tolerance), and cross-reviewer consistency boost (+0.10 confidence).
2. THE Review_Engine SHALL maintain the same report quality gate (6-item self-check) before outputting the final review report.
3. THE Review_Engine SHALL maintain the same P0/P1 ship-blocking gate behavior.
4. THE Decide_Engine SHALL maintain the same veto mechanism: blocking issues from any perspective halt the decision process.
5. THE Decide_Engine SHALL maintain the existing dynamic designer inclusion logic based on `involvesUIChanges()` in `src/decide.ts`.
6. THE Build_Engine full-path research phase SHALL maintain the same findings output format in `.tinkerman/findings/<topic>.md`.
