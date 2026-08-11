---
status: completed
feature: ccbp-hardening-phase2
layout: requirements
created: 2026-05-12
tier: standard
---
# Requirements Document

## Introduction

`ccbp-inspired-hardening` spec 落地后，Forge 的 harness 层完成了第一批结构改造（skill → agent 迁移、execution contract、settings.local.json 分离、最小规则/hook dispatcher 骨架、agent-memory 目录）。该 spec 的 Req 5/6 明确声明为"只做设计 + 最小示例，完整迁移留到后续 spec"，并在 design.md §5 列出了 27 个 hook 事件清单和 3 条候选懒加载规则，但未实施。

同时，对 Claude Code CLI 近 6 个月更新的调研（详见 `.forge/decisions/`）识别出三条被 `ccbp-inspired-hardening` 未包含但高 ROI 的原生能力：**Hooks 的 `if:` 条件过滤（v2.1.85）**、**PreCompact / PostCompact hook（v2.1.105/76）**、**Agent `isolation: "worktree"` + `hooks:` + `initialPrompt` frontmatter（v2.1.0/50/83）**。

本 spec 是 `ccbp-inspired-hardening` 的 Phase 2，专注收尾工作：

- **完成遗留迁移**：rules 候选规则全量落地、hooks dispatcher 剩余 4 类事件迁移
- **引入官方新能力**：Hooks `if:` 条件过滤替代内联 bash 判断、PreCompact 保护 `.forge/status.md`、agent worktree 隔离
- **加强 agent 定义**：使用 `hooks:` / `initialPrompt` frontmatter 减少全局 hooks.json 负担
- **版本兜底**：README / CHANGELOG 显式标注 Forge 所需 Claude Code 最低版本

**前置**：本 spec 启动前，`ccbp-inspired-hardening` 的 Task 1–13 必须全部完成（contract test 绿、烟雾测试通过）；若 `ccbp-inspired-hardening` 因任何原因被回滚，本 spec 同步归档不实施。

## Glossary

- **Phase1_Spec**：`.forge/specs/ccbp-inspired-hardening/`，本 spec 的前置依赖。
- **Hook_If_Filter**：Claude Code v2.1.85 引入的 hook 定义 `if:` 字段，使用 permission-rule 语法（如 `"Bash(git *)"`、`"Write(.forge/**)"`），仅匹配时才 spawn hook 命令，减少无谓的 bash 调用。
- **PreCompact_Hook**：Claude Code 的 hook 事件之一，在会话 compaction 开始前触发；hook 可通过 `exit 2` 阻塞 compaction，或通过 stdout 注入自定义 compact 指令。
- **PostCompact_Hook**：compaction 完成后触发；此时历史被压缩到 summary，hook 可重新注入关键上下文（例如 `.forge/status.md` 当前指针）。
- **Agent_Worktree_Isolation**：Claude Code v2.1.50 引入的 agent frontmatter `isolation: "worktree"`，使 agent 在自动创建的 git worktree 中运行，实现文件系统隔离。
- **Agent_Frontmatter_Hooks**：v2.1.0/118/116 引入的 agent frontmatter `hooks:` 字段，声明 agent 级的 PreToolUse / PostToolUse / Stop / SubagentStop hook，生命周期随 agent 绑定，不污染全局 `hooks/hooks.json`。
- **Agent_InitialPrompt**：v2.1.83 引入的 agent frontmatter `initialPrompt` 字段，声明 agent 启动时自动提交的第一轮 prompt，取代用户在调用方传长 prompt 的模式。
- **Dispatcher_Remaining_Events**：`Phase1_Spec` Req 6 留给后续 spec 的 4 类事件迁移：PreToolUse / PostToolUse / Stop / TeammateIdle。
- **Rules_Candidate_List**：`Phase1_Spec` design.md §4 列出的 3 条后续迁移候选：`forge-src.md`、`skill-editing.md`、`branch-protection.md`。
- **Compaction_Snapshot**：本 spec 定义的 `.forge/.compact-snapshot.md` 临时文件，由 PreCompact_Hook 写入，由 PostCompact_Hook 消费后删除。
- **CC_Minimum_Version**：Forge 所需的 Claude Code 最低版本，本 spec 确立为 `2.1.121`（PostToolUse `updatedToolOutput` 全工具化的版本），推荐 `≥2.1.138`。

## Requirements

