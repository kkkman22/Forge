---
status: completed
feature: cursor-team-kit-integration
layout: requirements
created: 2026-05-08
tier: standard
---
# Requirements Document

## Introduction

本特性将 Cursor 团队内部 `cursor-team-kit` 工作流中被验证有效的 9 条学习点整合进 Forge 项目，在不破坏现有 13 个 SKILL 契约和三区文件保护模型的前提下，补齐 Forge 在"证据化验证、PR 评审交互、终端 / 浏览器 E2E 验证、合并冲突的 Forge 感知处理、项目原子规则、复盘与偏好提炼、本地化交付后复验"七类能力上的缺口。

价值来源：Cursor 在一个真实工程团队内部跑通的 17 skills + 1 agent + 2 rules 工作流，经我们与 Forge 现状（12 slash-command、三维路由、`.tinkerman/` 三区、Forge Loop 自主引擎、Hooks 冻结保护、3526 个测试）对比后，选取 ROI 最高的 9 条学习点。本特性的关键约束是"中立化落地"：Cursor 的依赖假设（GitHub `gh` CLI、`is_background`、CI 驱动）被替换为 Forge 的栈（Bitbucket Server + 可选 MCP、Claude Code `background: true`、无 CI 的本地复验）。

业务价值：

1. 把"改完声称通过"降级为"证据链化 VERIFIED/NOT VERIFIED/INCONCLUSIVE"三态结论，与 Forge 既有 P5 证据链（`[Command] → [Output] → [Claim]`）一致。
2. 给 PR 评审产出单页暗色 HTML 画布，把三层 Subagent 的发现并列呈现，降低复查负担。
3. 为 CLI 和 UI 两类交付物补齐"外部进程级"验证回路，优先利用 cmux 能力，对其他环境零侵入降级。
4. 让合并冲突处理尊重 Forge 的冻结 / 受保护 / 开放三区语义，不再一律三路合并。
5. 引入 `rules/` 原子规则层，与既有 `.tinkerman/knowledge/evolved-rules.md` 动态规则互补。
6. 把会话中反复出现的偏好沉淀为"候选规则"，缩短人类反复纠正 AI 的摩擦。
7. 弥补"无 CI"场景下的发布后复验空缺，最大限度降低 rebase/merge 后的静默破坏。

## Glossary

- **Cursor_Team_Kit**：Cursor 团队内部 plugins 仓库中 `cursor-team-kit/` 目录的工作流套件（17 skills + 1 agent + 2 rules），本特性整合该套件中的学习点。
- **Forge**：本项目，Claude Code 的 AI 编码工作流 skill 包，对外以 `/forge` 命令族驱动 decide → spec → plan → build → review → test → ship → learn 八阶段。
- **SKILL_Document**：`skills/<name>/SKILL.md`，Forge 指令的正文定义，受 3 KB / SKILL.md 上限与 frontmatter 校验约束。
- **Subagent**：通过 Claude Code Agent tool 独立派发的子代理，有独立上下文；`background: true` 表示以后台方式派发。
- **Forge_Loop**：`forge-loop` CLI，基于 Claude Agent SDK 的自主循环执行引擎，与 `/forge` 互补。
- **Three_Zone_Model**：Forge 的三区文件保护模型，分为 Frozen_Zone / Guarded_Zone / Open_Zone（详见下文 4 条）。
- **Frozen_Zone**：冻结区，`.tinkerman/specs/*/spec.md`（status=locked）、`.tinkerman/plans/*.md`（status=approved）、`.tinkerman/config.md` 等；PreToolUse hook 硬阻断写入。
- **Guarded_Zone**：受保护区，`.tinkerman/progress/**`、`.tinkerman/reviews/**`、`.tinkerman/knowledge/instincts.md`、`.tinkerman/knowledge/known-failures.md`、`.tinkerman/knowledge/solutions/**`、`.tinkerman/decisions/ADR-*.md`；允许追加，不允许删除 / 覆盖已有内容。
- **Open_Zone**：开放区，`.tinkerman/status.md`、`.tinkerman/findings/**`、`.tinkerman/debug/**`、`.tinkerman/knowledge/sessions/**` 等；允许自由读写。
- **Forge_Verify**：本特性新增 SKILL，对应 Cursor `verify-this`，输出三态结论 VERIFIED / NOT_VERIFIED / INCONCLUSIVE。
- **Three_State_Verdict**：forge-verify 的结论枚举：`VERIFIED` / `NOT_VERIFIED` / `INCONCLUSIVE`，每一态必须附证据链。
- **Falsifiable_Claim**：可证伪声明，格式为 `condition + metric + threshold`（例如 "在 N=1000 时 p95 延迟 ≤ 200 ms"）。
- **Deslop_Dimension**：AI 代码异味清洗，作为 `quality-check` Subagent 的新维度，不新增独立 SKILL。
- **Rules_Directory**：项目根目录 `rules/`，每条原子规则一个 `.md` 文件，frontmatter 含 `alwaysApply: true`。
- **Atomic_Rule**：`rules/*.md` 中的单条规则；与 `.tinkerman/knowledge/evolved-rules.md` 中的动态演化规则互补。
- **Canvas**：`/forge review --canvas` 生成的单页暗色 HTML 评审产物，路径 `.tinkerman/reviews/<topic>.canvas.html`。
- **Harness**：对 CLI / UI 交付物的外部进程级验证套件，分 CLI harness 和 UI harness 两类。
- **CLI_Harness**：本特性新增 SKILL `forge-control-cli`，对应 Cursor `control-cli`，用于 CLI / TUI 程序验证。
- **UI_Harness**：本特性新增 SKILL `forge-control-ui`，对应 Cursor `control-ui`，用于 Web / Electron UI 程序验证。
- **cmux**：用户本机运行的 Ghostty-based 原生 macOS 终端，提供 Unix-socket JSON-RPC、浏览器自动化、`set-progress`、`log`、`notify` 等命令；通过 `$CMUX_WORKSPACE_ID` 或 `/tmp/cmux.sock` 存在检测。
- **Fix_Conflicts**：本特性新增 SKILL `forge-fix-conflicts`，Forge 感知的合并冲突解决器，不是通用冲突解决器。
- **Conflict_Classifier**：新增纯函数模块 `src/conflict-classifier.ts`，对未合并文件返回 `"frozen" | "guarded" | "open" | "source"`。
- **Recap**：本特性新增 SKILL `forge-recap`，时间窗回顾（`--since 1d/7d/<range>`）。
- **From_Chats**：`forge-learn --from-chats` 新增模式，从 `.claude/` 会话转写中提取偏好候选。
- **Preference_Atom**：从会话中提取的最小单元，含 trigger / workflow_step / decision_rule / quality_bar / stop_condition / evidence / confidence 七字段。
- **Post_Push_Verify**：`/forge ship` 推送完成后运行一次 `npm run check` 的本地复验，失败写入 `.tinkerman/ship/<topic>-post-push-verify.md`。
- **Bitbucket_MCP**：Bitbucket Server Data Center 的 MCP，提供 `get_pull_request_diff`、`create_pr_task`、`add_comment` 等结构化工具；本特性中总是"可选增强"。
- **Evidence_Chain**：Forge 既有的 P5 证据链格式：`[Command] → [Output] → [Claim]`。
- **Background_Subagent**：Claude Code 原生支持的后台派发，frontmatter 字段 `background: true`（与 Cursor 的 `is_background` 不同）。
- **Evolution_Marker**：Forge 既有机制，SKILL 运行产物中以 `Evolution: target=<skill>#<marker>` 形式标记应回流到 `.tinkerman/knowledge/known-failures.md` 等知识文件的事件。
- **Quality_Check_Subagent**：`.claude/agents/quality-check.md` 定义的 Layer 2 评审代理；本特性扩展其维度，但不改变其外部契约。

