---
status: completed
feature: pms-pack-v1
layout: requirements
created: 2026-05-09
tier: standard
---
# Requirements Document

## Introduction

本特性在 Sprint 1 建成的 Pack 基础设施之上，交付 **PMS Domain Pack v1.0** — Forge 的第一个领域包，为酒店前台管理系统（Property Management System）开发提供开箱即用的限界上下文、统一语言、禁用词清单、状态机、场景模板；同时在 Forge Core 层补齐三项关键方法论能力：**Forced Acceptance（验收测试强制门禁）**、**Mutation Testing（变异测试引擎）**、**单任务 Spec Micro-Review（任务级验收）**，以及 **TDD 狠度强化**（XML 铁律标签 + Rationalization 扩展）。

问题陈述：Sprint 1 完成后，Forge 具备了 Pack 机制骨架，但未启用时与当前完全等价；PMS 项目无法从中受益，除非存在一个可用的 PMS Pack。与此同时，几条 TDD/ATDD 关键"狠度"仍缺失：验收测试是可选门（`acceptance_blocks_ship` 默认 false），变异测试完全没有集成，Build 阶段的每个子任务完成时只靠 TDD 自校，缺少与 Plan 的对齐验证。PMS 的业务场景（金额、状态机、日期、并发）对这些能力有强刚需 — 一个 `>=` 改成 `>` 或一次遗漏的状态迁移都可能产生资损。

价值来源：

1. **PMS 项目开箱即用**：`/forge init --pack=pms` 生成 8 个标准 Bounded Context 骨架 + 预置术语表 + 20 个核心场景 + 4 个状态机 + PMS 禁用词清单，大幅降低新项目搭建成本。
2. **验收测试升级为门禁**：从"可选工具"升级为"按 Context 配置的强制门禁"，PMS 核心子域（Reservations / Folio / Night Audit）的 scenarios 必须 PASS 才能 ship。
3. **变异测试兜底关键模块**：Stryker.js 集成 + PMS Pack 声明关键模块清单，Folio / Night Audit / Pricing / Reservation 状态机的 mutation score 未达标阻断 ship。
4. **Build 阶段的单任务对齐**：每个 atomic task 完成时立即由轻量 spec-reviewer 对照 Plan 验收标准检查"是否已满足 + 超出了哪些 + 缺失了哪些"，早发现偏离。
5. **铁律可解析化**：CLAUDE.md 和各 skill 的"铁律"从散文式加粗升级为 XML 标签（`<IRON-LAW>`、`<HARD-GATE>`），AI 对标签的敏感度显著高于 markdown 强调。
6. **BusinessDayClock 工具**：PMS 特有的"营业日时钟"（非系统时间），是夜审、跨日入住、跨月账单等场景的基础依赖。
7. **状态机引擎**：Core 层提供状态机定义加载 + property test 自动派生能力，Pack 提供 PMS 4 个核心状态机定义。

架构选择：

- **Core/Pack 职责界线严格**：状态机**引擎**（解析、校验、测试派生）在 Core，状态机**定义**（Reservation / Folio / RoomStatus / HousekeepingTask 的具体 states + transitions）在 PMS Pack。mutation testing 引擎（Stryker 集成、关键模块门禁）在 Core，关键模块**清单**（`src/domain/folio/**` 等）在 PMS Pack 的 `feature_flags` 中。BusinessDayClock 属于酒店行业特有概念，放 PMS Pack。
- **Forced Acceptance 由 Pack 配置驱动**：`packs/pms/pack.yaml` 的 `feature_flags.forced_acceptance_contexts` 字段声明强制验收的 Context 列表；Core 的 `forge-accept` / `forge-ship` 读取该字段执行门禁。
- **单任务 Spec Micro-Review 是 Core 能力**：通用于所有项目，不特定于 PMS；但 PMS 场景是主要受益者。

关键约束：

