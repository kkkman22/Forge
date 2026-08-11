---
status: superseded
status_note: T3 skill migration superseded by forge-single-entry-skills-collapse. SST=22 within target range. T1/T2 completed.
feature: forge-slimming-plan
layout: requirements
created: 2026-05-13
tier: standard
---
# Requirements Document

## Introduction

Claude Code 在过去一年原生交付了一系列与 Forge 重叠的能力（Skills、Plugins、Subagents、Checkpointing、Auto Memory、Worktrees、Agent Teams、`/loop`、`/goal`、`/code-review`、`/ultrareview`、`/compact`、`/context`、`/resume`、`/rewind`）。本 spec 规划 Forge 的瘦身工作，把重复造轮子的部分委托给官方原语，同时把 Forge 聚焦在方法论护城河上（三维路由 / TDD 铁律 / Spec 锁定 / frozen zone / 五维度 learn / PBT / Spec-alignment review 层 / Forge Loop 工程纪律 / Domain Pack / 三态验证 / event-storming）。

瘦身工作分三层推进：

- **T1（立即清理）**：纯冗余修剪与文档口径对齐，零行为变化。
- **T2（收缩）**：把与官方重叠的命令基础层委托给 Claude Code 原生，保留各命令独有的差异化部分；并对 Forge Loop 做纯文档层面的定位刷新。
- **T3（Skill 归位）**：按 "job-to-be-done" 对主包 skill 做归位与边界澄清，把主包 skill 数量从 30 降到约 20。

本文档按三层分组列出需求。所有 EARS 关键字（WHEN / IF / WHILE / WHERE / THE / SHALL）使用英文；叙述部分使用中文。

## Glossary

- **Forge_Main_Package**：`skills/` 目录下随 plugin/dist 分发的主包 skill 集合，不含 `packs/` 下按需加载的 pack skill。
- **Forge_Command**：以 `/forge <subcommand>` 形式向用户暴露的 slash command（如 `/forge recap`、`/forge resume`）。
- **Native_Command**：Claude Code 官方提供的 slash command（如 `/compact`、`/context`、`/resume`、`/code-review`、`/security-review`、`/rewind`、`/goal`、`/loop`）。
- **Auto_Memory**：Claude Code v2.1.59+ 提供的自动记忆机制，自动捕获 build 指令、debugging 记录等会话级信息。
- **Checkpointing**：Claude Code 官方的 checkpoint/rewind 能力，用于会话级状态保存与回滚。
- **Forge_Loop**：`forge-loop` npm 包与 `src/` 下的自主执行引擎，提供 Git 事务、熔断器、指数退避、Worktree 隔离、PUA 等工程纪律。
- **Pack**：`packs/` 目录下按需启用的领域能力包，可声明 `feature_flags`（如 `mutation_critical_modules`）。
- **Pack_Conditional_Skill**：仅在某个 pack 被启用且声明相应 feature flag 时才注册到命令列表的 skill。
- **PR_Slug_Mapping**：从 PR URL/number 反推关联的 Forge spec slug 的解析链，由 `/forge resume --from-pr` 使用。
- **Five_Question_Recovery**：`/forge resume` 使用的五问题结构化恢复 prompt，是 Forge 对官方 `/resume` 的差异化上层。
- **Spec_Alignment_Review**：三层独立评审中的 Spec 对齐层，校验实现与 Spec/Plan 的一致性，是 Forge 在 `/code-review` 之上的核心差异。
- **Three_State_Verdict**：Forge `/forge test` 与 `/forge verify` 使用的证据化三态结论（VERIFIED / NOT_VERIFIED / INCONCLUSIVE）。
- **Frozen_Zone**：Forge 的文件冻结分级（locked / approved / open），由 hooks 硬阻断写入。
- **Spec_Lock**：Spec 锁定语义，锁定后 frozen zone 生效。
- **Command_Count_Declaration**：`plugin.json` 的 `description` 字段与 `.claude-plugin/marketplace.json` 的 `description` 字段、`README.md` 概述区对外声明的命令总数。
- **Deprecation_Notice**：在命令输出或 SKILL.md 中向用户说明行为变化与迁移路径的一次性告知。
- **Integration_Evaluation_Report**：针对多 skill 是否合并的书面评估产物，包含使用数据、利弊分析与 go/no-go 决策。
- **Usage_Metrics_Window**：用于采集 skill 实际调用频次的时间窗口（由本 spec 定义为至少 14 天）。