## Requirements

### Requirement 1: 证据化验证 SKILL（forge-verify）

**User Story:** As a Forge developer, I want an evidence-based verification SKILL with a three-state verdict, so that "it should work" claims are replaced by reproducible baseline-vs-treatment artifacts tied to a falsifiable claim.

#### Acceptance Criteria

1. WHEN the user runs `/forge verify <topic>` or the orchestrator triggers verification, THE Forge_Verify SKILL SHALL write a Three_State_Verdict to `.tinkerman/findings/<topic>/verify-this/verdict.md` where `VERIFIED` indicates treatment artifacts satisfy the Falsifiable_Claim threshold while baseline artifacts do not, `NOT_VERIFIED` indicates treatment artifacts fail the Falsifiable_Claim threshold, and `INCONCLUSIVE` indicates any required artifact is missing, unreadable, or the Falsifiable_Claim is incomplete.
2. WHEN Forge_Verify begins, THE Forge_Verify SKILL SHALL restate the input as a Falsifiable_Claim with non-empty `condition`, `metric`, and `threshold` fields in `.tinkerman/findings/<topic>/verify-this/claim.md` before capturing any artifacts.
3. IF the Falsifiable_Claim is missing any of the `condition`, `metric`, or `threshold` fields, or any field is empty, THEN THE Forge_Verify SKILL SHALL abort artifact capture, set the Three_State_Verdict to `INCONCLUSIVE`, and record the missing or empty field names in `verdict.md`.
4. THE Forge_Verify SKILL SHALL capture, under each of `.tinkerman/findings/<topic>/verify-this/baseline/` and `.tinkerman/findings/<topic>/verify-this/treatment/`, at least one command-invocation log recording the executed command and its exit status plus one metric output referenced by the Falsifiable_Claim's `metric` field, and SHALL write a pre-computed difference between the baseline and treatment metric outputs to `.tinkerman/findings/<topic>/verify-this/diff/`.
5. THE Forge_Verify SKILL SHALL emit the verdict using the existing Evidence_Chain format `[Command] → [Output] → [Claim]`, with exactly one chain entry per captured artifact and each entry referencing the artifact's path relative to `.tinkerman/findings/<topic>/verify-this/`.
6. IF the baseline or treatment capture step fails to produce the command-invocation log or the metric output required by the Falsifiable_Claim, THEN THE Forge_Verify SKILL SHALL set the Three_State_Verdict to `INCONCLUSIVE`, record each missing artifact's expected path and the failure reason in `verdict.md`, and preserve any artifacts already captured without deletion or rollback.
7. WHEN `/forge verify` is invoked inside bugfix tier routing (project_phase = bugfix), THE Forge_Verify SKILL SHALL auto-trigger without further user confirmation.
8. WHEN `/forge debug` completes its Phase 4 fix verification, THE Forge_Debug SKILL SHALL invoke Forge_Verify on the reproduction test as its final step before marking the debug session resolved.
9. THE Forge_Verify SKILL SHALL act as the canonical output consumer for CLI_Harness (Requirement 5) and UI_Harness (Requirement 6), meaning both harness SKILLs SHALL write their `verdict.md` containing the Three_State_Verdict value, the Falsifiable_Claim, and one Evidence_Chain entry per captured artifact, and Forge_Verify SHALL parse and re-emit this `verdict.md` without altering the Three_State_Verdict value or the Evidence_Chain entries.
10. THE Forge_Verify SKILL SHALL determine the `baseline` reference using the following priority order: (1) a user-supplied `--baseline <git-ref>` flag resolved via `git rev-parse`, (2) the merge-base of the current branch against `origin/main` when running inside a git repository with remote `origin`, (3) the parent commit `HEAD^` when running inside a git repository without remote `origin`, (4) the last successful verify run's treatment snapshot under `.tinkerman/findings/<topic>/verify-this/treatment/` when no git context is available. IF none of (1)–(4) resolves, THEN THE Three_State_Verdict SHALL be `INCONCLUSIVE` with `verdict.md` recording "no baseline reference available".
11. THE `commands/forge.md` file SHALL register `/forge verify <topic>` as a recognized subcommand with an argument specification accepting `<topic>` as a required string and `--baseline <git-ref>` as an optional flag; the Forge router SHALL dispatch matching invocations to the Forge_Verify SKILL.
12. THE Forge_Verify SKILL_Document SHALL be under 3072 bytes, keeping detailed workflow content in `skills/forge-verify/references/*.md`.

