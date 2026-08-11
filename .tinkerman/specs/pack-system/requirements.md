---
status: completed
feature: pack-system
layout: requirements
created: 2026-05-09
tier: standard
---
# Requirements Document

## Introduction

本特性为 Forge 引入**可插拔领域包（Domain Pack）机制**，把领域无关的方法论能力（DDD / ATDD / BDD / TDD / SDD）留在 Core 层，把领域特定知识（酒店 PMS、金融、电商等）下放到 `packs/<name>/` 子目录，业务项目通过 `.tinkerman/config.md` 声明启用哪些 Pack。Forge 从"单用途 AI 工作流 skill 包"升级为"**通用工作流框架 + 可插拔领域生态**"。

问题陈述：Forge 当前已支持 SDD / TDD 完整工作流，但 ATDD 的纯领域语言约束、DDD 的限界上下文模型、BDD 的行为场景协作均未落地。若把这些能力以"PMS 专用逻辑"硬编码到 Core，Forge 将失去作为通用框架的定位；若以"纯方法论能力"独立实现但没有领域数据输入渠道，又无法在实际 PMS 项目中发挥价值。Pack 机制是解开这一矛盾的唯一工程化方案。

价值来源：

1. **分层解耦**：Core（方法论）/ Pack（领域）/ Custom（项目特化）三层架构，各司其职，按需启用。
2. **领域可替换**：今天做酒店 PMS Pack，明天可以做金融 Pack、电商 Pack，Core 零改动。
3. **项目可定制**：同一个 PMS Pack 在不同酒店集团可通过 `.tinkerman/custom/` 覆盖术语、场景、规则。
4. **dogfooding 深化**：Pack 本身用 Forge 工作流开发，Pack 同时又被 Forge 自身消费，形成闭环。
5. **为 Sprint 2/3 铺轨**：PMS Pack v1、DDD 战术模板、BDD 活文档都需要 Pack 基础设施作为载体。

架构选择（分层覆盖）：本特性采用 **Core < Pack < Custom** 三层优先级。Core 提供纯方法论能力的引擎（Bounded Context 注册、Glossary 查询、Leak Detector 执行、Scenario Linter 规则），Pack 提供领域数据（Context 定义、术语表、禁用词清单、场景模板），Custom 提供项目级覆盖（`.tinkerman/custom/<...>` 优先读取）。同名条目按优先级覆盖，不同名条目并存。Pack 和 Custom 均为 opt-in，未声明即不生效。

关键约束（贯穿所有需求）：

- **Zero-Pack-Zero-Impact**：未在 `.tinkerman/config.md` 启用任何 Pack 时，Forge 核心代码路径行为与 Sprint 1 改造前完全一致；`npm run check` 跑完整回归测试通过。
- **单仓库就近存储**：Pack 作为 Forge 仓库的一部分存放在 `packs/<name>/`，不独立发版；需要独立生命周期时再拆仓库。
- **不破坏既有 SKILL 外部契约**：本特性通过新增 `src/pack/`、`src/context/`、`src/glossary/`、`src/spec-leak-detector.ts`、`src/scenario-linter.ts` 模块 + 新增 `skills/forge-pack/` skill + 扩展 `skills/forge-spec/` 和 `skills/forge-plan/` 的 references 的方式落地。既有 SKILL.md 的主体结构零变化，仅在 Pack 启用时通过 reference 引入新能力。
- **前向兼容**：本特性启用前创建的 spec / plan / review 文档按 Core 层规则继续工作；Pack 启用后仅影响新创建的文档。

## Glossary