- **Zero-Pack-Zero-Impact 继续保持**：PMS Pack 不启用时，Forge 行为与 Sprint 1 完成后完全一致；所有 Core 层新增能力（Forced Acceptance 引擎、Mutation Testing 引擎、Micro-Review、XML 标签解析）在 `Enabled_Packs` 为空时行为等同于 Sprint 1 完成状态。
- **既有 spec/plan 向后兼容**：已 locked 的 spec 不会因 PMS Pack 启用而失效；已 approved 的 plan 在 Build 时，若没有 Expected Output 字段（Sprint 1 定义），Micro-Review 退化为宽松模式。
- **Mutation Testing 不作为 Sprint 2 强制门禁**：PMS Pack v1 引入 Stryker.js 集成和关键模块声明，但阈值从 `warning` 开始（sprint 2 默认不阻断 ship），待项目积累 mutation score 基线后再在后续 Sprint 升级为 `error`。
- **BusinessDayClock 不是替代 `Date`**：只在明确的 PMS 业务逻辑（房费计算、夜审滚日、账单日期）中使用，不强制替换所有 `new Date()` 调用。

## Glossary

- **PMS_Pack**：本特性交付的领域包 `packs/pms/`，v1.0 版本。
- **Bounded_Context_Suite**：PMS Pack v1 预置的 8 个 Bounded Context：`reservations`、`front-desk`、`housekeeping`、`folio-billing`、`night-audit`、`rate-inventory`、`channel-integration`、`reporting`。
- **Core_Subdomain**：PMS 的 Core 子域（业务差异化竞争力所在），具体指 `reservations`、`folio-billing`、`night-audit`；`forced_acceptance_contexts` 和 `mutation_critical_modules` 默认覆盖这三个。
- **Supporting_Subdomain**：PMS 的 Supporting 子域：`front-desk`、`housekeeping`、`rate-inventory`、`channel-integration`。
- **Generic_Subdomain**：PMS 的 Generic 子域：`reporting`。
- **Business_Day**：酒店营业日，通常与自然日不同步。酒店 A 可能 4:00 AM 切日，酒店 B 可能 6:00 AM 切日。一张 5/9 的预订在 5/10 凌晨 2 点到店可能仍算 5/9 入住，取决于切日时间。
- **Business_Day_Clock**：`packs/pms/utils/business-day-clock.ts` 提供的虚拟时钟，封装营业日切换逻辑。构造函数接受 `{ cutoffHour: number, timezone: string }`。
- **State_Machine_Definition**：YAML 格式的状态机定义，存放于 `packs/pms/state-machines/<name>.yaml`。包含 `states` 列表（含终态标记）、`transitions` 列表（`from`、`to`、`event`、`guards`、`side_effects`）、`invariants` 列表。
- **State_Machine_Engine**：Core 层 `src/state-machine/` 模块，提供状态机定义加载、校验、property test 派生能力。
- **Reservation_SM**：Reservation 聚合的状态机，核心状态：`Booked` / `Confirmed` / `CheckedIn` / `CheckedOut` / `NoShow` / `Cancelled`。
- **Folio_SM**：Folio（账单）状态机：`Open` / `Posted` / `Closed` / `Voided`。
- **RoomStatus_SM**：房间状态机：`Available` / `Occupied` / `Dirty` / `Clean` / `Inspected` / `OutOfService` / `OutOfOrder`。
- **HousekeepingTask_SM**：客房任务状态机：`Pending` / `InProgress` / `Completed` / `Skipped`。
- **Forced_Acceptance**：按 Context 配置强制执行 scenarios 的门禁机制。当 spec 的 `## Scenarios` 段非空且该 spec 所属 Context 在 `forced_acceptance_contexts` 列表中时，`/forge ship` 必须先通过 `/forge accept` 才能放行。
- **Mutation_Testing**：通过对源代码故意引入语法变异（如 `>=` → `>`、`true` → `false`），观察测试套件能否捕获这些 bug，从而评估测试套件的"有效性"而非"覆盖率"。
- **Mutation_Critical_Modules**：PMS Pack 声明的需要执行 mutation testing 的模块 glob 列表，在 `packs/pms/pack.yaml` 的 `feature_flags.mutation_critical_modules`。
- **Mutation_Score**：killed / (killed + survived) × 100，排除 equivalent mutants。高于阈值表示测试套件能有效捕获 bug 变异。
- **Micro_Review**：Build 阶段每个 atomic task 完成后立即执行的轻量 spec 对齐检查。对照当前 task 在 Plan 中的验收标准，回答三问题：是否满足（covered）？超出范围（over-built）？缺失（missing）？
- **Iron_Law_Tag**：`<IRON-LAW name="<n>">...</IRON-LAW>` 结构化标签，替代 markdown 散文式铁律声明。
- **Hard_Gate_Tag**：`<HARD-GATE name="<n>">...</HARD-GATE>` 结构化标签，替代 markdown 散文式硬门禁声明。
- **Rationalization_Catalog**：`skills/forge-build/references/tdd-rules.md` 中的"借口 → 反驳"表，Sprint 2 扩展至 15+ 条。
- **PMS_Init_Template**：`templates/pms-init/` 下的初始化脚本与模板集合，支持 `/forge init --pack=pms` 自动铺设 PMS 项目骨架。

