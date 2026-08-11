---
status: retired-partial
feature: forge-decide-agent-teams
layout: requirements
created: 2026-05-12
tier: standard
status_note: "R1–R4 delivered (agent files, CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS gate, run-decide-poc.sh). R5.1 delivered (poc-topics.md with 3 fixed topics A/B/C). R5.2 delivered (run-decide-poc.sh path fixed .kiro→.forge). R5.3 (PoC report) + R5.4 (recommendation) + R5.5 (no auto-default-change) DEFERRED: require a live Agent Teams runtime (CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1) to actually run the PoC and collect metrics; not runnable in CI/HEADLESS. R6.3 delivered 2026-06-14 (README note added). R6.4 (archive after PoC) deferred — needs live PoC run. Re-open when Agent Teams exits experimental."
---
# Requirements Document

## Introduction

Claude Code 2.1.32（2026-02-05）引入实验性的 Agent Teams 能力（`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`）：多个 agent 在 tmux 面板中并行执行，一个 team-lead 协调，teammates 各自独立 context 且互相通信。后续版本加入 `TeammateIdle`、`TaskCompleted` hook、per-teammate 模型、`initialPrompt`、`memory: project` 等配套能力。

Forge 当前 `/forge decide`（以及并行 `/forge review`）用 Task 工具 + DAG 模式实现多 agent 并行，有以下痛点：

- 各 subagent 的中间输出难以在主会话中实时观测
- subagent 失败恢复成本高（主会话不知道具体哪一环卡住）
- subagent 之间无法直接通信（只能回主会话再转发）
- Task 工具有 output token 限制，长分析容易被截断

Agent Teams 原生解决这些问题。本 spec 是一个 **PoC（Proof of Concept）**：用 Agent Teams 重写 `/forge decide` 的多视角决策环节，对比新旧两种方案的延迟、token 开销、失败恢复能力，形成后续决策的数据基础。

**本 spec 是 PoC 性质，不替换现有方案**；最终是否采纳 Agent Teams 由 PoC 报告 + ADR 决定。

## Glossary

- **Agent_Teams**：Claude Code 的多 agent 并行协作能力，需 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`，基于 tmux 实现 teammate 面板可视化。
- **Forge_Decide_Command**：`/forge decide`，当前基于 Task 工具调度多视角分析 agent 并合并结论。
- **Current_DAG_Implementation**：Forge 现有的基于 Task + DAG 的并行实现（位于 `skills/forge-decide/SKILL.md` 和相关脚本）。
- **Team_Lead_Agent**：Agent Teams 模式下的协调 agent，负责任务拆分、teammate 派发、结论合成。
- **Teammate_Agent**：Agent Teams 模式下的执行 agent，在独立 context 中完成一个视角的分析。
- **Decision_Viewpoint**：`/forge decide` 的单个分析视角（如架构视角、安全视角、成本视角、运维视角、产品视角）。
- **PoC_Report**：本 spec 产出的对比评估报告，位于 `.forge/decisions/<date>-agent-teams-poc.md` 或 `docs/poc/`。

## Requirements

### Requirement 1: Agent Teams 版本的 `/forge decide` 实现

**User Story:** As a Forge maintainer evaluating Agent Teams, I want a second implementation of `/forge decide` using Agent Teams, so that I can run both side-by-side on the same decision topics and compare outcomes quantitatively.

#### Acceptance Criteria

1. THE project SHALL add a new skill `skills/forge-decide-teams/SKILL.md` that implements `/forge decide` using Agent Teams, runnable via `/forge decide --mode=teams <topic>`.
2. THE new skill SHALL define a Team_Lead_Agent (`.claude/agents/forge-decide-lead.md`) responsible for parsing the decision topic, dispatching Decision_Viewpoint tasks to Teammate_Agents, and synthesizing the final ADR draft.
3. THE new skill SHALL define at least five Teammate_Agent files under `.claude/agents/`: `forge-decide-arch.md` (architecture), `forge-decide-sec.md` (security), `forge-decide-cost.md` (cost), `forge-decide-ops.md` (operability), `forge-decide-product.md` (product fit).
4. WHEN `/forge decide --mode=teams` is invoked AND `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is not set, THE skill SHALL exit with a diagnostic instructing the user to set the env var and restart their CC session.
5. THE Current_DAG_Implementation SHALL remain the default (`--mode=dag` or no flag); the Teams mode is opt-in during the PoC period.

### Requirement 2: Teammate_Agent frontmatter 规范

**User Story:** As a Forge reviewer of the PoC design, I want each Teammate_Agent to be constrained to its viewpoint and unable to do unrelated work, so that the PoC measures viewpoint focus rather than free-form wandering.

#### Acceptance Criteria

1. EACH Teammate_Agent file SHALL declare these frontmatter fields: `name`, `description`, `model`, `maxTurns`, `allowedTools`, `disallowedTools`, `memory: project`, `color`.
2. EACH Teammate_Agent SHALL have `allowedTools` restricted to: `Read`, `Glob`, `Grep`, `WebFetch` (only for external reference lookup), `SendMessage` (for teammate communication); write tools (`Write`, `Edit`, `Bash`) are explicitly in `disallowedTools`.
3. EACH Teammate_Agent SHALL have `maxTurns` capped at 15 to prevent runaway exploration; the cap SHALL be documented in the viewpoint's SKILL with rationale.
4. EACH Teammate_Agent SHALL load `.claude/agent-memory/<name>/MEMORY.md` via `memory: project`, where accumulated viewpoint-specific rules live (e.g. `forge-decide-sec` remembers project-specific threat model).
5. THE Team_Lead_Agent SHALL additionally have `Write` in `allowedTools` (to write the final ADR draft) and SHALL declare all Teammate_Agent names in its `restrictedSubagents` frontmatter to prevent spawning unrelated agents.