### Requirement 2: AI 代码异味清洗维度（forge-deslop 作为 quality-check 维度）

**User Story:** As a Forge reviewer, I want AI-specific code-slop patterns to be flagged during `/forge review`, so that defensive try/catch on trusted paths, `any` casts, redundant comments, and over-nested control flow do not ship as technical debt.

#### Acceptance Criteria

1. THE Quality_Check_Subagent SHALL include a Deslop_Dimension as an additional review dimension appended to the existing dimension set (命名 / 错误处理 / 性能 / 测试覆盖率 / 代码重复 / 可维护性) within the Layer 2 review flow, without adding a top-level SKILL directory or a new subagent.
2. THE Deslop_Dimension SHALL flag at minimum these AI-slop patterns: (a) comments whose content is a natural-language paraphrase of the immediately following executable statement and convey no information beyond the code itself, (b) `try / catch` blocks whose protected body contains only calls that static analysis of the current call graph shows to have no throw path (pure accessors, literals, or already-handled operations), (c) `as any` or `<any>` casts that suppress an existing TypeScript compiler error rather than model a real union type, (d) control-flow nesting of depth ≥ 4, counted as nested `if` / `for` / `while` / `switch` / `try` blocks within a single function, that can be flattened via early return.
3. WHEN `/forge review` is triggered, THE Quality_Check_Subagent SHALL run the Deslop_Dimension automatically and append its findings as additional rows in the existing Layer 2 Markdown table output under the existing Severity / File / Issue / Suggestion columns.
4. THE Quality_Check_Subagent's external contract (its Markdown output schema: Severity / File / Issue / Suggestion columns) SHALL remain unchanged, and the Deslop_Dimension SHALL NOT introduce new columns, new output sections, or new output files, so downstream consumers (review report writer, P1 Fix Checklist) need no modification.
5. WHEN the Deslop_Dimension identifies the same pattern ≥ 2 times across the files reviewed in a single `/forge review` run, THE Quality_Check_Subagent SHALL emit exactly one Evolution_Marker for that pattern targeting `.tinkerman/knowledge/known-failures.md`, carrying the pattern name and its occurrence count, so the pattern is captured as a recurring failure.
6. THE Deslop_Dimension findings SHALL inherit the existing severity heuristics as follows: P1 for patterns that mask errors or cause malfunction (e.g., `as any` suppressing a real type error, `try / catch` swallowing a statically fallible path), P2 for style or duplication issues (e.g., restated comments, flattenable nesting ≥ 4), and P3 for incomplete or purely redundant comments that do not affect behavior, rather than introducing a new severity scheme.
7. IF the Deslop_Dimension execution raises an uncaught exception, exceeds a 60-second wall-clock budget, or returns output that cannot be parsed into the Severity / File / Issue / Suggestion schema, THEN THE Quality_Check_Subagent SHALL continue the Layer 2 review with the remaining five dimensions and annotate exactly `deslop: skipped` as a row or trailing footnote in the Markdown output, so partial reviews are never silently reported as complete.

### Requirement 3: 原子规则目录（rules/）

**User Story:** As a Forge user, I want a stable, cross-project `rules/` directory of atomic rules with lint-hook bindings, so that static rules are installed during init and dynamic project-specific rules continue to flow through `.tinkerman/knowledge/evolved-rules.md`.

#### Acceptance Criteria

1. THE Forge project SHALL create a top-level `rules/` directory where each rule is a separate `.md` file.
2. THE `rules/<name>.md` file SHALL contain frontmatter with a boolean `alwaysApply` field plus a `lint_binding` field whose value is one of: (a) `null` when no lint rule enforces this, (b) a single string in the form `"<engine>/<rule>"` (e.g., `"biome/noExplicitAny"`, `"eslint/@typescript-eslint/no-explicit-any"`) when exactly one lint engine covers it, or (c) an object `{biome: "<rule>", eslint: "<rule>"}` when both engines cover it independently.
3. THE initial release SHALL ship with at least three starter rules: `rules/typescript-exhaustive-switch.md`, `rules/no-inline-imports.md`, and `rules/no-any-cast.md`.
4. WHEN `scripts/init.sh` runs and the user selects a stack that includes TypeScript, THE init script SHALL install the applicable rules from the Forge distribution into the target project's `rules/` directory.
5. THE `rules/*.md` layer (static, cross-project) and the `.tinkerman/knowledge/evolved-rules.md` layer (dynamic, project-specific) SHALL coexist; `rules/*.md` SHALL NOT be written by `/forge learn` and `evolved-rules.md` SHALL NOT be managed by `init.sh`.
6. WHEN the Quality_Check_Subagent runs during `/forge review`, THE reviewer SHALL read `rules/*.md` at session start and check the code against each Atomic_Rule whose `alwaysApply` is `true`.
7. IF a rule's `lint_binding` is non-null, THEN THE rule's violation finding SHALL reference the lint rule name in the `Suggestion` column so the developer can toggle it in their editor config.
8. THE `rules/` directory SHALL be excluded from the Frozen_Zone; users MAY edit their own rules directly, and Forge SHALL NOT enforce frontmatter validation beyond the required `alwaysApply` field.

### Requirement 4: 交互式 HTML 评审画布（forge-review --canvas）

**User Story:** As a code reviewer on a Bitbucket-hosted project, I want `/forge review --canvas` to generate a single-page dark-themed HTML artifact from local Forge data with optional Bitbucket MCP enrichment, so that I can review PRs without depending on GitHub or CI pipelines.

#### Acceptance Criteria