---

# T1 — Immediate Cleanup（纯冗余修剪）

本层只处理文档口径、遗留配置归档与显式保留清单，不改变任何用户可见的命令行为。

## Requirements

### Requirement 1: 清理 teams/ 遗留参考配置

**User Story:** As a Forge maintainer, I want residual `teams/` reference configuration removed per the earlier ROADMAP cleanup requirement, so that the repository tree matches the current architecture.

#### Acceptance Criteria

1. WHEN the cleanup task is executed, THE Forge_Main_Package SHALL no longer contain the legacy `teams/` reference configuration directory at the repository root.
2. IF an audit finds any remaining reference to the removed `teams/` directory in `skills/`, `docs/`, `scripts/`, or `.claude/`, THEN THE cleanup task SHALL either update the reference to point at `skills/forge-decide-teams/` or remove the reference.
3. THE cleanup task SHALL preserve `skills/forge-decide-teams/` unchanged, since Agent Teams 是显式保留的 PoC。
4. WHERE the `teams/` directory has already been removed in an earlier commit, THE cleanup task SHALL produce a verification log recording the "already clean" state without file modifications.

### Requirement 2: 命令数量口径对齐

**User Story:** As a user reading Forge's entry documentation, I want the command count declared in `plugin.json`, `marketplace.json`, and `README.md` to match the actual number of `/forge` subcommands, so that I am not misled about Forge's surface area.

#### Acceptance Criteria

1. THE cleanup task SHALL compute the actual count of `/forge` subcommands as the single source of truth by enumerating `commands/forge.md` 的 subcommand 条目以及 `scripts/gen-plugin-commands.mjs` 的生成输出。
2. WHEN the actual count is determined, THE Command_Count_Declaration SHALL be updated so that `plugin.json.description`、`marketplace.json.description` and `README.md` 概述区引用同一个数值。
3. IF the actual count differs from the number claimed in the Forge Loop 章节、`docs/reference-commands.md` 或 `docs/quick-start.md`, THEN THE cleanup task SHALL update those documents to reference the same value.
4. THE updated Command_Count_Declaration SHALL be verified by a CI check (new or existing) that fails when `plugin.json.description` 与 `README.md` 概述区的命令数字声明不一致。

### Requirement 3: 归档已交付的 .forge/plans/ 与 .forge/specs/

**User Story:** As a developer navigating `.forge/`, I want plans and specs whose features have already shipped moved into `.forge/archive/`, so that the active planning surface only shows work in flight.

#### Acceptance Criteria

1. THE cleanup task SHALL audit `.forge/plans/` 与 `.forge/specs/` 下的每个条目，基于 ROADMAP、CHANGELOG 与 progress 文件判断其是否已交付。
2. WHEN a plan or spec is determined to correspond to a shipped feature, THE cleanup task SHALL move the corresponding directory into `.forge/archive/<ISO-date>-<slug>/`, preserving its internal structure.
3. IF a spec or plan is ambiguous (无法从 ROADMAP / CHANGELOG / progress 明确判定已交付), THEN THE cleanup task SHALL leave it in place and record the ambiguity in `.forge/archive/.audit-pending.md`.
4. THE cleanup task SHALL update cross-references in `docs/`, `README.md`, and `.forge/features/` to point at the new archived location when the referenced file has been moved.
5. THE audit log SHALL be written to `.forge/archive/.audit-YYYY-MM-DD.md` with columns: `path`, `status (shipped/active/ambiguous)`, `evidence`, `action taken`.

### Requirement 4: ROADMAP v2.3 observability 状态口径同步

**User Story:** As a reader comparing ROADMAP with other documentation, I want no document to still list v2.3 observability items as pending, so that the published status is internally consistent.

#### Acceptance Criteria

