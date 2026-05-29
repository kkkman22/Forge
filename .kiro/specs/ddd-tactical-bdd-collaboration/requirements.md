---
name: ddd-tactical-bdd-collaboration
status: completed
created: "2026-01-01"
updated: "2026-01-01"
---
# Requirements Document

## Introduction

本特性在 Sprint 1（Pack 基础设施 + 方法论引擎）和 Sprint 2（PMS Pack v1 + 核心门禁）之上，补齐 **DDD 战术层 + BDD 协作层 + PMS 场景与定制能力的 endgame**，使 Forge 成为完整的"SDD + ATDD + TDD + DDD + BDD"工程化工作流。

问题陈述：Sprint 2 完成后，Forge 已具备 DDD 战略层（Bounded Context、Ubiquitous Language）和方法论骨架，但**战术模式（Aggregate / Value Object / Domain Event / Repository / Saga）的代码模板尚未交付**，导致开发者知道"该分层"但不知道"怎么写第一个聚合根"。Event Storming 作为 DDD 最有效的前期建模活动也未被 Forge 结构化支持。BDD 方面，虽然 Scenario Linter 已落地，但缺少**三方协作视角（Three Amigos）**和**活文档生成**两个协作层能力。同时架构边界护栏（跨 Context 依赖 hook）尚未工程化，PMS 场景库也只完成了 20 个（目标 50+）。

价值来源：

1. **DDD 战术模板降低初始写码门槛**：开发者按模板填空即可得到符合 DDD 规范的聚合根 / 值对象 / 领域事件 / Repository 骨架，避免从零设计。
2. **forge-storm 事件风暴引导具象化建模**：通过 Socratic 问答收集领域事件 / 命令 / 聚合 / 策略，输出 `.forge/contexts/<name>/event-storm.md`，作为 `/forge spec` 的输入，减少"spec 凭推测写"。
3. **架构边界 hook 自动阻断违规**：一次跨 Context 非法依赖的 import 语句，在 PreToolUse 时就被阻断，避免 PR 阶段才发现。
4. **business-analyst agent 实现三方协作**：Core 子域 spec 生成时，product + business-analyst + architect 三个 subagent 平行产出，避免"开发一人定义业务"的偏倚。
5. **活文档让业务方参与**：`/forge spec --living-doc` 从所有 scenarios 生成可浏览的 HTML 站点，酒店前台主管 / 产品经理可以直接审阅。
6. **Money Lint 杜绝浮点金额和裸 `new Date()`**：PMS 最高发的两类错误被工程化拦截。
7. **PMS 场景库补齐到 50+**：覆盖超售处理、协议客户、POS 集成、发票、会员积分等扩展场景。
8. **定制能力验证**：通过一个示例 `packs/pms-marriott-sample/` 演示三层覆盖，为未来多租户分发打样板。

架构选择：

- **战术模板走 Template + Pack Override**：Core 提供通用 TypeScript 战术模板（`templates/ddd/`），Pack 可覆盖特化版本（`packs/pms/templates/ddd/`），项目可进一步覆盖（`.forge/custom/templates/ddd/`），完全复用 Sprint 1 的 Override Resolver。
- **forge-storm 是 Core skill，产出进 `.forge/contexts/`**：Event Storming 引导属于通用方法论能力，但产出文件命名遵循 Sprint 1 的 Context 目录约定。
- **架构边界 hook 独立于 Forge 主流程**：通过 PreToolUse hook 集成，对 Write/Edit 工具在 `src/**/*.ts` 路径上扫描 import 语句，违规阻断。Hook 只依赖 Sprint 1 的 `Context_Map` 数据，Zero-Pack-Zero-Impact 保持。
- **business-analyst agent 仅在 Core 子域触发**：避免在轻量任务上过度动员。触发条件由 `/forge spec` skill 读 pack 声明的 `core_subdomains` 判定（PMS Pack 默认 reservations / folio-billing / night-audit）。
- **活文档生成是一次性命令**：非持续进程，用户显式运行 `/forge spec --living-doc`，输出到 `.forge/docs/living/index.html`。
- **Money Lint 是 Pack-provided ESLint 规则**：通过 Sprint 1 的 `extends.lint_rules` 机制加载；未启用 pack 时完全不生效。