1. WHEN the user runs `/forge review --canvas <topic>`, THE Forge_Review SKILL SHALL write a single-page HTML file to `.tinkerman/reviews/<topic>.canvas.html`.
2. THE Canvas generation SHALL use the following data-source priority, where items 1–3 are required and item 4 is optional enrichment: (1) `.tinkerman/reviews/<topic>.md` (Forge three-layer findings), (2) `git diff origin/main...HEAD` output, (3) `git log --oneline origin/main..HEAD` output, (4) Bitbucket_MCP structured data (PR comments, reviewer status, tasks).
3. WHERE Bitbucket_MCP is not installed or returns an error, THE Canvas generation SHALL degrade gracefully and produce a complete HTML artifact using only items 1–3, without rendering error banners that imply missing data is a failure.
4. THE Canvas HTML SHALL display a three-column layout containing `spec-check`, `quality-check`, and `security-check` findings side-by-side, visually distinguishing the three Forge review layers.
5. WHEN a single changed file contains ≥ 150 lines of retry / error-handling / boilerplate code, THE Canvas HTML SHALL render a pseudocode summary card containing plain-English pseudocode plus an expandable full-diff section for that file.
6. WHERE Bitbucket_MCP is available, THE Canvas HTML SHALL render a "Sync to PR" button that, when clicked, invokes `add_comment` and `create_pr_task` via Bitbucket_MCP to push the Forge findings to the PR.
7. WHEN `.tinkerman/reviews/<topic>.md` does not exist for the given `<topic>`, THE Forge_Review SKILL SHALL block Canvas generation and instruct the user to run `/forge review` first.
8. THE Canvas HTML SHALL embed finding data as a safe JSON island (injected via `JSON.stringify` with HTML-escape of `<`/`>`/`&`) rather than inline template interpolation, to prevent XSS from review finding text.
9. THE Canvas generation SHALL complete in under 5 seconds on a PR with ≤ 50 changed files and ≤ 5000 lines of diff, measured locally on macOS with SSD storage (see also Requirement 12).
10. THE Canvas template (CSS + JS) SHALL be derived from Cursor's open-source `pr-review-canvas` template and attributed in `skills/forge-review/references/canvas.md`.
11. WHEN Canvas generation invokes Bitbucket_MCP, THE invocations SHALL apply the 10-second connection timeout and 15-second response timeout defined in Requirement 14.1–14.2; timeouts and error responses SHALL be treated as missing enrichment per AC 3 and AC 8, not as hard failures.

### Requirement 5: CLI / TUI 验证套件（forge-control-cli）

**User Story:** As a Forge developer shipping a CLI tool such as `forge-loop`, I want a harness SKILL that drives CLI programs through cmux, tmux, or Node PTY, so that I can run end-to-end terminal verification including SIGINT handling and resume behavior without adding external dependencies to user projects.

#### Acceptance Criteria

1. WHEN `/forge test` is invoked AND any of the following conditions is true — (a) the project's `package.json` `bin` field is a non-empty string or non-empty object, (b) the user passes the flag `/forge test --cli`, or (c) `.tinkerman/config.md` contains a top-level key `cli_harness: true` — THE Forge_Test SKILL SHALL invoke CLI_Harness (forge-control-cli).
2. THE CLI_Harness SHALL detect an available terminal controller using the following priority order: (1) a project-owned harness (existing `test/e2e/*.spec.ts` or expect/pty scripts discovered by glob), (2) cmux (detected by `$CMUX_WORKSPACE_ID` set OR `/tmp/cmux.sock` existing), (3) tmux (detected by `command -v tmux` succeeding), (4) Node PTY fallback (zero external deps).
3. THE CLI_Harness SHALL write output artifacts under `.tinkerman/findings/<topic>/cli-harness/` containing at minimum `before.txt`, `after.txt`, `transcript.log`, and `verdict.md`.
4. WHERE cmux is the active controller AND the verification run exceeds 5 seconds of wall-clock time, THE CLI_Harness SHALL call cmux's `set-progress`, `log --level`, and `notify` commands at least once every 5 seconds to surface verification progress in the cmux sidebar.
5. THE CLI_Harness `verdict.md` SHALL conform to the Forge_Verify Three_State_Verdict schema so Requirement 1 can consume it without translation.
6. WHEN the CLI_Harness is invoked on a non-macOS platform and cmux is not available, THE CLI_Harness SHALL skip the cmux branch and proceed with tmux or Node PTY without error.
7. THE CLI_Harness SHALL run Forge's own `forge-loop-cli.ts` end-to-end tests (SIGINT handling, `--resume` behavior, worktree cleanup) as part of Forge's self-dogfooding test suite.
8. IF no controller tier is available (no project harness, no cmux, no tmux, and Node PTY instantiation fails), THEN THE CLI_Harness SHALL emit `INCONCLUSIVE` verdict with the specific controllers that were tried and why each failed.
9. THE CLI_Harness SHALL NOT add tmux or node-pty as a runtime dependency of Forge itself; Node PTY support MAY use `node:child_process` `spawn` with pipe fallbacks or `require()` guarded imports.

### Requirement 6: Web / Electron UI 验证套件（forge-control-ui）

**User Story:** As a Forge developer working on a UI-bearing project, I want a harness SKILL that drives the browser or Electron host through the project's own tooling (with cmux browser as a zero-install preferred tier), so that UI behavior is verified against the designer-written spec without Forge ever installing Playwright itself.

#### Acceptance Criteria

1. WHEN `/forge test` runs on a project whose dependencies or devDependencies include any of `react`, `vue`, `next`, `electron`, OR the Forge_Decide SKILL produced a UI spec in `.tinkerman/specs/<feature>/spec.md` designer section, THE Forge_Test SKILL SHALL invoke UI_Harness (forge-control-ui).
2. THE UI_Harness SHALL detect an available controller using the following priority order: (1) project-owned harness (existing Playwright, Cypress, Storybook interaction tests discovered by config file presence), (2) cmux browser (detected by the same cmux signals as Requirement 5), (3) Playwright when already present in the project's devDependencies, (4) Chrome DevTools Protocol (CDP) connection when the user has manually launched Chrome with `--remote-debugging-port`.
3. THE UI_Harness SHALL write artifacts under `.tinkerman/findings/<topic>/ui-harness/` containing at minimum `baseline/`, `treatment/`, `console.log`, `errors.log`, and `verdict.md`.
4. WHERE cmux browser is the active controller, THE UI_Harness SHALL use cmux commands `snapshot --interactive --compact` for structured a11y-tree diffs, `screenshot` for human review, the `--snapshot-after` auto-capture mode, `state save` / `state load` for session persistence, `console list` and `errors list` for debug capture, and `wait --function` for custom JS wait conditions.
5. THE UI_Harness SHALL NOT add Playwright, Cypress, Puppeteer, or any browser-automation library as a Forge project runtime or devDependency; it SHALL only consume controllers already present in the user's project.
6. WHEN the designer Subagent has produced a UI spec in `.tinkerman/specs/<feature>/spec.md`, THE UI_Harness SHALL read the designer section, generate UI assertions from it, run them through the active controller, and write any mismatches to `.tinkerman/findings/<topic>/ui-harness/mismatches.md` following the Severity / File / Issue / Suggestion schema; THE Quality_Check_Subagent SHALL read this file at session start and include its entries as additional rows in the Layer 2 review output.
7. THE UI_Harness `verdict.md` SHALL conform to the Forge_Verify Three_State_Verdict schema so Requirement 1 can consume it without translation.
8. WHEN no controller tier is available, THEN THE UI_Harness SHALL emit `INCONCLUSIVE` verdict listing which controllers were attempted and why each was unavailable.
9. WHERE the active controller supports session state, THE UI_Harness SHALL persist state between baseline and treatment capture so navigation sequences do not need to be replayed.