1. THE cleanup task SHALL scan `docs/`, `README.md`, `CHANGELOG.md`, and `.forge/features/` for mentions of v2.3 observability items (结构化 JSON 日志、命令执行耗时统计、性能基线)。
2. IF any document still marks an observability item as pending（例如 "⏳"、"待完成"、"TODO"、"planned"）, THEN THE cleanup task SHALL update the mark to reflect the shipped state consistent with ROADMAP v2.3。
3. WHEN no pending mark is found, THE cleanup task SHALL record a "no drift" entry in the audit log without file modifications.
4. THE cleanup task SHALL NOT modify ROADMAP.md in this requirement（ROADMAP 已在前置编辑中修正）。

### Requirement 5: T1 显式保留清单

**User Story:** As a Forge maintainer, I want items that look like cleanup candidates but are explicitly kept to be recorded in-repo, so that future audits don't re-trigger the same analysis.

#### Acceptance Criteria

1. THE cleanup task SHALL preserve `skills/forge-decide-teams/` in the main package as an Agent Teams PoC, 不做任何文件级修改。
2. THE cleanup task SHALL preserve `cmux-skills/forge-loop-signals/` as-is, 不做任何文件级修改。
3. THE cleanup task SHALL add a "显式保留" entry to the repository's T1 audit log recording the rationale: forge-decide-teams 作为 Agent Teams 趋势 PoC、forge-loop-signals 是 30 行声明式零维护文件且 Loop 可视化是核心价值主张。
4. WHERE a future audit script scans for "orphaned" skills, THE Forge_Main_Package SHALL expose an allowlist file（例如 `.forge/audit-keep.md`）that covers these two items。

---

# T2 — Contraction（委托重叠能力给官方原语）

本层把 `/forge recap`、`/forge resume`、`/forge abort`、`/forge learn`、`/forge review` 的基础层委托给 Claude Code 原生命令，保留 Forge 独有的差异化上层，同时刷新 Forge Loop 的文档定位。

## Requirements

### Requirement 6: `/forge recap` 委托给 `/compact` + `/context`

**User Story:** As a developer using `/forge recap`, I want Forge to delegate session compaction and context reporting to the official `/compact` and `/context` commands, so that Forge benefits from the native implementation and only adds its structured recap where it actually provides extra value.

#### Acceptance Criteria

1. WHEN the user invokes `/forge recap` on a Claude Code version that provides both `/compact` and `/context`, THE Forge_Command `/forge recap` SHALL invoke `/compact` then `/context` as the base path, and only add Forge-specific structured recap (Spec 阶段、frozen file 列表、未完成 progress 项) on top.
2. THE Forge_Command `/forge recap` SHALL NOT reimplement session-level compaction logic that duplicates `/compact`.
3. IF the current Claude Code version does not provide `/compact` or `/context`, THEN THE Forge_Command `/forge recap` SHALL fall back to its current behavior and emit a one-time Deprecation_Notice naming the minimum Claude Code version recommended for full delegation.
4. THE delegated base path SHALL propagate the exit status of the underlying Native_Command; non-zero native exit aborts the Forge-specific recap layer.
5. THE `/forge recap` SKILL.md SHALL document the delegation architecture: "Forge recap = /compact + /context + Forge 结构化摘要"。

### Requirement 7: `/forge resume` 委托给 `/resume` + Checkpointing

**User Story:** As a developer resuming work, I want `/forge resume` to delegate session-level resume to the official `/resume` and Checkpointing, while keeping Forge's Five_Question_Recovery prompt and `--from-pr` flag as the differentiator.

#### Acceptance Criteria

1. WHEN the user invokes `/forge resume` without `--from-pr`, THE Forge_Command `/forge resume` SHALL first invoke the Native_Command `/resume` (or trigger Checkpointing restore) to restore the Claude Code session, then layer Forge's Five_Question_Recovery prompt based on `.forge/status.md` and `.forge/progress/*.md`。
2. WHEN the user invokes `/forge resume --from-pr <value>`, THE Forge_Command `/forge resume` SHALL preserve the existing `--from-pr` behavior defined in the `forge-resume-from-pr` spec (PR_Slug_Mapping + PR_Context_Bundle 注入)。
3. THE Forge_Command `/forge resume` SHALL NOT reimplement session-level checkpoint/rewind logic that duplicates Checkpointing。
4. IF the Native_Command `/resume` is not available (older Claude Code version), THEN THE Forge_Command `/forge resume` SHALL fall back to its current behavior and emit a one-time Deprecation_Notice recommending the minimum Claude Code version.
5. THE Five_Question_Recovery prompt structure SHALL remain unchanged and SHALL be invoked after the Native_Command step succeeds.
6. THE `/forge resume` SKILL.md SHALL document: "基础会话恢复委托给官方 /resume + Checkpointing；Forge 层只负责五问题结构化 prompt 与 --from-pr"。