## Requirements

### Requirement 1: PMS Pack 基础骨架

**User Story:** As a PMS developer, I want `/forge pack enable pms` to equip my project with hotel domain knowledge, so that specs and plans use correct Bounded Contexts and ubiquitous language from day one.

#### Acceptance Criteria

1. THE `packs/pms/pack.yaml` SHALL declare: `name: pms`, `display_name: "Hotel PMS Domain Pack"`, `forge_min_version` (aligned with current Forge version), `extends` covering all 8 standard categories.
2. THE `packs/pms/contexts/` directory SHALL contain exactly 8 markdown files corresponding to the Bounded_Context_Suite, each with complete frontmatter (name / responsibility / aggregates / inbound_events / outbound_events / upstream / downstream) and a body of 150-300 words describing the context's scope and boundaries.
3. THE `packs/pms/contexts/_map.yaml` SHALL declare realistic relationships between the 8 contexts (minimum 6 edges covering partnership / customer-supplier / acl / open-host patterns).
4. THE `packs/pms/pack.yaml` feature_flags SHALL include: `forced_acceptance_contexts: [reservations, folio-billing, night-audit]` and `mutation_critical_modules` covering glob patterns for the 3 core subdomains.
5. THE `packs/pms/README.md` SHALL document: the 8 contexts' purpose, the 4 state machines, the 20 scenarios inventory, setup instructions, customization via `.tinkerman/custom/`.
6. WHEN `pack validate pms` is invoked (Sprint 1 Requirement 4.7), it SHALL pass all 4 checks (manifest / directories / map references / glossary frontmatter).

### Requirement 2: PMS 分 Context 统一语言

**User Story:** As a PMS developer, I want "Room" in Reservations context to mean "room type" and "Room" in Front Desk context to mean "physical room unit", so that my specs cannot accidentally conflate the two.

#### Acceptance Criteria

1. THE `packs/pms/glossary/` SHALL contain files: `_shared.md`, `reservations.md`, `front-desk.md`, `housekeeping.md`, `folio-billing.md`, `night-audit.md`, `rate-inventory.md`, `channel-integration.md`, `reporting.md`.
2. EACH glossary file SHALL contain minimum 10 terms covering common PMS vocabulary (e.g., `Reservation`, `Stay`, `Guest Profile`, `Folio`, `Room Type`, `Room Unit`, `Night Audit`, `ADR`, `RevPAR`, `MLOS`, `Overbooking`, `Walk-in`, `No-show`, `Rate Plan`, `Inventory`, `Allocation`).
3. THE "Room" term SHALL be defined in at least three contexts with distinct meanings: `reservations/room.md` as room type, `front-desk/room.md` as physical unit, `housekeeping/room.md` as cleaning target with status.
4. THE "Guest" term SHALL similarly have context-specific definitions in `reservations` (Guest Profile), `front-desk` (Occupant), `folio-billing` (Payer / Folio Owner).
5. WHEN `detectContextTermMismatch` is invoked on a spec using "Room" in Reservations context to mean "room unit 801", it SHALL flag the mismatch with suggested alternatives.
6. EACH glossary entry SHALL have `aliases` listing Chinese synonyms (e.g., `Reservation` aliases `预订`、`订房`、`订单`).