- **Forge**：本项目，Claude Code 的 AI 编码工作流 skill 包，以 `/forge` 命令族驱动 decide → spec → plan → build → review → test → ship → learn 八阶段。
- **Forge_Core**：Forge 领域无关的方法论能力层，包含现有 18 个命令、三维路由、`.tinkerman/` 状态系统、以及本特性新增的 Bounded Context 引擎、Glossary 引擎、Leak Detector 引擎、Scenario Linter 引擎。
- **Pack**：领域包，存放于 `packs/<name>/` 目录，包含领域特定的 Bounded Context 定义、术语表、禁用词清单、场景模板、状态机、代码模板、lint 规则。Pack 是 opt-in 的，未启用即不生效。
- **Pack_Name**：Pack 的唯一标识符，kebab-case，例如 `pms`、`fintech`、`ecommerce`。
- **Pack_Manifest**：`packs/<name>/pack.yaml`，Pack 的元数据文件。必填字段：`name`、`display_name`、`description`、`forge_min_version`、`extends`；可选字段：`depends_on`、`feature_flags`。
- **Pack_Registry**：Forge 启动时通过扫描 `packs/*/pack.yaml` 建立的内存索引，记录所有可用 Pack 的元数据。
- **Enabled_Packs**：业务项目在 `.tinkerman/config.md` YAML frontmatter 中通过 `packs:` 字段声明启用的 Pack 列表，按声明顺序加载。
- **Custom_Layer**：`.tinkerman/custom/` 目录下的项目级覆盖文件，路径与 Pack 目录结构镜像（例如 `packs/pms/glossary/folio.md` 的覆盖位于 `.tinkerman/custom/glossary/folio.md`）。
- **Resolution_Order**：条目查询的优先级：Custom_Layer → Enabled_Packs（按声明顺序）→ Forge_Core 默认。先命中先返回。
- **Bounded_Context**：DDD 限界上下文，一个独立的领域子域，拥有自己的统一语言和模型边界。在 Forge 中表现为 `packs/<name>/contexts/<context>.md` 或 `.tinkerman/contexts/<context>.md` 文件。
- **Context_File**：单个 Bounded Context 的 markdown 文件，含 YAML frontmatter（name / responsibility / aggregates / inbound_events / outbound_events / upstream / downstream）和 body。
- **Context_Map**：`_map.yaml` 声明 Context 之间的上下游关系（Partnership / Customer-Supplier / Conformist / Anti-Corruption-Layer / Open-Host / Published-Language / Shared-Kernel）。
- **Glossary**：分 Context 组织的术语表，结构为 `packs/<pack>/glossary/<context>.md` 或 `.tinkerman/custom/glossary/<context>.md`。每条术语含名称、定义、别名、所属 Context、来源、更新日期。
- **Term_Mismatch**：当同一个词在不同 Bounded Context 中有不同定义时，若 spec / 代码使用了错误 Context 的定义，即发生 Term_Mismatch。
- **Banned_Pattern**：禁用模式清单，结构为 `packs/<pack>/banned-patterns.yaml`，按类别（code / infrastructure / framework / technical）列出禁止出现在 spec 场景中的 regex / 关键词。
- **Leak_Finding**：Spec Leak Detector 的输出条目，包含 `category`、`file`、`line`、`original`、`matched_term`、`suggested_rewrite`。
- **Scenario_Rule**：场景格式规则，例如"每条 Given/When/Then 必须以句号结尾"、"禁止 HTTP 方法 / API 路径"、"必须外部可观察"。
- **Expected_Output**：原子任务中每个 Run 步骤必须附带的预期输出字段，用于 RED_Verification_Gate 和 Completion_Gate 比对。
- **RED_Verification_Gate**：TDD RED 阶段必须观察到测试失败的强制闸口，要求提交"命令 + 实际输出 + 预期失败原因"三段证据后才能进入 GREEN。
- **Pack_Command**：新增 skill `forge-pack` 暴露的子命令：`list` / `enable` / `disable` / `inspect` / `override` / `validate` / `new`。
- **Zero_Pack_Invariant**：未启用任何 Pack 时 Forge 行为与本特性改造前完全一致，包括：所有现有测试通过、所有 SKILL.md 外部契约不变、`.tinkerman/` 文件读写行为不变、`npm run check` 退出码不变。
- **Pack_Loader**：`src/pack/loader.ts` 提供的纯函数，输入为仓库根路径和 `.tinkerman/config.md` 解析结果，输出为 `{ registry, enabledPacks, resolutionOrder }`。
- **Override_Resolver**：`src/pack/resolver.ts` 提供的纯函数，输入为相对路径（如 `glossary/folio.md`）和 `{ enabledPacks, customLayerRoot }`，按 Resolution_Order 返回首个命中的绝对路径或 null。

## Requirements

### Requirement 1: Pack 发现与清单

**User Story:** As a Forge maintainer, I want Forge to automatically discover all packs in `packs/` at startup, so that adding a new pack is as simple as dropping a folder with `pack.yaml`.

#### Acceptance Criteria