### Requirement 3: 团队间通信与结果汇总

**User Story:** As a developer running `/forge decide --mode=teams`, I want teammates to be able to consult each other (e.g. security can ask cost for a budget estimate on a mitigation) without routing through the team lead, so that decisions incorporate cross-viewpoint trade-offs.

#### Acceptance Criteria

1. THE Team_Lead_Agent SHALL dispatch tasks to all Decision_Viewpoint Teammate_Agents at session start using the Agent Teams spawn mechanism, passing each teammate an initial prompt containing the decision topic and the viewpoint's scope.
2. Teammate_Agents SHALL be permitted to use `SendMessage({to: <teammate-id>})` to consult each other directly; all inter-teammate messages are recorded in the session transcript for audit.
3. WHEN a Teammate_Agent completes its viewpoint analysis, THE `TaskCompleted` hook SHALL fire; THE Team_Lead_Agent SHALL wait for all five teammates' completion before starting synthesis.
4. WHEN any Teammate_Agent emits `{"continue": false, "stopReason": "..."}` via its `TeammateIdle` hook, THE Team_Lead_Agent SHALL treat that teammate's analysis as final and proceed with the remaining teammates, recording the early-stop reason.
5. THE Team_Lead_Agent SHALL produce a final ADR draft at `.forge/decisions/<date>-<topic-slug>.md` matching the existing ADR format, with each Teammate_Agent's findings attributed in a "Viewpoints" section.

### Requirement 4: 失败恢复与可观测性

**User Story:** As a developer running `/forge decide --mode=teams` in a real environment, I want clear visibility into each teammate's progress and a resilient failure mode if one teammate crashes, so that I don't lose the other four viewpoints' work.

#### Acceptance Criteria

1. WHEN a Teammate_Agent exits unexpectedly (tmux pane closed, API 5xx, agent explicit failure), THE Team_Lead_Agent SHALL capture the failure reason in the PoC metrics log and continue synthesis with the remaining teammates; the ADR draft notes the missing viewpoint explicitly.
2. THE Forge_Decide_Command SHALL emit OpenTelemetry spans for each Teammate_Agent's lifecycle (span attributes: `viewpoint`, `model`, `token_usage`, `duration_ms`, `completion_reason`).
3. THE `SessionStart` hook SHALL write a `.forge/runs/<timestamp>-decide-teams-run.md` recording: topic, mode, teammate list, start time; the `SessionEnd` hook SHALL append: end time, per-teammate outcomes, total token usage, total duration, final ADR path.
4. WHEN the overall decide session exceeds 20 minutes wall-clock time, THE Team_Lead_Agent SHALL prompt the user before continuing: "已运行 20 分钟，当前进度 X/5 teammates，是否继续？[Y/n]"; in non-interactive mode, continue by default.

### Requirement 5: PoC 对比评估报告

**User Story:** As a Forge architect deciding whether to promote Agent Teams mode to default, I want a quantitative comparison between DAG mode and Teams mode on identical test topics, so that the decision is data-driven.

#### Acceptance Criteria

1. THE PoC SHALL define at least three fixed test topics covering diverse complexity levels (e.g. "添加一个新的 CLI flag", "重构 config 系统", "引入 plugin 系统"); the topics are stored at `.forge/specs/forge-decide-agent-teams/poc-topics.md`.
2. THE project SHALL include a script `scripts/run-decide-poc.sh <topic-id>` that runs both `--mode=dag` and `--mode=teams` on the same topic and captures metrics (token usage, wall-clock time, teammate failure count, final ADR word count, manual-review quality score).
3. THE PoC_Report SHALL be committed to `.forge/decisions/<date>-agent-teams-poc.md` with sections: Setup, Metrics Table (one row per topic-mode pair), Qualitative Observations, Recommendation, Follow-up Actions.
4. THE PoC_Report SHALL include a recommendation: one of `adopt`, `keep-dag`, `hybrid` (teams for complex topics, dag for simple), or `re-evaluate-in-N-months` with explicit triggers.
5. THE PoC_Report SHALL NOT automatically change the default mode; the final adoption decision is a separate follow-up ADR.

### Requirement 6: 文档与 opt-out

**User Story:** As a Forge user not interested in the PoC, I want the new mode to be invisible in normal usage, so that my existing `/forge decide` workflow is unaffected.

#### Acceptance Criteria

1. THE `/forge decide` command SHALL default to the Current_DAG_Implementation when no `--mode` flag is given; users must explicitly opt into Teams mode.
2. THE `skills/forge-decide/SKILL.md` (current skill) SHALL be unmodified except for a brief "Alternative: Agent Teams mode (PoC)" note pointing to the new skill.
3. THE `README.md` SHALL add a short note under the relevant usage section: "`/forge decide` 目前在评估 Agent Teams 模式，请参考 `.forge/specs/forge-decide-agent-teams/` 了解 PoC 进展"; no changes to the main quickstart.
4. WHEN the PoC period ends (PoC_Report committed), THE spec SHALL be archived to `.forge/archive/<date>-agent-teams-poc/` regardless of outcome; the `skills/forge-decide-teams/` directory is either promoted (if adopted) or deleted (if not).