### Requirement 3: PMS 禁用词清单

**User Story:** As a PMS spec reviewer, I want Forge to catch implementation leakage specific to hotel systems, so that specs stay in pure domain language.

#### Acceptance Criteria

1. THE `packs/pms/banned-patterns.yaml` SHALL declare banned patterns across 4 categories (code / infrastructure / framework / technical).
2. THE `code` category SHALL ban PMS-specific implementation naming: `ReservationService`, `FolioRepository`, `RoomAllocator`, `NightAuditEngine`, regex `\b\w+(Service|Repository|Manager|Engine|Handler)\b`.
3. THE `infrastructure` category SHALL ban database and queue references typical in PMS: `reservations_table`, `folio_line_items`, regex for HTTP API calls, queue names like `reservation-events`, `night-audit-queue`.
4. THE `framework` category SHALL ban common framework terms: `Controller`, `Middleware`, `NestJS`, `TypeORM`, `Prisma`, `Redux`.
5. THE `technical` category SHALL ban infrastructure tech: `Redis`, `Kafka`, `PostgreSQL`, `MongoDB`, `WebSocket`, `GraphQL`.
6. THE banned patterns SHALL NOT trigger on words that are also defined in the pack's glossary for a relevant context (e.g., "Folio" as a domain term is safe; "FolioService" as a banned class name is flagged). This relies on Sprint 1 Requirement 7.5.
7. WHEN a real PMS spec is written and lock attempted, the leak detector SHALL correctly catch leakage in at least one real-world example per category.

### Requirement 4: 状态机引擎（Core）

**User Story:** As a Forge user, I want a state machine engine that loads YAML definitions, validates invariants, and auto-derives property tests, so that complex state-driven domains (PMS, fintech, games) can be specified declaratively.

#### Acceptance Criteria

1. THE `src/state-machine/` module SHALL expose pure functions: `loadStateMachineDefinition(yamlContent)`, `validateDefinition(def)`, `deriveStatePropertyTests(def)`.
2. THE `State_Machine_Definition` YAML schema SHALL support: `states` (list with optional `terminal: true` flag), `initial` (state name), `transitions` (list of `{ from, to, event, guards?, side_effects? }`), `invariants` (list of `{ expression, description }` where expression uses a minimal DSL).
3. THE `validateDefinition` SHALL check: (a) `initial` is in `states`; (b) all `transitions.from` and `to` reference declared states; (c) terminal states have no outgoing transitions; (d) no unreachable states from `initial`; (e) no duplicate `{from, event}` pairs.
4. THE `deriveStatePropertyTests` SHALL emit fast-check property test **code fragments** (as TypeScript strings) that verify, for any sequence of valid transitions: invariants hold, terminal states are sinks, undefined transitions throw. The emitted code is pasted into project test files by developers, not auto-executed.
5. THE engine SHALL be invoked by `/forge plan` when a new task involves a module matching a state machine definition: the plan's atomic tasks SHALL reference relevant state transitions.
6. WHEN `Enabled_Packs` does not provide any state machine, the engine SHALL still be importable and usable (not PMS-specific); Zero-Pack-Zero-Impact holds.

### Requirement 5: PMS 4 核心状态机

**User Story:** As a PMS developer, I want the four core state machines (Reservation / Folio / RoomStatus / HousekeepingTask) pre-defined, so that I can enforce business invariants without redesigning them from scratch.