1. THE `Pack_Loader` SHALL scan `packs/*/pack.yaml` at Forge startup or first invocation of any Pack-aware skill and build an in-memory `Pack_Registry`.
2. THE `Pack_Manifest` SHALL be a YAML file with required fields `name` (kebab-case string, matching directory name), `display_name`, `description`, `forge_min_version` (semver), `extends` (object describing which directories the pack provides).
3. WHEN a `pack.yaml` is missing any required field, THE `Pack_Loader` SHALL exclude that pack from the registry and emit a single-line warning to stderr with format `pack: <name> invalid manifest — <reason>`.
4. WHEN two packs declare the same `name`, THE `Pack_Loader` SHALL keep only the first one discovered (alphabetical by directory) and warn about duplicates.
5. THE `Pack_Registry` SHALL be a pure data structure (no methods, no side effects) and SHALL be safely serializable to JSON.
6. THE `Pack_Manifest.extends` field SHALL be an object where keys are one of `contexts`, `glossary`, `scenarios`, `state_machines`, `banned_patterns`, `lint_rules`, `templates`, `agents`, `utils` and values are directory paths relative to the pack root.

### Requirement 2: 项目级 Pack 启用

**User Story:** As a business project developer, I want to enable packs by declaring them in `.tinkerman/config.md`, so that my project configuration makes its domain dependencies explicit and version-controlled.

#### Acceptance Criteria

1. THE `.tinkerman/config.md` YAML frontmatter SHALL support a `packs:` field accepting a list of strings (pack names).
2. WHEN `packs:` is absent or empty, `Enabled_Packs` SHALL be `[]` and `Zero_Pack_Invariant` SHALL hold.
3. WHEN `packs:` lists a pack name that does not exist in `Pack_Registry`, THE Forge startup SHALL fail loudly with exit code non-zero and message `pack not found: <name>. Available packs: <list>`.
4. WHEN `packs:` lists a pack name more than once, THE duplicates SHALL be deduplicated (keep first occurrence), no error.
5. THE `Enabled_Packs` order SHALL be preserved exactly as declared (first declared has higher Resolution_Order priority among packs).
6. THE `packs:` field SHALL NOT require a version number (single-repo, pack version == Forge version).

### Requirement 3: Zero-Pack-Zero-Impact 不变量

**User Story:** As an existing Forge user who has not adopted any pack, I want Sprint 1 changes to be invisible to my workflow, so that upgrading Forge never breaks my current specs, plans, or builds.

#### Acceptance Criteria

1. WHEN `Enabled_Packs` is `[]`, every existing SKILL (forge-spec / forge-plan / forge-build / forge-review / forge-test / forge-ship / forge-learn / others) SHALL produce identical outputs (up to deterministic fields like timestamps) to its pre-Sprint-1 behavior on the same inputs.
2. THE full `npm run check` test suite SHALL pass with `packs:` absent from all existing fixtures.
3. THE Core test suite SHALL include at least one regression test named `zero-pack-invariant.test.ts` that exercises forge-spec lock, forge-plan approval, forge-build TDD flow, and forge-review P0/P1 gate with zero packs enabled.
4. THE Spec Leak Detector engine (Requirement 7) SHALL be a no-op when `Enabled_Packs` is empty AND `.tinkerman/custom/banned-patterns.yaml` does not exist.
5. THE Bounded Context engine (Requirement 5) SHALL be a no-op when no Context files are declared by any enabled pack or custom layer.
6. THE Glossary engine (Requirement 6) SHALL fall back to the existing single-file `.tinkerman/glossary.md` behavior when no per-context glossary files exist under any enabled pack or custom layer.

### Requirement 4: Pack 管理命令

**User Story:** As a developer, I want a `/forge pack` skill to discover, enable, inspect, and scaffold packs, so that I can manage packs without hand-editing YAML.

#### Acceptance Criteria