关键约束：

- **Zero-Pack-Zero-Impact 继续保持**：未启用任何 Pack 时，DDD 战术模板不生成、forge-storm 可用但无 Pack 专属提示、架构边界 hook 无 Context_Map 可检查（no-op）、business-analyst agent 不触发、Money Lint 不加载、活文档无 scenarios 可汇总（生成空骨架页）。
- **既有 skill 契约不变**：本特性新增 `skills/forge-storm/`，其余通过扩展 references、agents、hooks 实现。
- **PMS 场景库补齐不破坏现有 20 个**：Sprint 2 产出的 20 个场景保持原位，Sprint 3 追加到 `packs/pms/scenarios/` 新子目录。
- **示例 Pack `pms-marriott-sample/` 不是生产级 Pack**：仅作为"三层覆盖如何工作"的样板，标注 `experimental: true`，不被任何默认 init 脚本启用。

## Glossary

- **Tactical_Template**：DDD 战术模式的 TypeScript 代码模板，存放于 `templates/ddd/`（Core 层）或 `packs/<name>/templates/ddd/`（Pack 层）或 `.forge/custom/templates/ddd/`（项目层）。每个模板文件以 `.template` 结尾，含占位符如 `{{AggregateName}}`、`{{InvariantList}}`。
- **Aggregate_Root_Template**：聚合根骨架，含私有构造 + 工厂方法 + 不变量守护 + 领域事件发布 + 状态迁移方法。
- **Value_Object_Template**：值对象骨架，含 immutable fields + `equals(other)` by value + `toString` + 工厂方法。
- **Domain_Event_Template**：领域事件骨架，含 `occurredAt` / `eventId` / `aggregateId` / payload。
- **Repository_Interface_Template**：Repository 接口骨架（不含实现），仅声明 `findById`、`save`、`delete` 等领域层需要的方法。
- **Domain_Service_Template**：领域服务骨架，处理跨聚合业务规则。
- **Saga_Template**：Process Manager 骨架，含 `handle(event)` + 内部状态 + 补偿动作。
- **Event_Storm**：事件风暴产出物，`.forge/contexts/<context>/event-storm.md`，含 YAML frontmatter + 四类实体（events / commands / aggregates / policies / read_models）。
- **Context_Boundary_Hook**：PreToolUse hook，扫描即将写入的源码文件的 `import` 语句，若引用了当前文件所属 Context 不允许直接依赖的其他 Context，则阻断写入。
- **Context_Dependency_Rules**：Context Map 中声明的允许的依赖类型；允许直接依赖的关系类型：`partnership`、`shared-kernel`、`open-host`（被依赖方）、`published-language`（被依赖方）；需要走 ACL 的：`customer-supplier`（上游方）、`conformist`；禁止的：未声明的任意跨 Context 依赖。
- **Business_Analyst_Agent**：`.claude/agents/business-analyst.md` 定义的 Subagent 角色，专注业务规则、边界、反例、合规性；在 Core 子域 spec 生成时并行触发。
- **Three_Amigos**：BDD 的三方协作模型，在 Forge 中由 `/forge spec` 对 Core 子域触发 product + business-analyst + architect 三 subagent 平行输出，汇合为 spec 草案。
- **Living_Doc**：活文档，从所有 spec 的 `## Scenarios` 段聚合生成的静态 HTML 站点，按 Bounded Context 分目录，每场景展示最新 acceptance 状态。
- **Living_Doc_Generator**：`/forge spec --living-doc` 的实现，扫描 `.forge/specs/*/spec.md` 和 `.forge/acceptance/*/report.md`，生成 `.forge/docs/living/index.html` 与子页面。
- **Money_Lint**：一组 ESLint / Biome 规则，存放于 `packs/pms/lint-rules/money/`。规则包括：禁止 `number` 类型声明金额变量、禁止金额字面量不走 `Money.of(...)` 工厂、跨币种运算必须显式 `exchange()`。
- **Time_Lint**：同类规则，禁止业务代码中出现裸 `new Date()`、`Date.now()`，强制通过注入的 Clock（BusinessDayClock 或等价）。存放于 `packs/pms/lint-rules/time/`。
- **Scenario_Library_Expansion**：PMS Pack scenarios 补齐到 50+ 个，新增子目录：`overbooking/`、`corporate/`、`pos-integration/`、`invoice-tax/`、`loyalty/`。
- **Customization_Sample_Pack**：`packs/pms-marriott-sample/` 示例 Pack，依赖 `pms` Pack（Sprint 1 `depends_on` 字段虽声明但不自动解析，此处手动确保 pms 先启用），演示如何新增 Context、覆盖 glossary、覆盖 scenarios。