#### Acceptance Criteria

1. THE `packs/pms/state-machines/reservation.yaml` SHALL define: states (`Booked`, `Confirmed`, `CheckedIn`, `CheckedOut`, `NoShow`, `Cancelled`), initial = `Booked`, terminal = `CheckedOut` and `NoShow` and `Cancelled`.
2. THE `packs/pms/state-machines/reservation.yaml` SHALL declare at minimum 10 transitions covering: confirmation, check-in happy path, no-show at cutoff, cancellation from multiple states, early check-in, late check-in.
3. THE `packs/pms/state-machines/folio.yaml` SHALL define: states (`Open`, `Posted`, `Closed`, `Voided`), terminal = `Closed` and `Voided`, with the critical invariant "Closed folio cannot be reopened except via explicit Void → Open path".
4. THE `packs/pms/state-machines/room-status.yaml` SHALL define the 7 states (`Available`, `Occupied`, `Dirty`, `Clean`, `Inspected`, `OutOfService`, `OutOfOrder`) with transitions covering check-in/out, housekeeping, inspection, maintenance.
5. THE `packs/pms/state-machines/housekeeping-task.yaml` SHALL define 4 states with linear progression plus `Skipped` from any non-terminal state.
6. EACH state machine SHALL declare at least 3 `invariants` using the DSL (e.g., `"terminal_state_has_no_outgoing_transitions"`, `"folio_closed_requires_balanced_debits_and_credits"`).
7. WHEN `deriveStatePropertyTests` runs on each of the 4 state machines, the emitted TypeScript fragment SHALL compile without errors and, when integrated into a test file, SHALL correctly verify the invariants.

### Requirement 6: Forced Acceptance 门禁

**User Story:** As a PMS ship reviewer, I want core subdomains (Reservations, Folio, Night Audit) to require green acceptance tests before ship, so that critical business behavior is never shipped without scenario-level verification.

#### Acceptance Criteria

1. THE `src/accept-gate.ts` SHALL expose `shouldBlockShip(spec, enabledPacks)` returning `{ block: boolean, reason?: string }`.
2. WHEN the spec's declared context (from spec frontmatter `context:` field) is in any enabled pack's `feature_flags.forced_acceptance_contexts`, AND the spec contains a non-empty `## Scenarios` section, AND the latest acceptance run artifact shows any FAIL verdict (or absence of artifact), THEN `shouldBlockShip` SHALL return `block: true` with a descriptive reason.
3. THE `/forge ship` SHALL call `shouldBlockShip` as part of its gate sequence; block condition halts ship with a structured rejection message identical in format to existing ship gates (`🚫 Ship 阻断 — <reason> 建议：<route>`).
4. WHEN `Enabled_Packs` is empty OR no pack declares `forced_acceptance_contexts`, `shouldBlockShip` SHALL return `block: false` (Zero-Pack-Zero-Impact).
5. THE acceptance artifact location SHALL be `.tinkerman/acceptance/<topic>/report.md`; its frontmatter SHALL include `verdicts_summary: { pass: N, fail: M, skip: K }` and the gate SHALL read `fail > 0` as block condition.
6. THE `/forge accept` SHALL update the artifact atomically (write-and-rename); partial writes SHALL NOT be visible to the gate.
7. WHEN the spec has no `## Scenarios` section even though its context is in `forced_acceptance_contexts`, the gate SHALL emit a P1 warning (not block) suggesting scenarios be added.

### Requirement 7: Mutation Testing 引擎（Core）

**User Story:** As a quality-conscious developer, I want mutation testing integrated into Forge so that I can verify my tests actually catch bugs, not just execute code.

#### Acceptance Criteria