1. THE `skills/forge-pack/SKILL.md` SHALL define subcommands: `list`, `enable <name>`, `disable <name>`, `inspect <name>`, `override <path>`, `validate [<name>]`, `new <name>`.
2. WHEN invoked with `list`, THE skill SHALL print all packs in `Pack_Registry` with columns: name, display_name, status (enabled/available), extends.
3. WHEN invoked with `enable <name>`, THE skill SHALL add `<name>` to `.tinkerman/config.md` frontmatter `packs:` list (create the field if absent); idempotent (re-enable is no-op).
4. WHEN invoked with `disable <name>`, THE skill SHALL remove `<name>` from `.tinkerman/config.md` frontmatter `packs:` list; idempotent.
5. WHEN invoked with `inspect <name>`, THE skill SHALL print the pack's manifest fields and counts per category (e.g., "8 contexts, 12 glossary files, 20 scenarios").
6. WHEN invoked with `override <path>` where `<path>` is a relative path under any enabled pack (e.g., `glossary/folio.md`), THE skill SHALL copy the file from the first-hit pack to `.tinkerman/custom/<path>` for user editing; refuse if destination already exists unless `--force` is passed.
7. WHEN invoked with `validate [<name>]`, THE skill SHALL verify for the target pack (or all packs if no name): (a) `pack.yaml` parses successfully; (b) all directories declared in `extends` exist; (c) all Context files referenced in `_map.yaml` exist; (d) all glossary files have valid frontmatter. Output per-pack pass/fail with line-level issues.
8. WHEN invoked with `new <name>`, THE skill SHALL scaffold `packs/<name>/` with empty `pack.yaml`, `README.md`, and empty subdirectories for each `extends` category.
9. THE `forge-pack` skill SHALL be loaded on-demand, not by default; `/forge pack` is the entry point.

### Requirement 5: Bounded Context 引擎

**User Story:** As a DDD practitioner, I want Forge to understand my project's Bounded Contexts, so that specs and code respect context boundaries and use the right ubiquitous language per context.

#### Acceptance Criteria

1. THE `src/context/registry.ts` SHALL expose pure functions `loadContexts(packRoots, customLayerRoot)` returning `ContextRegistry` (a map from context name to `ContextEntry`).
2. THE `ContextEntry` SHALL contain fields: `name` (from frontmatter), `responsibility`, `aggregates` (list), `inbound_events` (list), `outbound_events` (list), `upstream` (list of context names), `downstream` (list), `source_path`, `source_layer` (one of `custom`, `pack:<name>`, `core`).
3. WHEN multiple layers define a context with the same name, THE `Custom_Layer` version SHALL override any pack version; among packs, the first in `Enabled_Packs` wins.
4. THE `Context_Map` (`_map.yaml`) SHALL be optional; when present, it SHALL declare context-to-context relationships with one of the types: `partnership`, `customer-supplier`, `conformist`, `acl`, `open-host`, `published-language`, `shared-kernel`.
5. THE `loadContextMap(packRoots, customLayerRoot)` SHALL merge `_map.yaml` entries following Resolution_Order; conflicting edges (same source+target with different relationship) SHALL prefer Custom_Layer > earlier pack > later pack.
6. WHEN `Enabled_Packs` is empty and no `.tinkerman/custom/contexts/` exists, `loadContexts()` SHALL return an empty registry; calls to `registry.get(name)` SHALL return `null` for any name.

### Requirement 6: 分 Context 统一语言

**User Story:** As a PMS developer, I want "Room" in Reservations context to mean "room type" and "Room" in Front Desk context to mean "physical room unit", without the two definitions colliding.

#### Acceptance Criteria

1. THE `src/glossary/registry.ts` SHALL expose `loadGlossary(packRoots, customLayerRoot)` returning `GlossaryRegistry` keyed by `<context>::<term>`.
2. EACH glossary file SHALL follow the format `packs/<pack>/glossary/<context>.md` or `.tinkerman/custom/glossary/<context>.md` where `<context>` matches a context name (or the special value `_shared` for cross-context terms).
3. EACH glossary entry SHALL have YAML frontmatter fields `term`, `aliases` (optional list), `updated` (ISO date), `source` (optional string) and body containing `## 定义`.
4. THE `detectContextTermMismatch(text, currentContext, registry)` SHALL scan the given text for any term that is defined in a context other than `currentContext` AND NOT defined in `currentContext`, returning a list of `{ term, usedContext, definedIn }`.
5. WHEN `Enabled_Packs` is empty and no per-context glossary exists, THE `loadGlossary()` SHALL fall back to loading `.tinkerman/glossary.md` as a single `_shared` context.
6. WHEN a term appears in both Custom_Layer and a pack under the same `<context>`, THE Custom_Layer definition SHALL win; a debug log SHALL note the override.

### Requirement 7: Spec Leak Detector 引擎