### Requirement 1: Hooks `if:` 条件过滤全量迁移

**User Story:** As a Forge maintainer watching bash spawns per session, I want every conditional hook to use the native `if:` filter instead of inline bash guards, so that hooks don't spawn for irrelevant tool calls and session startup is faster.

#### Acceptance Criteria

1. THE project SHALL audit every entry in `hooks/hooks.json` and identify hooks that currently rely on inline `if [ -f ... ]; then ...; fi` or `if [ -d ... ]` patterns in the `command` field; each such case SHALL be listed in `.forge/docs/living/hooks-if-migration.md` with its current pattern and proposed `if:` expression.
2. WHEN a hook's inline condition can be expressed as a permission-rule pattern (e.g. `Bash(git *)`, `Write(.forge/**)`, `Edit(src/**)`), THE hook SHALL be migrated to use the `if:` field, with the inline guard removed from the `command`.
3. IF an inline condition checks project state beyond tool input (e.g. checking `.forge/.sandbox-active.json` existence), THEN THE condition SHALL remain in the command but be wrapped in the fastest possible check (avoid `jq` / `find`; use `[ -f ... ]`).
4. THE migration SHALL produce a measurable reduction in hook spawn count on a baseline session; baseline measurement (bash-spawn-counter running for 10 minutes of typical `/forge build` workflow) SHALL be captured before and after, with the delta documented in `.forge/runs/<date>-if-migration-baseline.md`.
5. THE migrated `hooks/hooks.json` SHALL pass `claude plugin validate` (if plugin manifest exists) and SHALL NOT change the net hook behavior for any tool call (verified by integration test in Task 1.6).
6. THE dispatcher script from `Phase1_Spec` SHALL be updated where applicable: hooks routed through the dispatcher also honor `if:` filters at the settings.json level (the dispatcher itself does not need re-entry filtering since `if:` prevents invocation entirely).

### Requirement 2: PreCompact / PostCompact 边界状态保护

**User Story:** As a developer whose Forge session undergoes automatic compaction mid-task, I want the session to retain the current spec, phase, and active progress pointer after compaction, so that I don't need to manually re-explain context to Claude Code.

#### Acceptance Criteria

1. THE project SHALL register a PreCompact_Hook at `scripts/hook-precompact.sh` that, before compaction begins, writes a Compaction_Snapshot file at `.forge/.compact-snapshot.md` containing: (a) current slug from `.forge/status.md` frontmatter, (b) current phase, (c) last-3-line tail of the active `.forge/progress/<slug>.md`, (d) active PR number (if `--from-pr` was used), (e) ISO 8601 timestamp.
2. THE project SHALL register a PostCompact_Hook at `scripts/hook-postcompact.sh` that, after compaction completes, reads the Compaction_Snapshot, emits its contents to stdout (injected into post-compaction context), and deletes the snapshot file.
3. IF the PreCompact_Hook cannot read `.forge/status.md` (missing or unparseable), THEN THE hook SHALL exit 0 without writing a snapshot and without blocking compaction; a one-line warning is written to `.forge/runs/<date>-compact-events.jsonl`.
4. IF the PostCompact_Hook runs but no snapshot exists (e.g. PreCompact failed or was skipped), THEN THE hook SHALL exit 0 silently; no fallback reconstruction is attempted.
5. THE Compaction_Snapshot file SHALL be added to `.gitignore` to prevent accidental commit, since it is a transient runtime artifact.
6. THE PreCompact_Hook SHALL NEVER call `exit 2` (blocking compaction); blocking is reserved for catastrophic integrity checks which are out of scope for this requirement.
7. THE compaction events (snapshot written, snapshot restored, snapshot missing) SHALL be logged to `.forge/runs/<date>-compact-events.jsonl` in the same format as the frozen-events jsonl (if that spec has landed), or in a minimal `{timestamp, event, slug}` schema otherwise.

### Requirement 3: Agent `hooks:` frontmatter 使用

**User Story:** As a Forge maintainer wanting agent-specific side effects without bloating the global hooks.json, I want each Phase1-migrated agent to own its lifecycle hooks via frontmatter, so that agent changes are co-located with their triggers.

#### Acceptance Criteria