1. THE `skills/forge-mutate/SKILL.md` SHALL be a new skill, main body ≤150 lines, defining subcommands: `run [<target-glob>]`, `kill-survivors`, `report`.
2. THE Stryker.js integration SHALL be invoked via `npx stryker run` with a Forge-generated `stryker.conf.json` targeting only the `Mutation_Critical_Modules` declared in `Enabled_Packs` (union across packs).
3. WHEN `Enabled_Packs` is empty OR no pack declares `mutation_critical_modules`, `/forge mutate` SHALL emit a warning and exit 0 (no-op, Zero-Pack-Zero-Impact).
4. THE mutation result SHALL be written to `.tinkerman/mutation/<timestamp>.md` with frontmatter containing: `pack_source`, `targeted_globs`, `total`, `killed`, `survived`, `no_coverage`, `runtime_errors`, `mutation_score` (percentage excluding equivalent mutants), `threshold`, `verdict` (`pass` | `warn` | `fail`).
5. THE threshold SHALL be read from pack `feature_flags.mutation_score_threshold`, default 85 if absent; per-run override via `--threshold` flag.
6. WHEN `mutation_score < threshold`, the verdict SHALL be `warn` in Sprint 2 (not blocking ship); future Sprint may upgrade to `fail` (blocking).
7. THE `/forge ship` SHALL read the latest mutation artifact (if exists); `verdict: fail` blocks ship; `verdict: warn` emits notice but does not block; absence of artifact does not block (mutation testing is opt-in).
8. THE skill SHALL document the 8 core mutation categories (arithmetic / comparison / equality / boolean / conditional / constant / return value / void method) with examples, borrowing from swingerman/atdd.

### Requirement 8: PMS 关键模块 Mutation 集成

**User Story:** As a PMS developer, I want Stryker configured out-of-the-box for Folio, Night Audit, Pricing, and Reservation state machine modules, so that these high-stakes modules get mutation testing with minimal setup.

#### Acceptance Criteria

1. THE `packs/pms/pack.yaml` feature_flags SHALL declare `mutation_critical_modules` with glob patterns: `src/domain/folio/**/*.ts`, `src/domain/night-audit/**/*.ts`, `src/domain/pricing/**/*.ts`, `src/domain/reservation/state/**/*.ts`.
2. THE `packs/pms/pack.yaml` feature_flags SHALL declare `mutation_score_threshold: 85`.
3. THE PMS Pack SHALL document in README that projects can override these globs via `.tinkerman/custom/mutation-config.yaml` using the same schema.
4. WHEN a PMS project runs `/forge mutate`, it SHALL target only the files matching the declared globs (relative to project root, not pack root).

### Requirement 9: 单任务 Spec Micro-Review

**User Story:** As a Build subagent, I want to verify immediately after completing each atomic task that my output aligns with the Plan's acceptance criteria for that task, so that drift is caught within minutes rather than at the final review.

#### Acceptance Criteria

1. THE `src/build.ts` SHALL invoke a Micro_Review step immediately after each atomic task's Verify GREEN step, before moving to the next task.
2. THE Micro_Review SHALL read: (a) the current task's Plan entry (including Expected Output fields per Sprint 1 Requirement 10); (b) the git diff of the just-committed changes; (c) the task's Verify GREEN output.
3. THE Micro_Review SHALL answer three questions and output a structured block:
   - `covered`: list of acceptance criteria the task satisfies (file:line evidence)
   - `over_built`: list of changes that exceed the task's declared scope
   - `missing`: list of declared criteria not yet satisfied by the current task's output
4. WHEN `missing` is non-empty OR `over_built` is non-empty, the subagent SHALL loop back to address the delta before marking the task complete.
5. THE Micro_Review SHALL be lightweight: single-pass scan, no additional subagent dispatch, ≤300 tokens of output per task.
6. THE Micro_Review SHALL honor Sprint 1 Requirement 10.6 backward compatibility: legacy plans without Expected Output fields get a "loose" Micro_Review (only checks that commits exist and tests pass), not a strict one.
7. THE Micro_Review outputs SHALL accumulate into `.tinkerman/progress/<topic>.md` as structured entries per task (aligned with existing progress schema).