### Requirement 8: `/forge abort` 精简为归档 + 重置

**User Story:** As a developer aborting a Forge task, I want `/forge abort` to only archive `.forge/status.md` and reset Forge-local state, while delegating any session-level abort concerns to the platform, so that Forge does not reimplement session cancellation.

#### Acceptance Criteria

1. THE Forge_Command `/forge abort` SHALL retain only two responsibilities: (a) archive `.forge/status.md` 到 `.forge/archive/<ISO-date>-abort/`, (b) reset Forge-local working state (progress、status、findings 当前指针)。
2. THE Forge_Command `/forge abort` SHALL NOT reimplement session-level abort logic that duplicates Claude Code native cancellation semantics.
3. WHEN the abort path encounters a worktree created by Forge_Loop, THE Forge_Command `/forge abort` SHALL leave Forge_Loop's worktree cleanup unchanged (Forge Loop 独立性约束，见 Requirement 21)。
4. THE `/forge abort` SKILL.md SHALL be rewritten to state the narrowed scope and reference the Native_Command for session cancellation.
5. THE Forge_Command `/forge abort` SHALL emit a Deprecation_Notice on first post-change invocation for users whose workflows relied on Forge-specific session abort behavior.

### Requirement 9: `/forge learn` 去重 Auto_Memory 覆盖的内容

**User Story:** As a developer running `/forge learn`, I want learn to focus on Forge-specific knowledge sinking (cross-project ADRs and 五维度 structured sinking) rather than duplicating what Auto_Memory already captures, so that my captured knowledge is not redundant.

#### Acceptance Criteria

1. THE Forge_Command `/forge learn` SHALL remove content categories that Auto_Memory (v2.1.59+) already captures automatically, including: build commands, debugging notes, routine repl invocations。
2. THE Forge_Command `/forge learn` SHALL retain and focus on: 跨项目 ADR 的生成与同步、五维度结构化沉淀 (event / decision / pattern / anti-pattern / rule)、`--from-chats` 历史对话提取。
3. WHEN `/forge learn` runs on a Claude Code version without Auto_Memory, THE Forge_Command SHALL fall back to capturing the full legacy surface and emit a Deprecation_Notice naming the minimum Auto_Memory version.
4. THE `/forge learn` SKILL.md SHALL document the boundary: "Auto_Memory 负责会话级快速记忆；forge-learn 负责跨项目 ADR 与五维度结构化沉淀"。
5. THE Forge_Command `/forge learn` SHALL NOT emit ADR entries that are strictly session-scoped and already captured by Auto_Memory.

### Requirement 10: `/forge review` 可选委托安全 / 质量层

**User Story:** As a developer running `/forge review`, I want Forge's security and quality layers to be optionally delegated to the native `/code-review` and `/security-review`, while keeping the Spec_Alignment_Review as Forge's unique contribution on top, so that I don't run two overlapping review engines.

#### Acceptance Criteria

1. THE Forge_Command `/forge review` SHALL expose two new flags: `--delegate-quality` and `--delegate-security`, each independently defaulting to auto-detection of the corresponding Native_Command availability.
2. WHEN `--delegate-quality` resolves to true, THE Forge_Command `/forge review` SHALL invoke `/code-review` for the quality layer and consume its findings instead of running Forge's built-in quality reviewer.
3. WHEN `--delegate-security` resolves to true, THE Forge_Command `/forge review` SHALL invoke `/security-review` for the security layer and consume its findings instead of running Forge's built-in security reviewer.
4. THE Spec_Alignment_Review layer SHALL always run as Forge's core differentiator, regardless of delegation flags。
5. IF `/code-review` or `/security-review` is unavailable on the current Claude Code version, THEN THE Forge_Command `/forge review` SHALL fall back to Forge's built-in reviewer and emit a Deprecation_Notice naming the minimum recommended Claude Code version.
6. THE Forge_Command `/forge review` SHALL merge findings from delegated Native_Commands and the Spec_Alignment_Review into a single structured report with `source: delegated|forge-spec-alignment` tagging per finding.
7. THE `/forge review` SKILL.md SHALL document the three-layer delegation model and the tagging scheme.