1. THE `forge-build` agent definition (`.claude/agents/forge-build.md`) SHALL declare a `hooks:` frontmatter block containing at least a `Stop` hook that runs `npm run check` (or the command from `.forge/config.md` `ci_check_command` field) before allowing session completion; if the check fails, the hook returns `{"continue": false, "stopReason": "..."}`.
2. THE `forge-ship` agent definition SHALL declare a `hooks:` frontmatter block containing a `PreToolUse` hook for `Bash(git push*)` that verifies the branch is not main/master before allowing push; if the branch check fails, hook returns `exit 2` with a clear stderr message.
3. WHEN an agent declares lifecycle hooks via frontmatter, THE corresponding entries in global `hooks/hooks.json` SHALL be removed (or gated with `if:` to avoid double-firing) to prevent duplicate execution.
4. THE contract test SHALL assert that `forge-build.md` and `forge-ship.md` both contain a `hooks:` frontmatter block and that the referenced script paths resolve.
5. THE agent frontmatter `hooks:` syntax SHALL follow Claude Code's native schema (see docs at https://code.claude.com/docs/en/hooks) and SHALL use `command` type hooks (not `prompt` / `agent` / `http` types) in this spec.
6. IF an agent's frontmatter hook cannot be expressed cleanly (e.g. requires complex shared state), THEN THE hook SHALL remain in global `hooks/hooks.json` with a comment referencing the agent that owns the behavior.

### Requirement 4: Agent `initialPrompt` 使用

**User Story:** As a `/forge plan` user, I want the plan agent to always start with the same kickoff question (reading spec, asking about scope), so that I don't need to type or rely on the caller to inject the kickoff prompt.

#### Acceptance Criteria

1. THE `forge-plan` agent definition SHALL declare an `initialPrompt` frontmatter field with a concise kickoff prompt (≤500 characters) instructing the agent to: (a) read `.forge/specs/<slug>/spec.md` if a slug is provided, (b) summarize the understood scope in ≤5 bullet points, (c) ask clarifying questions via `AskUserQuestion` before drafting the plan.
2. WHEN `/forge plan <slug>` is invoked, THE agent SHALL execute the initialPrompt automatically as turn 1; the caller SHALL NOT need to repeat the kickoff instructions in the user prompt.
3. THE `initialPrompt` SHALL NOT reference files that may not exist (e.g. if called without a slug); the prompt SHALL handle "no slug provided" gracefully by asking the user for one.
4. THE contract test SHALL assert `forge-plan.md` contains an `initialPrompt` frontmatter field with length between 50 and 500 characters.
5. IF `forge-review` or `forge-ship` have a natural kickoff prompt pattern, THEN they MAY also adopt `initialPrompt`; if their kickoff is better left to the caller, this is not required. The decision is documented in design.md.

### Requirement 5: Agent `isolation: "worktree"` 启用（forge-build）

**User Story:** As a developer running `/forge build` on a branch while I continue editing files on main, I want the build agent to work in an isolated git worktree so that my unsaved changes don't conflict and so that a failed build doesn't leave my working tree in a weird state.

#### Acceptance Criteria

1. THE `forge-build` agent definition SHALL declare `isolation: "worktree"` in its frontmatter, causing Claude Code to auto-create a worktree from `origin/<default-branch>` (or from `HEAD` if `worktree.baseRef: "head"` is set in settings) for the agent session.
2. WHEN the `forge-build` agent completes (success or failure), THE worktree SHALL be cleaned up automatically by Claude Code; Forge-level scripts that previously managed worktrees manually SHALL be audited and either removed or downgraded to "legacy" status with a deprecation comment.
3. IF existing Forge scripts (`scripts/*.sh`) have their own worktree creation logic, THEN THE scripts SHALL be checked for double-worktree scenarios: if a script spawns forge-build agent, the script's own worktree creation is either removed or guarded with a feature flag.
4. THE `.forge/` directory SHALL remain project-local and unaffected by the worktree (verified by test: spawning forge-build agent with worktree isolation, writing to `.forge/progress/<slug>.md`, then verifying the file lands in the original repo not the worktree).
5. THE `forge-plan`, `forge-review`, `forge-ship` agents SHALL NOT use `isolation: "worktree"` in this spec; they read/write project state that must live in the main repo. This scope boundary is enforced by contract test (only forge-build has the field).
6. THE `.forge/config.md` SHALL document the new worktree behavior in the "AI 可自由修改" section, noting that `forge-build` runs in an isolated worktree by default.