### Requirement 7: Forge 感知的合并冲突解决（forge-fix-conflicts）

**User Story:** As a Forge developer resolving a merge conflict, I want a conflict resolver that respects the Three_Zone_Model so that frozen spec files refuse auto-resolution, guarded knowledge files merge semantically by ID, and source files fall back to conventional three-way merge with a validation gate.

#### Acceptance Criteria

1. THE Fix_Conflicts SKILL SHALL classify every unmerged file into exactly one of four zones: `"frozen"`, `"guarded"`, `"open"`, or `"source"` using a new pure-function module `src/conflict-classifier.ts`.
2. THE Conflict_Classifier function SHALL be a total function: for every path returned by `git diff --name-only --diff-filter=U`, it SHALL return exactly one of the four zones (covering all paths defined in `.tinkerman/config.md` protection sections) and never return `undefined`, `null`, or throw.
3. WHEN a conflict is classified as `"frozen"` (including `.tinkerman/specs/*/spec.md` with status=locked, `.tinkerman/plans/*.md` with status=approved, `.tinkerman/config.md`), THE Fix_Conflicts SKILL SHALL refuse auto-resolution and present three explicit user options: "manual resolve", "unlock then merge", or "abort merge".
4. WHEN the user selects "unlock then merge" after a frozen-zone refusal (AC 3), THE Fix_Conflicts SKILL SHALL set the target file's frontmatter `status` field to `draft`, record the status change in `.tinkerman/debug/unlock-<timestamp>.md`, then perform a conventional three-way merge on the resulting (now non-frozen) file; after the merge, the original `status` value SHALL NOT be automatically restored.
5. WHEN the user selects "manual resolve" after a frozen-zone refusal (AC 3), THE Fix_Conflicts SKILL SHALL preserve the working-tree and index state untouched and exit with instructions for manual edit followed by `git add` and `/forge ship`; WHEN the user selects "abort merge" after a frozen-zone refusal, THE Fix_Conflicts SKILL SHALL execute `git merge --abort` or `git rebase --abort` as appropriate and exit.
6. WHEN a conflict is classified as `"guarded"` and the file matches `.tinkerman/progress/*.md`, THE Fix_Conflicts SKILL SHALL merge entries by `task_id` with the rule "completed > pending; when both sides are `completed`, keep the latest `completed_at` timestamp; if `completed_at` values are equal, prefer ours-side".
7. WHEN a conflict is classified as `"guarded"` and the file is `.tinkerman/knowledge/instincts.md` or `.tinkerman/knowledge/known-failures.md`, THE Fix_Conflicts SKILL SHALL merge entries by `pattern_id` / `failure_id` with `confidence = max(sides)` and `occurred_count = sum(sides)`; when an entry exists on only one side, that side's entry SHALL be kept verbatim.
8. WHEN a conflict is classified as `"guarded"` and the files are filename-conflicting ADRs under `.tinkerman/decisions/ADR-*.md`, THE Fix_Conflicts SKILL SHALL reassign the incoming ADR ID via the existing `nextAdrId` helper and update `.tinkerman/knowledge/adr-index.md` accordingly.
9. WHEN a conflict is classified as `"guarded"` and the file is under `.tinkerman/reviews/*.md`, THE Fix_Conflicts SKILL SHALL append entries from both sides and re-sort by (layer, severity) keys.
10. WHEN a conflict is classified as `"open"` or `"source"`, THE Fix_Conflicts SKILL SHALL perform a conventional three-way merge and surface remaining conflict markers to the user.
11. AFTER any merge resolution, THE Fix_Conflicts SKILL SHALL require the project's check command (per Requirement 14.11–14.12 fallback chain) to pass with exit code 0 before permitting `git add` of the resolved files.
12. IF the check command fails three consecutive times during conflict resolution — where each user-triggered re-run after an intervening file edit counts as a new attempt and an identical re-run without any file edit counts as the same attempt (not incremented) — THEN THE Fix_Conflicts SKILL SHALL invoke `/forge debug` according to the existing Three-Strike Reroute rule.
13. THE Conflict_Classifier module SHALL ship with fast-check property tests verifying totality (Requirement 7.2), stability under path normalization (trailing slash, `./` prefix), and correctness against a curated fixture set of at least 80 path examples (≥ 20 per zone × 4 zones).

### Requirement 8: 发布后本地复验（forge-ship post-push verify）

**User Story:** As a Forge developer without a CI pipeline, I want `/forge ship` to run one local verification pass after pushing the branch or creating the PR, so that issues introduced by merge or rebase are caught before anyone else pulls the branch.

#### Acceptance Criteria