### Requirement 11: Forge Loop 文档定位刷新

**User Story:** As a reader comparing Forge Loop with `/goal` and `/loop`, I want Forge Loop's positioning in documentation to emphasize its engineering discipline layer (Git transaction, circuit breaker, quality gates, Spec alignment) rather than claiming generic "autonomous execution", so that the value proposition is unambiguous.

#### Acceptance Criteria

1. THE documentation update SHALL rewrite Forge Loop 的定位描述，从 "autonomous execution" 改为 "autonomous execution with engineering discipline"。
2. THE documentation update SHALL add an explicit comparison section contrasting Forge Loop 与 Native_Command `/goal` 和 `/loop`，覆盖四个差异维度：Git 事务、熔断器 + 指数退避、质量门禁、Spec 对齐。
3. THE documentation update SHALL NOT modify any file under `src/` (Forge Loop 核心引擎不动，见 Requirement 21)。
4. THE updated positioning SHALL appear at least in: `README.md`、`docs/reference-advanced.md`、`ROADMAP.md`、`forge-loop` npm 包的 README。
5. WHERE an existing passage describes Forge Loop as "autonomous execution" without qualification, THE documentation update SHALL append the engineering discipline qualifier。

### Requirement 12: T2 向后兼容与 `/forge control-*` 保留

**User Story:** As a user on an older Claude Code version or a user relying on `/forge control-cli` and `/forge control-ui`, I want T2 changes to preserve working behavior and keep the control commands unchanged, so that the slimming does not regress my workflow.

#### Acceptance Criteria

1. WHEN a T2-modified Forge_Command detects that its delegated Native_Command is unavailable, THE Forge_Command SHALL fall back to the pre-change behavior and emit a Deprecation_Notice exactly once per session。
2. THE Deprecation_Notice SHALL include: the affected `/forge` subcommand, the missing Native_Command, the minimum recommended Claude Code version, and a link to the slimming migration guide。
3. THE Forge_Command `/forge control-cli` SHALL remain in the main package with unchanged behavior, as it is the execution layer of Three_State_Verdict。
4. THE Forge_Command `/forge control-ui` SHALL remain in the main package with unchanged behavior, as it is the execution layer of Three_State_Verdict。
5. THE T2 changes SHALL NOT introduce any new runtime dependency in `package.json`（见 Requirement 24）。

---

# T3 — Skill Relocation（job-to-be-done 对齐）

本层按 "job-to-be-done" 对主包 skill 做归位、合并评估与边界澄清，目标是把 Forge_Main_Package 的 skill 数量从 30 降到约 20。

## Requirements

### Requirement 13: `forge-mutate` 按 pack 条件注册

**User Story:** As a user without a pack that declares `mutation_critical_modules`, I don't want `forge-mutate` to appear in the main command list, since it only makes sense with pack-declared critical modules, so that my main command surface reflects what I can actually use.

#### Acceptance Criteria

1. THE `forge-mutate` skill SHALL remain present in the repository (NOT deleted), but SHALL register as a Pack_Conditional_Skill。
2. WHEN no enabled pack declares `feature_flags.mutation_critical_modules`, THE Forge_Main_Package SHALL NOT list `forge-mutate` in `/forge` 命令菜单或 `plugin.json` 的常驻命令集合。
3. WHEN at least one enabled pack declares `feature_flags.mutation_critical_modules`, THE Forge_Main_Package SHALL auto-register `forge-mutate` so that `/forge mutate` 对用户可见并可调用。
4. THE `forge-mutate` SKILL.md SHALL document the pack-conditional registration rule, including how to enable it through a pack。
5. THE change SHALL NOT modify `forge-mutate` 对 Stryker 的依赖或内部行为 — 只改注册机制。

### Requirement 14: `forge-refactor` / `forge-fix` / `forge-fix-conflicts` 合并评估