### Requirement 6: Hooks Dispatcher 剩余事件迁移

**User Story:** As a Forge maintainer completing the Phase1 dispatcher work, I want the remaining 4 hook events (PreToolUse / PostToolUse / Stop / TeammateIdle) to route through the unified dispatcher, so that all hook logic is co-located and individually toggleable.

#### Acceptance Criteria

1. THE Dispatcher_Remaining_Events SHALL be migrated from `.claude/settings.json` inline commands into the `scripts/dispatcher.sh` case-switch, preserving each event's current behavior exactly.
2. WHEN the dispatcher handles PreToolUse, THE exit code semantics SHALL follow Claude Code source (`src/utils/hooks/hooksConfigManager.ts:getHookEventMetadata`): `exit 0` = allow, `exit 2` = deny-and-block (stderr visible to model), other = show stderr but continue.
3. WHEN the dispatcher handles Stop, THE exit code SHALL similarly map: `exit 0` = allow completion, `exit 2` = block completion (stderr visible to model, session continues), other = show stderr but continue.
4. THE dispatcher SHALL respect the `Hook_If_Filter` from Req 1: events already filtered at settings.json `if:` level do not re-enter the dispatcher if the filter excludes them; the dispatcher itself does NOT implement a second `if:` layer.
5. THE individual event handlers within the dispatcher SHALL be factored into separate functions (`handle_pretool()`, `handle_posttool()`, `handle_stop()`, `handle_teammate_idle()`) for readability; functions SHALL return via explicit `return <code>`, not fall through.
6. AFTER migration, the `.claude/settings.json` `hooks` field SHALL contain exactly one dispatcher entry per event type; inline commands are eliminated except for those that legitimately cannot be expressed in the dispatcher (e.g. dependency on external scripts with unique timeout requirements, which are documented).
7. THE contract test SHALL assert the dispatcher script contains `handle_*` functions for all 6 event types (SessionStart, UserPromptSubmit already from Phase 1 + 4 new ones).

### Requirement 7: `.claude/rules/` 完整迁移

**User Story:** As a Forge user whose CLAUDE.md got trimmed in Phase 1 but still references some path-specific conventions globally, I want those conventions to live in `.claude/rules/` and load only when relevant files are touched, so that Claude Code's default context stays lean.

#### Acceptance Criteria

1. THE project SHALL migrate three rules from the Rules_Candidate_List into `.claude/rules/`: `forge-src.md` (paths: `forge/src/**`, `src/**`), `skill-editing.md` (paths: `.claude/skills/**/SKILL.md`, `skills/**/SKILL.md`), `branch-protection.md` (paths: `**/*.ts`, `**/*.md` — triggers on most edits).
2. EACH new rule file SHALL have YAML frontmatter with a `paths:` field (list or string) using gitignore-style globs; the field name is exactly `paths` (lowercase plural), matching Claude Code source.
3. THE content of each rule SHALL be extracted from existing documentation (CLAUDE.md, `.forge/features/`, or existing SKILL.md files) WITHOUT modifying the rule text; the migration is "move + reference", not "rewrite".
4. WHEN content is moved out of CLAUDE.md, THE CLAUDE.md SHALL either retain an `@path` reference or delete the section if it is fully covered by the rule; CLAUDE.md's line count SHALL NOT increase post-migration.
5. THE `forge-src.md` rule SHALL contain TypeScript/JavaScript coding conventions extracted from existing Forge docs: strict null checks, `.forge/config.md` config reading patterns, import ordering, test co-location rules.
6. THE `skill-editing.md` rule SHALL enforce: SKILL.md frontmatter must contain `name`, `description`; wire format conventions; `allowed-tools` field uses hyphens not camelCase.
7. THE `branch-protection.md` rule SHALL enforce: never commit to main/master directly; branch naming convention (`forge/<slug>`, `feature/<slug>`); use `/forge ship` not manual push.
8. THE contract test SHALL assert these three rule files exist with valid frontmatter and non-empty bodies; and assert that CLAUDE.md either references them via `@path` or omits the corresponding content entirely.

### Requirement 8: CLAUDE.md 第二轮瘦身（条件执行）

**User Story:** As a maintainer verifying Phase 1 results, I want a post-Phase-1 measurement and an optional second trim pass, so that CLAUDE.md stays at or below the 200-line target after Req 7 rule extractions may create new opportunities.