1. WHEN `/forge ship` successfully pushes the branch OR creates a PR, THE Forge_Ship SKILL SHALL execute `npm run check` one more time locally as a Post_Push_Verify step with a 600-second wall-clock timeout; IF the timeout is reached, THE step SHALL be treated as exit code ≠ 0 per AC 2.
2. WHEN Post_Push_Verify fails (exit code ≠ 0 or timeout), THE Forge_Ship SKILL SHALL write `.tinkerman/ship/<topic>-post-push-verify.md` containing the failing command, exit code (or literal `timeout`), and the last 200 lines of combined stdout and stderr output.
3. WHERE Bitbucket_MCP is available AND a PR was created in the same ship invocation, THE Forge_Ship SKILL SHALL call `add_comment` to post a summary comment on the PR with the Post_Push_Verify failure details.
4. WHERE Bitbucket_MCP is not available, THE Forge_Ship SKILL SHALL still write the local artifact (Requirement 8.2) and surface the failure in the ship output, without attempting remote posting.
5. WHEN Post_Push_Verify succeeds, THE Forge_Ship SKILL SHALL record a short success line in the ship output and SHALL NOT create an artifact file.
6. THE Post_Push_Verify implementation SHALL add no more than 50 lines of logic to `skills/forge-ship/SKILL.md` or its backing `src/ship.ts`; broader changes (adding a new SKILL) are out of scope for this requirement.
7. THE `.tinkerman/ship/` directory SHALL be classified as Open_Zone in `.tinkerman/config.md` so Post_Push_Verify artifacts can be freely written.

### Requirement 9: 时间窗复盘 SKILL（forge-recap）

**User Story:** As a Forge developer, I want `/forge recap --since <window>` to produce a time-window retrospective that combines git history, session notes, and Forge Loop run streams with richer-than-upstream categorization, so that I can review recent work and see which evolved rules are candidates for archiving.

#### Acceptance Criteria

1. THE Forge project SHALL add a new `skills/forge-recap/SKILL.md` with parameterized window flags accepting at minimum `--since 1d`, `--since 7d`, and `--since <YYYY-MM-DD>..<YYYY-MM-DD>` date-range syntax.
2. THE Forge_Recap SKILL SHALL combine three data sources within the window: (1) `git log --author=<current-user> --since=<X>` excluding merge commits, (2) `.tinkerman/knowledge/sessions/*.md` whose filename or frontmatter date falls in the window, (3) `.tinkerman/runs/*/` forge-loop event streams whose run timestamps fall in the window.
3. THE Forge_Recap SKILL SHALL classify each recap entry into at least one of these categories: `bugfix`, `tech-debt`, `net-new`, `spec-driven`, `explore`. The last two categories extend Cursor's set by tying to Forge routing tiers (spec-driven = standard or full tier; explore = decide stage work).
4. WHEN Forge_Recap runs, THE Forge_Recap SKILL SHALL additionally scan `.tinkerman/knowledge/evolved-rules.md` for rules whose `Last_triggered` is older than 5 `Session_Boundary` events, where a Session_Boundary is defined as any `/forge` command invocation per CLAUDE.md §6; such rules SHALL be emitted as "archival candidates" in the recap output.
5. WHEN the git author cannot be determined (no `user.email` configured), THEN THE Forge_Recap SKILL SHALL fall back to `.tinkerman/knowledge/sessions/*.md` and `.tinkerman/runs/*/` only, and print a warning explaining the degradation.
6. THE Forge_Recap SKILL_Document SHALL be under 3072 bytes, with implementation detail delegated to `skills/forge-recap/references/*.md`.
7. THE Forge_Recap SKILL SHALL NOT write to Guarded_Zone or Frozen_Zone; its output SHALL be rendered to stdout and optionally to `.tinkerman/findings/recap/<timestamp>.md` as Open_Zone content.

### Requirement 10: 偏好提炼模式（forge-learn --from-chats）

**User Story:** As a Forge user, I want `/forge learn --from-chats` to scan recent `.claude/` transcripts and propose candidate rules for `.tinkerman/knowledge/evolved-rules.md`, so that repeated corrections become durable preferences without bypassing the existing 15-rule cap and 5-session staleness mechanism.

#### Acceptance Criteria

1. WHEN the user runs `/forge learn --from-chats`, THE Forge_Learn SKILL SHALL scan `.claude/` session transcripts within a caller-supplied or default time window (default 7 days).
2. THE Forge_Learn SKILL SHALL extract Preference_Atoms each containing the seven fields: `trigger`, `workflow_step`, `decision_rule`, `quality_bar`, `stop_condition`, `evidence`, `confidence`.
3. THE Forge_Learn SKILL SHALL classify each Preference_Atom's `confidence` into one of four levels using these thresholds: `strong` when the atom appears ≥ 3 times across distinct transcripts with zero contradicting signals; `medium` when the atom appears exactly 2 times with no contradicting signal; `weak` when the atom appears exactly 1 time; `contradicted` when the atom appears ≥ 2 times AND at least 1 matching occurrence is paired with an explicit user correction reversing the rule within the same transcript.
4. WHEN a Preference_Atom has `confidence = strong`, THE Forge_Learn SKILL SHALL write it as a candidate rule into `.tinkerman/knowledge/evolved-rules.md` through the existing distillation pipeline, reusing the 15-rule cap and 5-session staleness mechanism.
5. WHEN a Preference_Atom has `confidence` in `{weak, contradicted}` AND the runtime is `interactive` execution mode, THE Forge_Learn SKILL SHALL present the atom to the user for interactive confirmation before writing; IF the runtime is `autonomous` execution mode, THEN the atom SHALL be discarded and a skip entry appended to `.tinkerman/knowledge/sessions/from-chats-skipped.log` recording the atom summary and the reason.
6. THE Forge_Learn SKILL SHALL NOT promote task-specific corrections (corrections that reference a unique file path, unique PR number, or unique task id) to global rules.
7. WHEN the `.claude/` directory is missing or contains no transcripts in the window, THEN THE `--from-chats` mode SHALL output "no transcripts in window" and exit with success (non-failure).
8. THE `--from-chats` mode SHALL NOT extend the forge-learn SKILL_Document beyond the existing 3072-byte budget; added behavior SHALL live in a new `skills/forge-learn/references/from-chats.md`.

### Requirement 11: 后台 Subagent 标记（Claude-Code-correct 实验）