## Requirements

### Requirement 1: DDD 战术模板（Core 层）

**User Story:** As a DDD practitioner, I want ready-to-fill tactical pattern templates for aggregates, value objects, domain events, repositories, domain services, and sagas, so that starting a new aggregate doesn't require designing the boilerplate from scratch.

#### Acceptance Criteria

1. THE `templates/ddd/` directory SHALL contain 6 template files: `aggregate-root.ts.template`, `value-object.ts.template`, `domain-event.ts.template`, `repository-interface.ts.template`, `domain-service.ts.template`, `saga.ts.template`.
2. EACH template SHALL use `{{<placeholder>}}` syntax for customization points (e.g., `{{AggregateName}}`, `{{Invariants}}`, `{{Events}}`).
3. THE `aggregate-root.ts.template` SHALL include: private constructor, static factory method, invariant guard methods, domain event publish hook, state transition methods with pre-conditions, serialization placeholder.
4. THE `value-object.ts.template` SHALL include: readonly fields, `equals(other)` by-value method, `toString`, static factory with validation.
5. THE `domain-event.ts.template` SHALL include: `readonly occurredAt: Date`, `readonly eventId: string`, `readonly aggregateId: string`, typed payload interface.
6. THE `repository-interface.ts.template` SHALL only declare `findById`, `save`, `delete`, and a stub `findBy<Criterion>` — no implementation.
7. THE `domain-service.ts.template` SHALL show pattern for cross-aggregate rules with no persistence concern.
8. THE `saga.ts.template` SHALL include: `handle(event)` dispatch, `CompensationSteps` field, final state enum.
9. EACH template SHALL compile as valid TypeScript after placeholder substitution with a sensible default value.
10. EACH template SHALL have a companion `<name>.md` documentation file in `templates/ddd/` explaining when to use, what to customize, and anti-patterns.

### Requirement 2: DDD 战术模板（PMS Pack 覆盖）

**User Story:** As a PMS developer, I want PMS-specific tactical templates that already incorporate hotel domain patterns (e.g., Reservation aggregate wired to state machine, Folio aggregate with balanced-entries invariant), so that the first draft is close to correct.

#### Acceptance Criteria

1. THE `packs/pms/templates/ddd/` SHALL contain at minimum 4 Pack-specific templates: `reservation-aggregate.ts.template`, `folio-aggregate.ts.template`, `room-value-object.ts.template`, `guest-profile-value-object.ts.template`.
2. THE `reservation-aggregate.ts.template` SHALL import and use the Sprint 2 reservation state machine definition; state transitions SHALL be method-level with pre-condition checks mapping to state machine guards.
3. THE `folio-aggregate.ts.template` SHALL include the "debits equal credits" invariant as a class-level guard, triggered on every mutation.
4. THE `room-value-object.ts.template` SHALL be parameterized by Bounded Context (Reservations as RoomType, Front-Desk as RoomUnit), showing how the same "Room" word maps to different value objects per context.
5. THE Sprint 1 `Override_Resolver` SHALL correctly resolve `packs/pms/templates/ddd/reservation-aggregate.ts.template` before the Core default when rendering.
6. `/forge pack inspect pms` (from Sprint 1) SHALL correctly report the number of templates provided.

