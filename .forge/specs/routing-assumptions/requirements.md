---
status: completed
feature: routing-assumptions
layout: requirements
created: 2026-05-01
tier: standard
status_note: "Req1 (router generates 3–5 cited assumptions, src/router.ts:843 generateAssumptions) + Req3 (assumptions field in ForgeRoutingResult type) delivered. Req2 (persisted to .forge/status.md) delivered: the router SKILL §5 documents assumptions as a status field to write, state.ts:144 reads it back, and it is optional (Req2.2). The audit's initial 'router never writes assumptions' finding was a layer confusion — router.ts is intentionally a pure function; the write happens at the SKILL layer per §5 instructions, which is the project's established pattern."
---
# Requirements Document

## Introduction

Forge 路由器在分析任务时会扫描项目代码结构、读取 `package.json`、检查 `.forge/config.md` 等文件，基于这些信息做出隐式判断（如技术栈、影响范围、分页模式等）。当前这些判断是隐式的——Agent 默默假设然后往下走，用户没有机会在第一步纠正错误假设。

借鉴 addyosmani/agent-skills 的 "Surface Assumptions" 模式（using-agent-skills meta-skill 和 spec-driven-development 的假设显式化流程），本改进在路由分析输出中增加"假设"段落，将 Agent 的隐式判断显式化，让用户在流程第一步就能纠正。

**明确不做的事情**：不改变路由的档位判定逻辑；不增加新的门禁；不阻断流程（假设段落是信息性的，用户不纠正则按假设继续）。

## Glossary

- **假设段落（Assumptions Block）**：路由分析输出中新增的段落，列出 Agent 基于项目扫描做出的 3-5 条隐式判断，每条标注来源。
- **假设来源（Assumption Source）**：Agent 做出判断的依据，如 package.json、项目路由扫描、现有代码模式、.forge/config.md 等。

## Requirements

### Requirement 1: 路由输出增加假设段落

**User Story:** As a developer, I want the routing analysis to explicitly list the assumptions the Agent is making about my project, so that I can correct wrong assumptions before the entire workflow proceeds on a false premise.

#### Acceptance Criteria

1. THE forge-router SKILL.md §2 routing analysis output template SHALL include an "假设" section after the "行为提示" section and before the confirmation prompt.
2. THE assumptions section SHALL contain 3-5 assumptions, each on a separate line with format: `N. <判断内容>（基于 <来源>）`.
3. THE assumptions SHALL be derived from actual project scanning (package.json, code structure, .forge/config.md, git history, existing specs), NOT from generic templates.
4. EACH assumption SHALL cite its source (e.g., "基于 package.json devDependencies", "基于项目中已有的 GET /api/tasks 分页模式", "基于 .forge/config.md 技术栈").
5. THE assumptions section SHALL end with `→ 如有不符请纠正`.

### Requirement 2: 假设写入状态文件

**User Story:** As a Forge Loop user, I want routing assumptions to be persisted in the status file, so that downstream SKILLs can reference them and Closure-First Probes can detect assumption violations.

#### Acceptance Criteria

1. THE forge-router SKILL.md §5 status update SHALL write the assumptions list to `.forge/status.md` in a new `assumptions` field (YAML string array).
2. THE `assumptions` field SHALL be optional — existing status files without this field SHALL continue to work without errors.
3. DOWNSTREAM SKILLs (forge-build Closure-First Probes) MAY read the `assumptions` field to detect deviations between assumptions and actual code state.

### Requirement 3: router.ts 类型更新

**User Story:** As a developer, I want the router's TypeScript types to include assumptions, so that the Forge Loop can programmatically access routing assumptions.

#### Acceptance Criteria

1. THE `src/router.ts` routing result type SHALL include an `assumptions: string[]` field.
2. THE `assumptions` field SHALL default to an empty array when no assumptions are generated.
3. ALL existing router tests SHALL continue to pass without modification.
4. THE `classifyTask` function (or equivalent) SHALL return assumptions as part of its result.