**User Story:** As a Forge reviewer, I want `quality-check` and `security-check` Subagents to be dispatched with Claude Code's `background: true` field during `/forge review` fan-out, so that long-running review layers do not block the orchestrator while `spec-check` remains synchronous as the gate prerequisite.

#### Acceptance Criteria

1. THE `.claude/agents/quality-check.md` and `.claude/agents/security-check.md` frontmatter SHALL be extended with `background: true`.
2. THE `.claude/agents/spec-check.md` frontmatter SHALL remain synchronous (no `background` field or `background: false`) because it is the review gate prerequisite.
3. THE agent frontmatter SHALL use Claude Code's `model` enum values `haiku` / `sonnet` / `opus` and SHALL NOT use Cursor's `model: fast` or `is_background: true` fields.
4. THE SKILL_Document for `forge-review` SHALL document that background Subagents in Claude Code pre-approve all permissions at dispatch time, which may conflict with Forge's current assumption that `acceptEdits` permission mode is inherited.
5. THE SKILL_Document for `forge-review` SHALL inform users that Claude Code's UI supports manual backgrounding via Ctrl+B as a zero-intrusion fallback if the frontmatter setting is undesirable.
6. IF a background Subagent fails (process exit with non-zero status, tool permission denial, or no tool invocation within the Subagent's configured timeout), THEN THE Forge_Review SKILL SHALL mark that Subagent's result as `failed` in the Layer output, continue collecting results from the remaining Subagents using non-aborting fan-in semantics, and produce the existing Layer 2 Markdown output schema without raising an unhandled exception.
7. IF the Claude Code runtime does not recognize the `background` field (older version), THEN the agent SHALL run synchronously without emitting a configuration error; THE Forge_Review SKILL SHALL produce the identical Markdown output schema (same columns, same severity ordering) regardless of whether the Subagents executed in background or synchronous mode.

### Requirement 12: 非功能性需求（性能、预算、降级、i18n）

**User Story:** As a Forge maintainer, I want explicit non-functional guarantees on performance, token budget, graceful degradation, and i18n parity, so that the new SKILLs land without silently breaking existing constraints.

#### Acceptance Criteria

1. WHEN Canvas is generated for a PR with ≤ 50 changed files and ≤ 5000 lines of diff on macOS with SSD storage, THE Forge_Review SKILL SHALL complete Canvas rendering in under 5 seconds (wall-clock).
2. THE SKILL_Document for each newly added SKILL (forge-verify, forge-recap, forge-control-cli, forge-control-ui, forge-fix-conflicts) SHALL be under 3072 bytes. Detail content SHALL live in `skills/<name>/references/*.md`.
3. IF Bitbucket_MCP is unavailable (not installed, returns an error response, or exceeds the timeouts defined in Requirement 14), THEN THE Forge feature set defined in this document SHALL still function end-to-end using only local git data; Bitbucket_MCP integration SHALL be an additive enrichment layer only.
4. IF cmux is unavailable (no `$CMUX_WORKSPACE_ID` and `/tmp/cmux.sock` absent), THEN THE CLI_Harness and UI_Harness SHALL degrade to the next available controller tier without emitting cmux-specific commands.
5. WHEN this feature is running on a non-macOS platform, THE feature set SHALL function with the cmux branch skipped; no SKILL SHALL require macOS-only primitives.
6. THE user-visible strings in every new SKILL_Document (forge-verify, forge-recap, forge-control-cli, forge-control-ui, forge-fix-conflicts) SHALL have both Chinese and English entries in `locales/zh.json` and `locales/en.json` respectively.
7. WHEN a new helper module (e.g., `src/conflict-classifier.ts` from Requirement 7) is added, THE module SHALL ship with fast-check property tests covering its totality, idempotence where applicable, and at least one round-trip property where applicable, consistent with the existing 109 property-test files.
8. THE `.tinkerman/config.md` schema SHALL NOT gain any required field as a result of this feature; new fields (e.g., `canvas_data_source_priority`, `post_push_verify_enabled`) SHALL be optional with documented defaults so existing projects continue to work without edits.
9. THE existing PreToolUse frozen-zone protection (`scripts/check-frozen.sh` / `src/check-frozen.ts`) SHALL continue to intercept any Write / Edit / Bash attempt against Frozen_Zone paths; no SKILL in this feature SHALL bypass this hook.
10. THE total count of top-level `skills/<name>/SKILL.md` files after this feature lands SHALL be no greater than the current count + 5 (forge-verify, forge-recap, forge-control-cli, forge-control-ui, forge-fix-conflicts); no additional SKILLs beyond these SHALL be added in scope, and forge-deslop SHALL NOT appear as a standalone SKILL (per Requirement 2).
11. THE feature SHALL NOT persist Bitbucket_MCP HTTP Access Tokens in any file under `.tinkerman/`; tokens SHALL be read at call time from the MCP runtime environment only. Log entries, error reports, and HTML artifacts (including Canvas) SHALL redact any authorization header value to `***` before writing to disk, so raw token values never appear in on-disk artifacts.
12. THE `.tinkerman/findings/<topic>/` directories SHALL honor a retention window configurable in `.tinkerman/config.md` via the optional `findings_retention_days` field (default 30 days); entries older than the window SHALL be candidates for archival by `scripts/prune-event-logs.sh` or a comparable pruning step, and pruning failures SHALL NOT block active runs.
13. WHEN two invocations targeting the same `<topic>` run concurrently (e.g., two `forge-verify` runs, or one CLI_Harness plus one UI_Harness), THE implementation SHALL acquire an advisory file lock at `.tinkerman/.locks/<topic>.lock` via the existing `acquireFileLock()` mechanism in `src/run-manager.ts`; the second invocation SHALL fail fast with a clear error message naming the holder of the lock, rather than interleave writes.

### Requirement 13: 不变量与正确性属性

**User Story:** As a Forge contributor writing property tests, I want explicit invariants that must hold for this feature, so that fast-check tests can be written directly from the requirements document.

#### Acceptance Criteria

1. THE Conflict_Classifier SHALL be a total function: `∀ path ∈ git_diff_unmerged_paths → classify(path) ∈ {"frozen","guarded","open","source"}`.
2. THE Conflict_Classifier SHALL be deterministic: `classify(normalize(p)) = classify(p)` where `normalize` strips trailing slashes and leading `./`.
3. THE Forge_Verify verdict state machine SHALL be total: every run produces exactly one of `VERIFIED`, `NOT_VERIFIED`, `INCONCLUSIVE` and no other state is reachable.
4. THE Forge_Verify artifact layout SHALL satisfy the invariant: if `verdict.md` contains `VERIFIED`, then both `baseline/` and `treatment/` directories contain at least one artifact file.
5. THE `rules/*.md` files SHALL satisfy a parse-print round-trip property: parsing the frontmatter and serializing it back SHALL produce an equivalent frontmatter object (standard YAML frontmatter round-trip).
6. WHEN the same `/forge recap --since <window>` is invoked twice with identical inputs (no new commits, no new sessions), THE Forge_Recap SKILL SHALL produce identical output (idempotence within a stable window).
7. WHEN a Preference_Atom is extracted from two independent chat sessions with identical `trigger` and `decision_rule` fields, THE Forge_Learn distillation SHALL merge them into a single candidate rule rather than producing two duplicate candidates (deduplication invariant).
8. THE Canvas HTML rendering SHALL be injection-safe: for any review finding text T containing `<script>`, the rendered HTML SHALL NOT contain an active `<script>` element whose body derives from T (verifiable by DOMParser assertion in a property test).

### Requirement 14: 边界条件与失败模式

**User Story:** As a Forge user, I want explicit behavior defined for edge cases such as missing network, missing optional MCP, missing cmux, non-macOS, empty review files, and locked-spec conflicts, so that the feature degrades predictably.

#### Acceptance Criteria

1. WHEN Canvas generation cannot establish a connection to Bitbucket_MCP within a 10-second timeout due to absent network connectivity, THE Canvas generation (Requirement 4) SHALL produce the HTML artifact from local git history and `.tinkerman/reviews/<topic>.md` contents, with a visible footer notice in the generated HTML stating that remote Bitbucket_MCP enrichment was skipped.
2. IF Bitbucket_MCP is installed and returns an error response (including authentication failures such as 401, server errors such as 500, or no response within 15 seconds), THEN THE Canvas generation SHALL append a timestamped error entry to `.tinkerman/findings/<topic>/canvas-errors.log` and continue producing the HTML artifact using local data only.
3. WHEN the `$CMUX_WORKSPACE_ID` environment variable is unset and `/tmp/cmux.sock` does not exist at skill invocation, THE CLI_Harness SHALL classify cmux as unavailable within 1 second without initiating any connection attempt and proceed to the next controller tier in the harness fallback chain.
4. WHEN the `$CMUX_WORKSPACE_ID` environment variable is unset and `/tmp/cmux.sock` does not exist at skill invocation, THE UI_Harness SHALL classify cmux as unavailable within 1 second without initiating any connection attempt and proceed to the next controller tier in the harness fallback chain.
5. WHILE the host operating system is not macOS (e.g., Linux, Windows), THE CLI_Harness SHALL use tmux when installed or Node PTY otherwise as the controller backend.
6. WHILE the host operating system is not macOS (e.g., Linux, Windows), THE UI_Harness SHALL use the project's own harness when present, Playwright when already declared as a devDependency, or Chrome DevTools Protocol (CDP) as the controller backend, selected in that order of precedence.
7. WHEN `.tinkerman/reviews/<topic>.md` exists and contains zero parsed finding entries, THE Canvas generation SHALL produce an HTML page containing a "no findings" placeholder in the findings section and exit with a success status instead of raising an error.
8. WHEN a merge conflict occurs on a spec file whose status field equals `locked`, THE Fix_Conflicts SKILL SHALL classify the file as `frozen`, present the three options defined in Requirement 7.3 to the user, and SHALL NOT perform a three-way merge automatically.
9. WHEN `/forge verify` is executed on a target with no prior baseline record (first-run condition), THE Forge_Verify SKILL SHALL persist the current state as the baseline, set the verdict to `INCONCLUSIVE`, and attach a note indicating that a follow-up run is required to compare against a treatment state.
10. IF one or more `.claude/` transcript files cannot be read due to encryption or permission errors, THEN THE Forge_Learn `--from-chats` mode SHALL skip the unreadable files, append their paths and error category to `.tinkerman/knowledge/sessions/from-chats-errors.log`, and continue processing the readable transcripts without terminating the run.
11. WHEN the user's `package.json` has no `scripts.check` entry, THE Forge_Ship SKILL and Fix_Conflicts SKILL SHALL use the command defined in the `.tinkerman/config.md` `ci_check_command` field as the validation gate.
12. IF both the `package.json` `scripts.check` entry and the `.tinkerman/config.md` `ci_check_command` field are absent, THEN THE Forge_Ship SKILL and Fix_Conflicts SKILL SHALL mark the validation gate step as `skipped` and display a warning in the skill's console output indicating that no check command is configured.

## Out of Scope

Explicitly out of scope for this feature:

1. **Full CI loop integration** (Cursor's `loop-on-ci`, `fix-ci`, `ci-watcher` agent) — the team does not use CI and relies on local verification plus Post_Push_Verify (Requirement 8) as the safety net.
2. **GitHub-specific `gh` CLI dependency** — the team uses Bitbucket Server; the Canvas feature (Requirement 4) MUST work with git + local Forge data only, treating Bitbucket_MCP as optional enrichment.
3. **A generic merge-conflict SKILL** — Fix_Conflicts (Requirement 7) is narrowly scoped to Forge's Three_Zone_Model and intentionally does not provide broader merge-conflict UX.
4. **Agent Teams migration** — tracked separately in ROADMAP v3.0; no work in this feature touches Agent Team architecture.
5. **Adding Playwright as a Forge dependency** — UI_Harness (Requirement 6) consumes only the user project's existing devDependencies; Forge itself does not pull in Playwright, Cypress, or Puppeteer.
6. **Breaking changes to existing 13 SKILLs** — this feature adds new SKILLs and extends Quality_Check_Subagent by one dimension only; no SKILL's existing external contract (Markdown output schema, gate behavior) is modified.