### Requirement 10: XML 铁律标签

**User Story:** As an AI agent operating on Forge skills, I want iron laws and hard gates declared as structured XML tags rather than markdown prose, so that I am more likely to honor them consistently.

#### Acceptance Criteria

1. THE `CLAUDE.md` iron laws (§2.1 TDD, §2.3 Verification, §2.4 Three-Strike, §2.7 No Confirmation Between Steps) SHALL be wrapped in `<IRON-LAW name="<kebab-case-id>">...</IRON-LAW>` tags; the semantic content SHALL remain unchanged.
2. THE `.tinkerman/config.md` hard gates (frozen zone, status transitions) and key skill files' gates (spec-lock, plan-approve, p0-p1-block) SHALL be wrapped in `<HARD-GATE name="<id>">...</HARD-GATE>` tags.
3. EACH tag SHALL have a unique `name` attribute across the entire repository; a validation script `scripts/check-iron-laws.sh` SHALL enforce uniqueness.
4. THE tags SHALL be semantic markers only; no tool/engine is required to parse them. Their value is in making the boundaries explicit to the AI agent reading the file.
5. THE migration SHALL NOT change any iron law's wording; only wrap existing prose in tags.
6. WHEN an AI agent reads the tagged content, the tag name SHALL appear in any summary or reference to the law (e.g., "IRON-LAW tdd-delete-and-restart applies here").

### Requirement 11: Rationalization Catalog 扩展

**User Story:** As a TDD enforcer, I want the rationalization catalog in tdd-rules.md to cover all the common AI self-persuasion patterns observed in Superpowers, so that the agent's excuse-generating paths are closed off.

#### Acceptance Criteria

1. THE `skills/forge-build/references/tdd-rules.md` Rationalization table SHALL be expanded to minimum 15 entries.
2. THE new entries SHALL include translations of Superpowers' 12 Common Rationalizations (`"Tests after achieve same goals"`, `"Keep as reference, write tests first"`, `"Already spent X hours, deleting is wasteful"`, etc.), adapted to Chinese wording matching Forge's existing style.
3. THE rationalizations SHALL be grouped into sub-categories: (a) Test-after excuses; (b) Reference-keeping excuses; (c) Sunk-cost excuses; (d) Pragmatism excuses; (e) Scope excuses.
4. EACH rationalization SHALL have a one-sentence reality-check rebuttal in Chinese.
5. THE extension SHALL NOT contradict any existing entry; merges SHALL reconcile overlapping wording.

### Requirement 12: BusinessDayClock 工具

**User Story:** As a PMS developer writing night audit logic, I want a virtual BusinessDayClock that encapsulates hotel-specific "business day" semantics (configurable cutoff hour, timezone-aware), so that I don't accidentally use wall-clock time for business-day decisions.

#### Acceptance Criteria

1. THE `packs/pms/utils/business-day-clock.ts` SHALL export a `BusinessDayClock` class with constructor `new BusinessDayClock({ cutoffHour: number, timezone: string })`.
2. THE class SHALL expose methods: `getBusinessDay(instant: Date): string` returning ISO date (YYYY-MM-DD) representing the business day containing the instant; `nextCutoff(from: Date): Date`; `isSameBusinessDay(a: Date, b: Date): boolean`; `addBusinessDays(from: Date, delta: number): Date`.
3. THE algorithm SHALL correctly handle DST transitions in the timezone (tested with `America/New_York`, `Asia/Shanghai`, `Europe/London`).
4. THE class SHALL be accompanied by vitest fixture helper `withBusinessDay(day: string, fn: async () => void)` for scenario testing.
5. THE `packs/pms/utils/business-day-clock.test.ts` SHALL include property tests (fast-check) for: same-day detection, cutoff crossing, DST idempotence, addBusinessDays roundtrip.
6. THE class SHALL NOT use `new Date()` internally except where explicitly provided as input; all time-based computations SHALL be pure functions of the input instant.