**User Story:** As a spec author, I want the leak detector to catch implementation details (class names, API paths, database columns) in my spec scenarios, so that specs stay in pure domain language.

#### Acceptance Criteria

1. THE `src/spec-leak-detector.ts` SHALL expose `detectSpecLeak(specText, filePath, registry, glossary)` returning `LeakFinding[]`.
2. EACH `LeakFinding` SHALL include: `category` (one of `code`, `infrastructure`, `framework`, `technical`), `file`, `line` (1-indexed), `original` (the full line), `matched_term` (the banned token or regex match), `suggested_rewrite` (nullable string), `source_layer` (which layer's banned pattern caught it).
3. THE banned pattern registry SHALL be loaded from (in Resolution_Order): `.tinkerman/custom/banned-patterns.yaml` → `packs/<enabled>/banned-patterns.yaml` → no defaults. Patterns are unioned across layers, not overridden.
4. THE `banned-patterns.yaml` schema SHALL support fields `categories` (map of category_name → list of `{ pattern, description, suggestion_template? }`) where `pattern` is a string to match (case-insensitive by default) or `regex:<expr>` for regex matching.
5. WHEN a matched term is also present in `glossary` for the spec's context, THE detector SHALL NOT emit a finding (glossary terms are whitelisted).
6. THE detector SHALL NOT emit findings for lines inside fenced code blocks (```...```); only prose lines and Gherkin Given/When/Then lines are scanned.
7. THE detector SHALL be integrated into `forge-spec` as the 7th self-check item; presence of any finding SHALL block `status: locked` transition.
8. THE detector SHALL be integrated into `forge-review` Layer 1 (spec-check agent) as a re-scan step; findings detected post-lock SHALL be reported as P1.
9. WHEN `banned-patterns.yaml` is absent at all layers, `detectSpecLeak()` SHALL return `[]` without error (honors Zero_Pack_Invariant).

### Requirement 8: Scenario Linter

**User Story:** As a BDD author, I want my Given/When/Then scenarios to follow consistent formatting rules (period-terminated, externally observable), so that AI agents can parse them reliably and reviewers can read them as business specifications.

#### Acceptance Criteria

1. THE `src/scenario-linter.ts` SHALL expose `lintScenarios(specText, filePath, options)` returning `LintFinding[]` where each finding has `rule_id`, `severity` (`error`/`warning`), `file`, `line`, `message`.
2. THE linter SHALL enforce the following rules by default:
   - `SCN001`: Every Given/When/Then/And line SHALL end with `.` (period) or `。` (Chinese period).
   - `SCN002`: Every Scenario SHALL have at least one Given, one When, and one Then.
   - `SCN003`: Every THEN line SHALL describe an externally observable outcome (no references to internal state like "database contains", "variable equals"; enforced via pattern match).
   - `SCN004`: Scenario titles SHALL use kebab-case or Chinese (no mixed camelCase/snake_case in the same title).
3. THE linter SHALL accept `options.additionalRules` for pack-provided rule packs, merged with defaults.
4. THE linter SHALL be invoked by `forge-spec` before `status: locked`; any `error`-severity finding SHALL block lock.
5. THE linter SHALL be invoked by `forge-accept` on load; malformed scenarios SHALL NOT be executed and SHALL be reported as "lint-failed".
6. WHEN a spec has no `## Scenarios` section, THE linter SHALL return `[]` (no-op, not an error).

### Requirement 9: RED Verification Gate

**User Story:** As a TDD practitioner, I want Forge to force me (or the AI subagent) to capture the actual failing test output before writing any implementation code, so that I know the test actually exercises the missing behavior.

#### Acceptance Criteria

1. THE `skills/forge-build/references/tdd-rules.md` SHALL add a new section `## RED Verification Gate` requiring, after RED step, emission of three evidence fields: `command` (the command actually run), `actual_output` (first 10 lines of the real failure output), `expected_failure_reason` (e.g., "function not defined", "assertion failed").
2. WHEN the `actual_output` field shows the test PASSED, THE subagent SHALL halt RED phase with message "RED 测试未失败：功能可能已存在或测试未断言实际行为" and re-author the test.
3. WHEN the `actual_output` field shows the test ERRORED (not assertion failure but syntax/import error), THE subagent SHALL fix the test itself before proceeding, re-running and re-capturing evidence.
4. THE `forge-build` execution loop SHALL parse the three evidence fields from the subagent's structured output and reject the transition to GREEN phase if any is missing or if `actual_output` does not contain failure indicators (e.g., `FAIL`, `Error`, `AssertionError`, `expected ... to ...`).
5. THE RED Verification Gate SHALL be documented with at least 2 examples (one TS/vitest, one shell) in `tdd-rules.md` references.
6. THE gate SHALL not apply to REFACTOR phase (refactoring keeps tests green by definition).

### Requirement 10: Plan 任务 Expected Output 字段

**User Story:** As a plan author, I want every Run step in an atomic task to declare its expected output, so that the downstream build subagent has a ground-truth comparison for completion.

#### Acceptance Criteria

1. THE `skills/forge-plan/references/atomic-task-format.md` SHALL require each Run step to include an `Expected:` line following the command, e.g., `Run: \`npm test path/to/test.ts\`` / `Expected: FAIL — "function not defined"`.
2. THE `forge-plan` self-check SHALL add a new check item "Expected Output Completeness" that scans each task's Run steps and flags any Run step missing an `Expected:` line.
3. WHEN the plan's `monolith_acknowledged: true` is set, THE Expected Output check SHALL still apply (this is about quality, not structure).
4. THE Expected Output format SHALL accept three shapes:
   - Exit code: `Expected: exit 0` or `Expected: exit 1`
   - Substring match: `Expected: <output contains "<string>">`
   - Fail reason: `Expected: FAIL — "<reason>"` (for RED verification per Requirement 9)
5. THE `forge-build` subagent SHALL compare actual output to the Expected field; mismatch SHALL be raised as a P1 finding in the build progress.
6. BACKWARD COMPATIBILITY: Existing plans (pre-Sprint-1) without Expected fields SHALL continue to work; the self-check SHALL emit a `warning` (not `error`) for missing Expected in legacy plans, upgrade-only migration path.

### Requirement 11: Custom Override 层

**User Story:** As a hotel chain owner using the PMS pack, I want to override a specific glossary term, scenario, or banned pattern in `.tinkerman/custom/`, so that my chain-specific semantics don't require forking the pack.

#### Acceptance Criteria

1. THE `.tinkerman/custom/` directory SHALL mirror the structure of a pack's `extends` categories (`contexts/`, `glossary/`, `scenarios/`, `state-machines/`, `banned-patterns.yaml`, `templates/`).
2. WHEN the same relative path exists in both `.tinkerman/custom/` and an enabled pack, THE `Override_Resolver` SHALL return the Custom_Layer file.
3. THE `Override_Resolver` SHALL be used by all loaders (contexts, glossary, scenarios, state-machines, banned-patterns, templates) — not hardcoded per-loader.
4. WHEN `.tinkerman/custom/banned-patterns.yaml` exists, its categories SHALL be **unioned** with pack banned-patterns (not overridden), since multiple banned categories are additive.
5. WHEN `.tinkerman/custom/` does not exist or is empty, the resolver SHALL fall through to pack layer transparently; Zero_Pack_Invariant SHALL hold.
6. THE `/forge pack override <path>` command (Requirement 4.6) SHALL be the canonical way to bootstrap a custom override file.

### Requirement 12: 非功能需求

**User Story:** As a Forge maintainer, I want the Pack system to be testable, fast, and non-disruptive, so that it meets Forge's existing engineering standards.

#### Acceptance Criteria

1. PERFORMANCE: `Pack_Loader` cold scan SHALL complete in ≤200ms for a repo with ≤10 packs (target measured on MacBook Pro M-series).
2. PERFORMANCE: `detectSpecLeak` on a 500-line spec SHALL complete in ≤100ms.
3. CORRECTNESS: All pure-function modules (`pack/loader`, `pack/resolver`, `context/registry`, `glossary/registry`, `spec-leak-detector`, `scenario-linter`) SHALL have fast-check property tests covering idempotence and resolution-order invariants.
4. OBSERVABILITY: Pack loading errors SHALL be reported via stderr with structured format `pack: <name> <stage> — <reason>` (stage ∈ discover/parse/validate/load).
5. I18N: All user-facing strings in new skills and references SHALL be in Simplified Chinese (consistent with Forge existing conventions); error messages MAY be in English for log parsing.
6. DOCS: Each new public function SHALL have TSDoc with `@param`, `@returns`, and at least one `@example`; `typedoc` generation SHALL succeed.