**User Story:** As a Forge maintainer, I want a written evaluation before deciding whether to merge `forge-refactor`, `forge-fix`, and `forge-fix-conflicts` into a single `forge-maintenance` skill, so that the decision is evidence-based rather than a blind consolidation.

#### Acceptance Criteria

1. THE T3 task SHALL produce an Integration_Evaluation_Report saved to `.forge/decisions/<ISO-date>-forge-maintenance-evaluation.md`。
2. THE Integration_Evaluation_Report SHALL contain: each skill's current command sequence, overlapping steps, divergent steps, observed usage frequency within a Usage_Metrics_Window of at least 14 days, pros/cons of merging into a single `forge-maintenance` skill with three subcommands (`refactor` / `fix` / `resolve-conflicts`)。
3. THE Integration_Evaluation_Report SHALL conclude with an explicit go/no-go decision and a rationale tied to the observed data。
4. WHERE the decision is "go", THE T3 task SHALL include a migration plan covering: renaming, backward-compatible command aliasing, deprecation schedule, and documentation updates。
5. WHERE the decision is "no-go", THE T3 task SHALL record in the Integration_Evaluation_Report what conditions would flip the decision in the future。

### Requirement 15: `forge-accept` / `forge-verify` / `forge-ship` 边界澄清

**User Story:** As a user deciding which gate skill to run, I want clear documentation stating when to use `forge-accept`, `forge-verify`, or `forge-ship`, so that I pick the right skill without guessing.

#### Acceptance Criteria

1. THE T3 task SHALL NOT merge `forge-accept`, `forge-verify`, or `forge-ship` as part of the T3 scope。
2. THE README.md SHALL add a section contrasting the three gate skills along at least three dimensions: trigger moment in the workflow, primary responsibility, typical output artifact。
3. THE SKILL.md of each of `forge-accept`, `forge-verify`, `forge-ship` SHALL begin with a one-paragraph "Use when …" statement that distinguishes it from the other two。
4. WHERE two of the three skills overlap in responsibility wording, THE documentation update SHALL rewrite the wording so that each responsibility is named by exactly one skill。
5. THE clarified boundaries SHALL be verified by a contract test that asserts the "Use when …" paragraph exists and is unique across the three SKILL.md files。

### Requirement 16: `forge-grill` / `forge-zoom-out` 使用率评估

**User Story:** As a Forge maintainer, I want invocation-frequency data over a Usage_Metrics_Window for `forge-grill` and `forge-zoom-out` before deciding whether to merge them into `decide` and `debug`, so that the decision is data-driven.

#### Acceptance Criteria

1. THE T3 task SHALL define a Usage_Metrics_Window of at least 14 days during which `/forge grill` and `/forge zoom-out` invocations are counted。
2. THE T3 task SHALL produce a usage metrics report saved to `.forge/decisions/<ISO-date>-grill-zoomout-usage.md` containing: total invocations of each skill, invocation source (manual vs. loop-triggered), and per-day distribution。
3. WHERE the observed invocation frequency of `forge-grill` is below a threshold defined in the report, THE T3 task SHALL record a "merge into `forge-decide`" decision in the same report。
4. WHERE the observed invocation frequency of `forge-zoom-out` is below a threshold defined in the report, THE T3 task SHALL record a "merge into `forge-debug`" decision in the same report。
5. WHERE the observed invocation frequency is above the threshold, THE T3 task SHALL record a "keep as standalone skill" decision with the supporting data。
6. THE decisions recorded in the report SHALL include an explicit execution plan (or lack thereof) before any main-package skill list changes take effect。

### Requirement 17: 主包 skill 数量目标

**User Story:** As a Forge user scanning the main command list, I want the main package to carry approximately 20 skills after T3, down from the current 30, so that the surface reflects Forge's differentiated value and not every historical experiment.

#### Acceptance Criteria