### Requirement 13: PMS Init Template

**User Story:** As a new PMS project owner, I want `/forge init --pack=pms` to set up my project with all the PMS Pack's defaults pre-configured, so that I can start writing specs within minutes.

#### Acceptance Criteria

1. THE `scripts/init.sh` SHALL accept a `--pack <name>` flag (multi-valued allowed) that adds pack names to `.tinkerman/config.md` frontmatter `packs:` after standard init.
2. WHEN `--pack pms` is specified, the init script SHALL: (a) enable the pms pack; (b) offer to scaffold `.tinkerman/contexts/` linked to pms pack contexts for project-specific extensions (opt-in prompt); (c) create `.tinkerman/custom/` empty directory; (d) print a welcome message referencing PMS Pack README and 20 pre-built scenarios.
3. THE init script's PMS flow SHALL offer interactive prompts for: (a) `business_day_cutoff_hour` (default 4); (b) `business_day_timezone` (default `Asia/Shanghai`), writing both to `.tinkerman/config.md` frontmatter.
4. THE init script SHALL be idempotent when re-run with `--pack pms` on an already-initialized project (no-op, friendly message).
5. THE init script SHALL NOT fail if the pack is not yet present in `packs/`; it SHALL emit a warning and continue.

### Requirement 14: PMS 预置场景

**User Story:** As a PMS spec author, I want 20 pre-written Gherkin scenarios covering common hotel workflows, so that I have a starting point rather than blank pages.

#### Acceptance Criteria

1. THE `packs/pms/scenarios/` SHALL contain minimum 20 Gherkin scenario files organized in subdirectories: `check-in/` (5), `check-out/` (3), `night-audit/` (4), `reservation/` (4), `folio/` (4).
2. EACH scenario SHALL pass Sprint 1's Scenario Linter (period-terminated, externally observable, complete Given/When/Then structure).
3. EACH scenario SHALL be free of implementation leakage (Sprint 1 Spec Leak Detector against PMS banned-patterns returns empty).
4. THE scenarios SHALL cover at minimum: walk-in check-in, early-arrival check-in, late-arrival check-in, group check-in, check-in with payment failure; express check-out, late check-out with fee, dispute; normal night audit, night audit with no-show processing, night audit with room-move reconciliation, night audit interrupted and resumed; individual reservation, group reservation, modified reservation, cancellation within policy; charge posting, split folio, tax adjustment, deposit refund.
5. EACH scenario file SHALL have a comment block describing the business context and any assumptions (e.g., "Assumes ticketing-independent room allocation").
6. THE scenarios SHALL be copyable into a user's spec's `## Scenarios` section with minimal edits.

### Requirement 15: 非功能需求

**User Story:** As a Forge maintainer, I want the PMS Pack and Core Sprint 2 additions to meet Forge's engineering standards for performance, correctness, and non-disruption.

#### Acceptance Criteria

1. PERFORMANCE: `BusinessDayClock` methods SHALL execute in ≤1ms each on MacBook Pro M-series.
2. PERFORMANCE: Mutation testing wrapper SHALL start within 2s (not counting Stryker itself).
3. CORRECTNESS: `State_Machine_Engine`, `accept-gate`, `BusinessDayClock` SHALL each have fast-check property tests (minimum 3 properties each).
4. ZERO-PACK-INVARIANT: The existing `test/pack/zero-pack-invariant.test.ts` (Sprint 1) SHALL be extended to also verify: Forced Acceptance gate returns no-block, Mutation engine emits warn-and-exit, Micro_Review degrades to loose mode for legacy plans.
5. DOCS: Each new public function in `src/state-machine/`, `src/accept-gate.ts`, `src/build.ts` Micro_Review block SHALL have TSDoc with `@example`.
6. I18N: All user-facing strings in the PMS Pack SHALL be in Simplified Chinese (consistent with Forge existing conventions); English is acceptable for technical terms that are universally used in the hotel industry (ADR, RevPAR, MLOS).
