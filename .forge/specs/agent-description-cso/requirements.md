---
status: completed
feature: agent-description-cso
layout: requirements
created: 2026-06-04
tier: standard
---
# Requirements Document

## Introduction

obra/superpowers 项目在 `writing-skills/SKILL.md` 中记录了一个关键实验发现（Claude Search Optimization, CSO）：当 agent/skill 的 `description` 字段包含工作流总结时，LLM 会直接跟随 description 的摘要而不读取完整的 skill/agent 内容。例如，description 写 "code review between tasks"，Claude 只做一次 review，即使 skill flowchart 清楚展示了两次 review（spec compliance → code quality）。

当前 Forge 的 18 个 agent definition 和 ~30 个 skill instructions 中，description 字段混合了"角色描述"、"功能总结"和"触发条件"，存在 CSO 问题风险。

**明确不做的事情**：不修改 agent 的 system prompt body（Identity、Check Items 等章节），只改 frontmatter 的 `description` 字段。不修改 TypeScript 代码。不新增 hook 或 subagent。

## Requirements

### Requirement 1: Description 字段格式铁律

**User Story:** 作为 Forge 调度器（router），我希望所有 agent/skill 的 description 只包含触发条件，这样我能在调度时做出准确判断，而不是被角色描述或流程总结误导。

#### Acceptance Criteria

1. ALL agent definitions（`.claude/agents/*.md`）的 `description` 字段 SHALL 以 "Use when" 开头。
2. ALL skill instructions（`skills/forge/lib/*/instructions.md`）的 `description` 字段 SHALL 以 "Use when" 开头。
3. NO description SHALL 包含角色描述（如"XX评审者"、"XX专家"、"XX视角评估者"）。
4. NO description SHALL 包含工作流总结（如"三层评审"、"TDD enforcement"、"五视角决策"）。
5. NO description SHALL 包含能力清单（如"检查命名一致性、错误处理、性能..."）。
6. NO description SHALL 包含架构描述（如"Agent Team 成员"、"协调 agent"）。
7. EACH description SHALL 仅描述：在什么条件下、在什么场景中、触发该 agent/skill。
8. EACH description SHALL 保持在 200 字符以内。

### Requirement 2: 具体 Agent Description 改写

**User Story:** 作为开发者，我希望每个 agent 的 description 都已经过 CSO 优化，这样不需要逐一审查。

#### Acceptance Criteria

1. 以下 agent 的 description SHALL 按下表改写：

| Agent | 改写后 |
|-------|--------|
| `architect` | Use when evaluating technology choices, architecture risks, or system scalability in /forge decide |
| `business-analyst` | Use when business rules, compliance boundaries, or edge cases need analysis |
| `critic` | Use when challenging plans, finding blind spots, or stress-testing decisions |
| `debugger` | Use when encountering build errors, runtime bugs, or test failures requiring root cause analysis |
| `designer` | Use when tasks involve UI changes, accessibility, or visual consistency |
| `explore` | Use when locating files, tracing dependencies, or mapping codebase structure |
| `forge-build` | Use when running /forge build or implementing planned tasks |
| `forge-decide-arch` | Use when /forge decide needs architecture consistency analysis |
| `forge-decide-cost` | Use when /forge decide needs cost impact analysis |
| `forge-decide-lead` | Use when /forge decide runs in Agent Teams mode |
| `forge-decide-ops` | Use when /forge decide needs observability and deployment analysis |
| `forge-decide-product` | Use when /forge decide needs user value and DX analysis |
| `forge-decide-sec` | Use when /forge decide needs threat model and data flow analysis |
| `forge-plan` | Use when running /forge plan or a locked spec needs task breakdown |
| `forge-review` | Use when running /forge review or code changes need quality gate before ship |
| `forge-ship` | Use when running /forge ship or completed work needs branch validation and push |
| `product` | Use when clarifying problem definition, target users, or success criteria |
| `security` | Use when assessing threat models, permission boundaries, or data flow security |

2. 以下 review subagent 的 description SHALL 按下表改写：

| Agent | 改写后 |
|-------|--------|
| `spec-check` | Use in /forge review Layer 1, when verifying implementation matches locked spec |
| `quality-check` | Use in /forge review Layer 2, when checking code quality of changed files |
| `security-check` | Use in /forge review Layer 3, when scanning for hardcoded secrets or injection risks |

### Requirement 3: CSO Description Gate 规则

**User Story:** 作为 Forge 维护者，我希望未来新增或修改的 agent/skill 自动遵循 CSO 规则，这样不需要每次人工检查。

#### Acceptance Criteria

1. `.claude/rules/` 中 SHALL 新增一条 CSO Description Gate 规则。
2. THE 规则 SHALL 声明：所有新增或修改的 agent/skill definition，其 `description` 字段必须以 "Use when" 开头，且不包含角色描述、流程总结或能力清单。
3. THE 规则 SHALL 适用于 `.claude/agents/*.md` 和 `skills/forge/lib/*/instructions.md` 两类文件。

### Requirement 4: 不修改的非 agent 文件

**User Story:** 作为开发者，我希望明确知道哪些文件不在本 spec 范围内。

#### Acceptance Criteria

1. THE following files SHALL NOT be modified: `CLAUDE.md`, `skills/forge/SKILL.md`, `skills/forge/registry.toml`, any TypeScript source files, any hook scripts.
2. ONLY frontmatter `description` fields SHALL be changed in agent/skill definition files. Body content SHALL remain unchanged.