1. WHEN T3 is fully executed (decisions from Requirement 13-16 applied), THE Forge_Main_Package SHALL contain approximately 20 skills, measured as the count of `skills/forge-*/SKILL.md` files that register to the main command list。
2. THE "approximately 20" target SHALL be interpreted as a range of 18 to 22 inclusive; landing outside this range SHALL be justified in `.forge/decisions/<ISO-date>-skill-count-deviation.md`。
3. THE main package skill count reduction SHALL come only from: Pack_Conditional_Skill relocation (Requirement 13), evidence-based merges (Requirement 14), and usage-driven merges (Requirement 16)。
4. THE T3 task SHALL NOT remove `forge-storm` from the main package, as it is the DDD pre-step for `/forge spec`。
5. THE T3 task SHALL NOT touch `forge-pack-pms`, as it already resides under `packs/` and is not a main-package skill。

### Requirement 18: plugin.json 与 README 与真实命令集对齐

**User Story:** As a user reading the plugin manifest or README, I want the declared command set and count to match the actual main-package command set after T3, so that documentation and reality do not diverge.

#### Acceptance Criteria

1. WHEN the T3 main-package skill changes are committed, THE `plugin.json.description` SHALL reference the updated command count as the single source of truth defined in Requirement 2。
2. WHEN the T3 main-package skill changes are committed, THE `.claude-plugin/marketplace.json.description` SHALL reference the same updated command count。
3. WHEN the T3 main-package skill changes are committed, THE `README.md`、`docs/reference-commands.md`、`docs/quick-start.md` SHALL list the current actual subcommand set 与对应的总数一致。
4. THE `scripts/gen-plugin-commands.mjs` generated output SHALL match the actual `commands/forge.md` subcommand listing; a CI check SHALL fail when drift is detected。
5. THE documentation update SHALL include a CHANGELOG entry under the T3 release version summarizing the main-package command set change and pointing at the Pack_Conditional_Skill registration mechanism。

---

# Cross-Cutting Requirements（T1 / T2 / T3 共同约束）

以下需求横跨三层，贯穿整个瘦身计划。

## Requirements

### Requirement 19: 无功能回归与显式 Deprecation_Notice

**User Story:** As an existing Forge user, I want my current workflows to continue to work after the slimming, with explicit notices for T2 behavior changes, so that I am not silently broken.

#### Acceptance Criteria

1. WHEN an existing user invokes any `/forge` subcommand that exists before the slimming, THE Forge_Main_Package SHALL continue to accept the same invocation syntax and produce a functionally equivalent outcome (possibly with base-layer delegation as per T2)。
2. IF a T2-modified Forge_Command changes its underlying execution path on a capable Claude Code version, THEN THE Forge_Command SHALL emit a Deprecation_Notice exactly once per session on first invocation after the change is in effect。
3. THE Deprecation_Notice SHALL be logged only to the user-visible output, NOT emitted on every subsequent invocation of the same command within the same session。
4. IF a Pack_Conditional_Skill is relocated (Requirement 13) and an existing user previously invoked it without an enabled pack, THEN THE Forge_Main_Package SHALL emit a one-time notice explaining the pack-conditional registration and how to enable the owning pack。
5. THE slimming changes SHALL NOT silently change the semantic of any existing command output format consumed by downstream tooling (e.g. `.forge/reviews/*.md`, `.forge/runs/*.md`)。

### Requirement 20: 分发方式向后兼容

**User Story:** As a user installing Forge via clone, dist-package, or plugin, I want all three distribution channels to keep working after the slimming, so that my existing install pipeline does not break.

#### Acceptance Criteria

1. THE "clone install" path (`git clone` + `npm install` + `npx tsc`) SHALL continue to install a functional Forge after the slimming changes。
2. THE "dist-package install" path (`scripts/build-dist.sh` + `scripts/install-dist.sh`) SHALL continue to install a functional Forge with the T3-reduced command surface。
3. THE "plugin install" path (`claude plugin marketplace add` + `claude plugin install forge`) SHALL continue to install a functional Forge with the T3-reduced command surface。
4. THE `scripts/build-dist.sh` output SHALL include the Pack_Conditional_Skill source files but not list them in the main command registration surface。
5. A CI job SHALL exercise all three distribution channels after the slimming changes and fail if any channel's smoke test regresses。

### Requirement 21: Forge Loop 核心引擎独立性

**User Story:** As a Forge Loop user, I want none of T1, T2, or T3 to touch Forge Loop's core engine (Git transaction, circuit breaker, backoff, PUA), so that Loop's reliability guarantees are preserved.