#### Acceptance Criteria

1. THE project SHALL re-measure `wc -l CLAUDE.md` after Req 7 migrations complete; the measurement SHALL be recorded in `.forge/runs/<date>-claude-md-baseline.md`.
2. IF the line count exceeds 200, THEN additional content SHALL be moved to `.claude/rules/` (new rule files beyond Req 7 list) or `.forge/docs/living/` (long-form docs), until the count ≤ 200.
3. IF the line count is already ≤ 200, THEN this requirement is satisfied with only the measurement step; no further trimming is forced.
4. THE trimming SHALL be zero-information-loss: every removed paragraph is either in a new rule file (referenced via `@path`) or in a living doc (referenced via `@path`); nothing is deleted outright.
5. THE `@path` references SHALL be in leaf text nodes (not inside code blocks or HTML comments), per Claude Code source parsing semantics.

### Requirement 9: CC_Minimum_Version 声明与校验

**User Story:** As a new Forge user with an older Claude Code install, I want a clear error message if my version is too old, so that I upgrade immediately instead of hitting subtle feature failures.

#### Acceptance Criteria

1. THE `scripts/init.sh` SHALL check the output of `claude --version` against the CC_Minimum_Version (`2.1.121`); if lower, the init script SHALL print a clear upgrade message and exit with code 1 before writing any project files.
2. THE `README.md` SHALL state the CC_Minimum_Version and recommended version in the "前置条件" section, with a link to the Claude Code install docs.
3. THE `CHANGELOG.md` SHALL note the version bump under the phase2 spec's release entry, with a rationale pointing to the features that require 2.1.121+ (PostToolUse `updatedToolOutput`, agent `hooks:` frontmatter improvements, etc.).
4. THE `/forge status` command SHALL detect and warn when running on a CC version below the recommended version (`≥2.1.138`), without blocking; the warning includes the delta between actual and recommended.
5. IF any feature added by this spec requires a CC version newer than 2.1.121, THEN the feature SHALL gracefully degrade with a warning instead of hard-failing, unless the degradation would cause silent incorrectness.
6. THE `claude --version` parsing SHALL handle both canonical `2.1.121` semver output and pre-release suffixes (e.g. `2.1.121-beta.1`); parsing failures fall back to "warn but allow" behavior.

### Requirement 10: 契约测试与文档更新

**User Story:** As a Forge maintainer, I want the phase2 additions covered by contract tests and reflected in CHANGELOG / README, so that regressions are caught and users discover the improvements.

#### Acceptance Criteria

1. THE `test/contract.test.ts` (or a new `test/phase2.contract.test.ts`) SHALL assert:
   - `hooks/hooks.json` contains at least N entries with `if:` field (where N matches Req 1 migration scope)
   - `scripts/hook-precompact.sh` and `scripts/hook-postcompact.sh` exist and are executable
   - `.claude/agents/forge-build.md` contains `hooks:` and `isolation: "worktree"` frontmatter fields
   - `.claude/agents/forge-ship.md` contains `hooks:` frontmatter
   - `.claude/agents/forge-plan.md` contains `initialPrompt` frontmatter
   - `.claude/rules/forge-src.md`, `.claude/rules/skill-editing.md`, `.claude/rules/branch-protection.md` exist with valid `paths:` frontmatter
2. THE `CHANGELOG.md` SHALL have a new unreleased entry or phase2-specific release documenting: `[CHANGED]` hooks `if:` migration, `[ADDED]` PreCompact/PostCompact protection, `[CHANGED]` agent frontmatter improvements, `[ADDED]` worktree isolation for forge-build, `[ADDED]` 3 new lazy-loaded rules, `[CHANGED]` CC minimum version bumped to 2.1.121.
3. THE `README.md` SHALL be updated in three places: "前置条件" (Req 9.2), "Claude Code 集成" (document agent frontmatter improvements), "安全与信任" (note compaction protection).
4. THE `.forge/decisions/` SHALL include an ADR recording this phase2 work, with references to specific Claude Code versions for each native capability used, and a rollback plan should any single change prove problematic.
5. THE handover from `ccbp-inspired-hardening` Phase 1 SHALL be documented: what Phase 1 deferred, what Phase 2 completed, what remains open (e.g. if any Rules_Candidate_List item was deferred again).
6. `npm run check` and `npx vitest run` SHALL pass after all phase2 changes.