### Requirement 3: forge-storm 事件风暴 skill

**User Story:** As a domain modeler, I want Forge to guide me through an event storming session when designing a new Bounded Context or core feature, so that events, commands, aggregates, and policies are enumerated before I start writing specs.

#### Acceptance Criteria

1. THE `skills/forge-storm/SKILL.md` SHALL be a new skill, main body ≤150 lines, triggered by `/forge storm <context>` or as a sub-step of `/forge decide` for new Bounded Contexts.
2. THE skill SHALL follow a 5-phase Socratic flow:
   - Phase 1: Collect Domain Events (orange stickies) — "什么事情在业务中发生后值得记录？"
   - Phase 2: Identify Commands (blue stickies) — "哪些命令会触发这些事件？"
   - Phase 3: Group into Aggregates (yellow stickies) — "哪些 Command + Event 应该由同一个一致性边界守护？"
   - Phase 4: Surface Policies (purple stickies) — "哪些 event 自动触发下一步 command？"
   - Phase 5: Map Read Models (green stickies) — "哪些视图/报表从 events 投影？"
3. THE skill SHALL ask one question per turn (Socratic style, no batch questioning).
4. THE skill SHALL output a structured file `.forge/contexts/<context>/event-storm.md` with YAML frontmatter and 5 sections (events / commands / aggregates / policies / read_models).
5. EACH collected item SHALL include a one-sentence description and optional "source" reference (e.g., interview notes, existing code).
6. THE skill SHALL be usable standalone (for exploratory sessions) or as upstream input to `/forge spec` (spec's Current State / Proposed Change can reference event-storm.md items).
7. THE skill SHALL honor Sprint 2 `<HARD-GATE name="no-mid-step-confirmation">` — do not ask for progression approval between phases; automatically advance upon sufficient input.
8. THE skill SHALL support resuming an interrupted session by reading existing event-storm.md and continuing from the last unfilled section.

### Requirement 4: Context Boundary Hook

**User Story:** As an architecture guardian, I want Forge to block any code change that introduces an illegal cross-context dependency, so that boundaries declared in `_map.yaml` are enforced at the tool level not just by convention.

#### Acceptance Criteria

1. THE `hooks/hooks.json` SHALL add a PreToolUse hook for `Write` and `Edit` tools targeting `src/**/*.ts` and `src/**/*.tsx` paths.
2. THE hook handler `scripts/check-context-boundary.sh` (or its TS equivalent compiled to JS) SHALL:
   (a) read the target file path from the tool arguments;
   (b) determine the target file's "current context" by matching against `packs/*/contexts/<name>/` path mappings OR explicit `@context` JSDoc tags in the file's first comment OR `.forge/context-ownership.yaml` project-level mapping;
   (c) parse `import` statements from the proposed new content;
   (d) for each import that crosses contexts, check `Context_Map` for the relationship type;
   (e) if the relationship type is `customer-supplier` (upstream), `conformist`, or not declared, emit a non-zero exit code with a structured message.
3. THE structured block message SHALL follow format:
   ```
   🚫 跨 Context 非法依赖
   源文件：<path> (context: <source>)
   导入：<imported module> (context: <target>)
   关系：<relationship or "undeclared">
   建议：通过 <source>的 ACL 层封装 <target> 的概念，或声明关系后重试
   ```
4. WHEN the target file is not associated with any context (outside `src/domain/**` mapped to contexts), the hook SHALL exit 0 (no-op).
5. WHEN no `_map.yaml` is loaded (Zero-Pack-Zero-Impact), the hook SHALL exit 0 and emit a single debug-level line to `.forge/debug/context-hook.log` noting "no context map loaded, skipping".
6. THE hook SHALL have a performance budget of ≤150ms per invocation to not degrade user experience.
7. THE hook SHALL support an escape hatch: a comment `// @forge:allow-cross-context <reason>` above the import line bypasses the check with the reason logged to `.forge/debug/context-hook.log` for later review.

### Requirement 5: business-analyst Agent

**User Story:** As a Core subdomain spec author, I want a business-analyst subagent to contribute business rules, edge cases, and compliance considerations in parallel with product and architect perspectives, so that my spec reflects a Three Amigos perspective not just a developer's view.

#### Acceptance Criteria

1. THE `.claude/agents/business-analyst.md` SHALL be a new agent definition with:
   - role: domain expert + business analyst
   - responsibilities: enumerate business rules, identify edge cases, flag compliance/regulatory considerations, propose happy path + unhappy path scenarios
   - output format: structured markdown with sections "Business Rules", "Edge Cases", "Unhappy Paths", "Compliance Considerations", "Scenarios Proposed"
2. THE `/forge spec` flow SHALL detect if the spec's target context matches any enabled pack's `feature_flags.core_subdomains` (new field; PMS pack SHALL declare `core_subdomains: [reservations, folio-billing, night-audit]`).
3. WHEN core subdomain is detected, `/forge spec` Propose phase SHALL launch 3 subagents in parallel (`Promise.allSettled`): `product`, `business-analyst`, `architect`. Results merge into the spec draft.
4. WHEN no pack declares `core_subdomains` OR spec is not in a core subdomain, the business-analyst subagent SHALL NOT be triggered (Zero-Pack-Zero-Impact).
5. THE business-analyst subagent output SHALL be capped at 600 tokens to prevent context bloat.
6. THE business-analyst output SHALL be dispatched alongside product's user stories and architect's technical constraints; merged draft's "需求" section SHALL cite business-analyst's rules as explicit numbered items.

### Requirement 6: 活文档生成

**User Story:** As a product manager or business stakeholder, I want a browsable living documentation site that shows all scenarios by Bounded Context with their current pass/fail status, so that I can verify the system's supported behaviors without reading code.

#### Acceptance Criteria

1. THE `/forge spec --living-doc` SHALL scan `.forge/specs/*/spec.md` for `## Scenarios` sections and `.forge/acceptance/*/report.md` for verdict data.
2. THE generator SHALL produce:
   - `.forge/docs/living/index.html` — landing page with Context grid and global stats
   - `.forge/docs/living/<context>.html` — per-context page listing all scenarios
   - `.forge/docs/living/assets/` — self-contained CSS/JS (no external CDN)
3. EACH scenario entry SHALL display: title, feature reference, latest verdict (pass/fail/pending/skip), timestamp of last run, link to original spec and acceptance report.
4. THE landing page SHALL show Context-level stats: total scenarios per context, pass rate, last-updated timestamp.
5. THE generator SHALL be an offline, one-shot command (not a server). Regeneration idempotent.
6. WHEN `.forge/specs/` has no scenarios, the generator SHALL produce a skeleton page with "0 scenarios" and exit 0 (Zero-Pack-Zero-Impact).
7. THE generated HTML SHALL be accessible (WCAG AA for color contrast and keyboard navigation) and print-friendly.
8. THE generator SHALL NOT depend on any frontend framework (vanilla HTML/CSS/JS); total output size ≤500KB typical.

### Requirement 7: Money Lint（PMS Pack）

**User Story:** As a PMS developer, I want lint rules that prevent the most common money-handling bugs (float arithmetic, raw number types for amounts, missing currency), so that accounting correctness is enforced at edit time not at audit time.

#### Acceptance Criteria

1. THE `packs/pms/lint-rules/money/` SHALL contain at minimum 3 Biome/ESLint rule implementations:
   - `no-number-for-money`: warn when a variable named `amount|price|cost|fee|charge|total|balance|subtotal|tax` has `number` type.
   - `require-money-factory`: error when a numeric literal is assigned or passed to a parameter typed `Money`, instead of going through `Money.of(value, currency)`.
   - `explicit-currency-exchange`: error when arithmetic operations combine two `Money` values of different currencies without explicit `exchange()`.
2. THE rules SHALL be published as a single Biome plugin or ESLint plugin module, importable from the Pack.
3. WHEN the Pack is enabled, the rules SHALL be auto-registered via Forge's lint integration (new `src/lint/pack-rules.ts` that reads `extends.lint_rules` from enabled packs).
4. WHEN the Pack is not enabled, the rules SHALL NOT affect any lint output (Zero-Pack-Zero-Impact).
5. THE rules SHALL have meaningful error messages with a fix suggestion (e.g., "Use Money.of(100, 'CNY') instead of `100`").
6. THE rules SHALL have unit tests covering each rule's positive and negative cases.

### Requirement 8: Time Lint（PMS Pack）

**User Story:** As a PMS developer working on time-sensitive logic, I want lint rules that flag raw `new Date()` / `Date.now()` in business code so that I'm forced to use the injected `BusinessDayClock` for testable, timezone-aware time handling.

#### Acceptance Criteria

1. THE `packs/pms/lint-rules/time/` SHALL contain at minimum 2 rule implementations:
   - `no-raw-date-in-domain`: error when `new Date()` or `Date.now()` appears in files matching `src/domain/**` (configurable via pack settings).
   - `prefer-business-day-clock`: warn when `toISOString()` or date arithmetic is used on a wall-clock `Date` in a file that imports `BusinessDayClock` but doesn't use it.
2. THE rules SHALL allow an escape hatch: a comment `// @forge:allow-raw-date <reason>` on the offending line suppresses the finding with reason logged.
3. THE rules SHALL have a configurable file-path glob for "domain code" (default `src/domain/**`), overridable via `.forge/custom/lint-config.yaml`.
4. WHEN the Pack is not enabled, the rules SHALL NOT affect any lint output.

### Requirement 9: PMS 场景库扩展

**User Story:** As a PMS developer, I want the scenario library expanded to 50+ scenarios covering overbooking, corporate accounts, POS integration, invoicing/tax, and loyalty programs, so that most common PMS features have a starting template.

#### Acceptance Criteria

1. THE `packs/pms/scenarios/` total scenario count SHALL reach ≥50 (adding ≥30 beyond Sprint 2's 20).
2. NEW sub-directories SHALL be added:
   - `overbooking/` — at minimum 5 scenarios (overbook within policy, upgrade to resolve, walk a guest, overbook declined at check-in, compensation policy)
   - `corporate/` — at minimum 5 scenarios (company rate, direct bill setup, monthly invoice, credit limit exceeded, contract expiry)
   - `pos-integration/` — at minimum 5 scenarios (charge-to-room from restaurant, split bill, POS offline queue, chargeback)
   - `invoice-tax/` — at minimum 5 scenarios (VAT invoice, US sales tax, split-tax multi-jurisdiction, refund with tax adjustment, void invoice)
   - `loyalty/` — at minimum 5 scenarios (earn points on stay, redeem points, tier upgrade, loyalty rate, partner airline miles)
3. EACH new scenario SHALL pass Sprint 1 Scenario Linter AND Spec Leak Detector against PMS banned-patterns.
4. THE `packs/pms/README.md` scenario inventory SHALL be updated to list all 50+ scenarios organized by directory.

### Requirement 10: Customization Sample Pack

**User Story:** As a future consumer of Forge's Pack ecosystem (e.g., a hotel chain wanting to extend PMS with chain-specific rules), I want a working sample pack that demonstrates the three-layer customization (new contexts, overridden glossaries, added scenarios), so that I have a template to fork.

#### Acceptance Criteria

1. THE `packs/pms-marriott-sample/` SHALL be a minimal example pack that depends on `pms` pack (declared in `pack.yaml` `depends_on: [pms]`; manual activation order enforced).
2. THE sample pack SHALL demonstrate:
   - New Context: `contexts/bonvoy-loyalty.md` — a new Bounded Context not in base PMS pack
   - Overridden glossary: `glossary/folio-billing.md` adding 2 chain-specific terms (not overriding base, additive via union)
   - New scenarios: `scenarios/bonvoy/earn-points.feature`, `scenarios/bonvoy/platinum-upgrade.feature`
   - Overridden state machine: `state-machines/reservation.yaml` with one extra state `AwaitingLoyaltyUpgrade` inserted between `Confirmed` and `CheckedIn`
3. THE sample pack `pack.yaml` SHALL declare `experimental: true` (new optional field; treated as informational only).
4. THE `scripts/init.sh --pack pms --pack pms-marriott-sample` SHALL succeed and the resulting project SHALL show all three layers via `/forge pack inspect pms-marriott-sample`.
5. THE sample pack SHALL have its own README documenting what each override demonstrates and warning "this is a sample, not a production pack".
6. THE sample pack SHALL NOT be included in any default `/forge init` flow (opt-in only via explicit `--pack` flag).

### Requirement 11: 核心子域声明

**User Story:** As a Pack author, I want to declare which contexts in my pack are "core subdomains" (business-differentiating), so that Forge can apply extra scrutiny (e.g., business-analyst subagent, mutation testing, forced acceptance) to them.

#### Acceptance Criteria

1. THE Sprint 1 `PackManifest.feature_flags` SHALL recognize a new field `core_subdomains: string[]` listing Bounded Context names considered core.
2. THE PMS Pack SHALL declare `core_subdomains: [reservations, folio-billing, night-audit]`.
3. THE `/forge spec` SHALL consult the union of all enabled packs' `core_subdomains` to decide business-analyst triggering (R5.2).
4. THE `/forge review` layer-4-like conditional checks (if any, e.g., mutation blocking threshold) MAY use `core_subdomains` for stricter verdicts in future.
5. Backward-compatible: `core_subdomains` absent is equivalent to `[]` (no special treatment).

### Requirement 12: 非功能需求

**User Story:** As a Forge maintainer, I want Sprint 3 additions to meet Forge's performance, correctness, and non-disruption standards.

#### Acceptance Criteria

1. PERFORMANCE: DDD template rendering (placeholder substitution) SHALL complete in ≤50ms per file on MacBook Pro M-series.
2. PERFORMANCE: Context Boundary Hook SHALL run in ≤150ms per tool invocation (R4.6).
3. PERFORMANCE: Living Doc generation on 50 specs / 500 scenarios SHALL complete in ≤5 seconds.
4. CORRECTNESS: `forge-storm` collected items SHALL be lossless through interrupt/resume cycles (property test).
5. ZERO-PACK-INVARIANT: `test/pack/zero-pack-invariant.test.ts` SHALL be extended to verify Sprint 3 additions remain no-op without packs: no templates resolved, context boundary hook no-ops, business-analyst not triggered, money/time lint rules not loaded, living doc generates empty skeleton.
6. DOCS: Each new skill (`forge-storm`) and new agent (`business-analyst`) SHALL have comprehensive SKILL.md / agent.md matching existing Forge style. Each new public TS function in `src/lint/pack-rules.ts` and `src/living-doc/` SHALL have TSDoc with `@example`.
7. I18N: All user-facing strings in new skills and agents SHALL be Simplified Chinese; English acceptable for technical DDD/BDD terms (Aggregate, Bounded Context, Ubiquitous Language, Saga, Three Amigos, etc.).

---

## Amendment 2026-05-10

**Source**: `.kiro/specs/sprint-3-gap-remediation/` (R7)

### R7 / R8 Lint Rule Form Clarification

Original wording in R7 AC 1 and R8 AC 1 referenced "Biome plugin or ESLint plugin module". Actual shipped form deviates by design:

- **Shipped form**: YAML declarative rule files under `packs/<name>/lint-rules/<group>/*.yaml` consumed by `src/lint/pack-rules.ts`, executed on-demand via `scripts/lint-pack-rules.mjs`.
- **Rationale**: zero new runtime dependencies; Pack code is data-only (no arbitrary JS execution); Zero-Pack-Zero-Impact preserved.
- **Trade-off**: rules do not surface in developer IDE (`biome check`) real-time; users must run the dedicated lint script.
- **Future direction**: a separate spec may wrap YAML rules as a Biome plugin for IDE integration, but is not required for current scope.

R7 AC 1 and R8 AC 1 are hereby amended to reflect the shipped form. No code change is required.