#### Acceptance Criteria

1. THE slimming changes SHALL NOT modify any file under `src/` that implements Forge Loop's core engine: Git 事务、熔断器、指数退避、Worktree 管理、PUA 引擎、StatusFile 驱动、Restatement。
2. THE T2 Forge Loop 文档定位刷新 (Requirement 11) SHALL be documentation-only and SHALL NOT change any file under `src/`。
3. IF a T1/T2/T3 change would incidentally require a Forge Loop core-engine modification, THEN THE change SHALL be deferred and recorded as a follow-up in `.forge/features/` rather than proceeding。
4. WHERE a skill's SKILL.md references Forge Loop behavior, THE SKILL.md update SHALL NOT describe Loop behavior differently from the current `src/` implementation。

### Requirement 22: PBT 覆盖保持 green

**User Story:** As a Forge contributor, I want all existing fast-check property tests to remain green after the slimming, so that the PBT culture is preserved across the refactor.

#### Acceptance Criteria

1. THE slimming changes SHALL keep the existing 133 fast-check property test files green; `npm run test` SHALL pass on the slimming branch before merge。
2. IF a skill change under T3 modifies a `src/` module that already has fast-check property tests, THEN THE change SHALL keep the existing properties true without weakening assertions。
3. IF a new `src/` module is introduced by the slimming, THEN THE new module SHALL include at least one fast-check property test where the module's logic has non-trivial invariants。
4. WHERE a property test needs to be updated because its precondition changed, THE update SHALL preserve the property's original intent and SHALL be documented in the commit message。

### Requirement 23: Frozen_Zone 与 Spec_Lock 语义保持

**User Story:** As a user relying on Forge's frozen-zone and spec-lock protection, I want the slimming to preserve those semantics unchanged, so that my protected files remain hard-blocked.

#### Acceptance Criteria

1. THE slimming changes SHALL NOT modify the Frozen_Zone 分级定义 (locked / approved / open) 或 hooks 的硬阻断行为。
2. THE slimming changes SHALL NOT modify Spec_Lock 的语义（锁定后 frozen zone 生效的规则）。
3. WHERE a T2 or T3 change's output writes to `.forge/`, THE change SHALL respect the existing Frozen_Zone 规则; attempts to write to locked files SHALL be blocked by the existing hooks。
4. THE existing `FrozenZoneViolation` 错误类 SHALL continue to be thrown when applicable and SHALL NOT be replaced or bypassed by the slimming changes。

### Requirement 24: 无新运行时依赖

**User Story:** As a user worried about supply-chain surface, I want the slimming to introduce zero new runtime dependencies, and ideally reduce the count, so that the attack surface does not grow.

#### Acceptance Criteria

1. THE slimming changes SHALL NOT add any new entry under `package.json` `dependencies`。
2. WHERE the slimming can remove a dependency that is no longer needed after delegation to Native_Commands, THE slimming SHALL remove it and record the removal in CHANGELOG。
3. THE slimming changes MAY add entries under `devDependencies` only if strictly needed for new tests or tooling, and each addition SHALL be justified in the commit message。
4. A CI job SHALL diff the `dependencies` section before and after the slimming and fail if any addition is present without an explicit override marker。

### Requirement 25: Out-of-scope boundary

**User Story:** As a reviewer of this spec, I want the out-of-scope items explicitly listed so that the slimming does not drift into long-term or moat-preserving concerns.

#### Acceptance Criteria

1. THE slimming SHALL NOT touch v3.0 长期项: 社区生态、沙箱执行、多 AI 平台支持。
2. THE slimming SHALL NOT re-consolidate Agent Teams; `skills/forge-decide-teams/` 保持 PoC 状态，跟进条件见 ROADMAP v3.0。
3. THE slimming SHALL NOT modify Forge 的核心护城河能力: 三维路由、TDD 铁律、Spec 锁定、frozen zone、五维度 learn、PBT、Domain Pack、Three_State_Verdict、Forge Loop 工程纪律、event-storming。
4. IF a slimming task is discovered to require touching any of the above out-of-scope surfaces, THEN THE task SHALL be split off into a separate spec rather than proceed within this spec。
