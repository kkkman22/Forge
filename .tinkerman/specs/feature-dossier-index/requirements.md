---
status: completed
feature: feature-dossier-index
layout: requirements
created: 2026-05-11
tier: standard
---
# Requirements Document

## Introduction

本特性为 Forge 增加一份**功能维度的索引文档**（Feature Dossier），解决 `.tinkerman/` 目录按阶段平铺导致的"一个功能的产物散落在 5-7 个目录"的回顾痛点。今天回顾一个功能从需求 → 决策 → 计划 → 评审 → 进度的全貌时，需要用户在 `decisions/`、`specs/<feature>/`、`plans/`、`reviews/`、`progress/`、`findings/`、`debug/` 这些目录之间来回跳转按 topic 拼凑，摩擦大且容易遗漏。

问题陈述：Forge 当前的目录按"阶段维度"组织（一个 skill 写一个目录），这对写入路径稳定、冻结门禁清晰非常友好，但对"按功能回顾"不友好。具体表现为：

1. 回顾 `structured-observability` 需要同时打开 `specs/structured-observability/spec.md`、`plans/structured-observability.md`、`decisions/2026-04-29-structured-observability.md`、`progress/structured-observability.md`，没有入口文件
2. topic 命名在各目录间存在不一致（decisions 带日期前缀、spec 目录是 feature 名、plan 是 topic 名），导致检索摩擦
3. 没有跨阶段一致性的可视化（比如 "spec 有 R3 但 plan 没覆盖" 这类问题靠人工比对）

价值来源：

1. **一处回顾**：打开一份 `.tinkerman/features/<topic>.md` 即可看到该功能的全部阶段链接 + 状态 + 摘要
2. **零侵入**：物理目录布局完全不变，所有 skill 写入路径不动，冻结规则不动，迁移成本为零
3. **自动维护**：通过 PostToolUse Hook 在相关文件被写入时自动重建索引，用户无感
4. **可被归档**：`/forge learn` 归档时顺带冻结一份 dossier 作为"功能完结档案"

架构选择（Hook 驱动的派生视图）：本特性采用 **派生视图（derived view）** 而非**物理重组（physical reorg）**。派生视图意味着索引是可再生的衍生物，物理文件仍由各 skill 写入各自的阶段目录；Hook 监听这些写入事件并重建索引。**不做**物理重组因为会涉及 40+ 文件路径改写、冻结规则重构、存量迁移和 `.tinkerman/specs/` 互操作等大面积代价，且不可逆。

关键约束：

- **零 SKILL 改动**：不新增任何会被"按需加载"机制拉进 LLM 上下文的 SKILL.md；不修改 18 个命令中任一 skill 的输出路径
- **零按需加载成本**：索引的生成和更新完全发生在 Claude Code 外（shell / Node 脚本），日常使用不消耗任何 token 预算
- **零目录迁移**：`.tinkerman/specs/`、`.tinkerman/plans/`、`.tinkerman/decisions/` 等现有目录保持现状
- **派生可重建**：`.tinkerman/features/` 下所有文件都可以通过扫描其它目录一次性重建；即使被手动删除也不影响 Forge 正常工作
- **开放区语义**：`.tinkerman/features/` 处于开放区（非冻结、非受保护），避免 Hook 自己写入时被 PreToolUse 拦截

## Glossary

- **Feature_Dossier**：一个 feature 的索引文档，路径为 `.tinkerman/features/<topic>.md`。聚合该 topic 在所有阶段目录中的产物链接 + 状态 + 摘要。派生文件，可再生。
- **Topic_Key**：一个功能的规范标识符，kebab-case（如 `structured-observability`）。Dossier 文件名即 Topic_Key。
- **Stage_Directory**：`.tinkerman/` 下按阶段组织的目录，共 7 个：`decisions/`、`specs/`、`plans/`、`reviews/`、`progress/`、`findings/`、`debug/`。Dossier 的生成依据是这些目录下匹配 Topic_Key 的文件。
- **Stage_File_Pattern**：各 Stage_Directory 下匹配 topic 的规则：
  - `decisions/<YYYY-MM-DD>-<topic>.md`（日期前缀匹配）和 `decisions/ADR-<NNNN>-<topic>.md`（ADR 编号前缀匹配）
  - `specs/<topic>/spec.md`（子目录匹配）
  - `plans/<topic>.md`、`reviews/<topic>.md`、`progress/<topic>.md`、`findings/<topic>.md`、`debug/<topic>.md`（文件名精确匹配）
- **Dossier_Rebuilder**：负责重建一份 Dossier 的纯函数 + CLI 组合。纯函数位于 `src/feature-dossier.ts`，CLI 入口为 `scripts/rebuild-feature-dossier.mjs`。
- **Auto_Rebuild_Hook**：PostToolUse Hook，在 `.tinkerman/{decisions,specs,plans,reviews,progress,findings,debug}/` 下任何 markdown 文件被 Write/Edit 时触发 Dossier_Rebuilder，更新对应 topic 的 Dossier。
- **Bulk_Rebuild**：一次性重建所有 topic 的 Dossier，用于首次启用或灾难恢复。通过 `scripts/rebuild-feature-dossier.mjs --all` 调用。
- **Dossier_Staleness_Marker**：索引文件头的 `generated_at` 时间戳。回顾时若发现显著晚于最新阶段文件修改时间，提示用户手动执行 Bulk_Rebuild。
- **Topic_Discovery**：从 Stage_Directory 反向推导有哪些 topic 的过程。基础实现是取各目录下文件名的并集（去掉日期前缀 / ADR 前缀 / 子目录层级后的 kebab-case 名）。

## Requirements

### Requirement 1: Dossier 生成纯函数

**User Story:** As a Forge maintainer, I want a pure function that takes a topic name and returns a Dossier markdown string, so that the generation logic is deterministic, unit-testable, and reusable by both the CLI and the Hook.

#### Acceptance Criteria

1. THE `src/feature-dossier.ts` SHALL export a pure function `buildDossier(input: BuildDossierInput): DossierDocument` where:
   - `BuildDossierInput` contains `topic: string`, `forgeRoot: string`, and a `stageScan: StageScanResult` describing the files found in each Stage_Directory
   - `DossierDocument` contains `frontmatter: DossierFrontmatter` and `body: string` (markdown)
2. THE function SHALL be a pure function: identical inputs produce identical outputs, no filesystem access inside the function itself (I/O is done by the caller and passed in via `stageScan`).
3. THE generated markdown SHALL include the following sections in order:
   - YAML frontmatter with `topic`, `generated_at`, `auto_generated: true`, `stage_count`
   - `# Feature: <topic>` heading
   - `## 阶段索引` table with columns `阶段 | 文件 | 状态 | 最近更新`, one row per Stage_Directory (7 rows total), using `—` for stages with no files
   - `## 摘要` section with bullet list of per-stage excerpts (frontmatter fields + first heading content, trimmed to ≤ 200 chars)
   - `## 关联 ADR`（仅当 `decisions/` 下有 ADR-*.md 匹配 topic 时）列出 ADR 编号 + 标题
   - `## 相关 topic` section listing detected possible aliases (只在检测到疑似相关但命名漂移的 topic 时出现)
4. THE function SHALL escape any markdown-breaking characters in extracted summaries (特别是表格里的 `|` 字符要转义为 `\|`)。
5. THE function SHALL handle missing stages gracefully: when a Stage_Directory has no file for the topic, the corresponding table row SHALL show `— | — | —` without failing.
6. WHEN a stage file exists but lacks frontmatter, the status column SHALL show `(no frontmatter)` and the function SHALL still succeed.

### Requirement 2: 文件系统扫描与路径映射

**User Story:** As a developer calling `buildDossier`, I want a companion function to scan `.tinkerman/` and produce the `StageScanResult` input, so that I can feed `buildDossier` without reimplementing filesystem logic.

#### Acceptance Criteria

1. THE `src/feature-dossier.ts` SHALL export a function `scanStagesForTopic(topic: string, forgeRoot: string): StageScanResult` that:
   - Scans each of the 7 Stage_Directory paths
   - For each directory, finds all files matching the Stage_File_Pattern for `topic`
   - Returns a `StageScanResult` containing, per stage: list of `{ path: string; frontmatter: Record<string, unknown>; firstSection: string; mtime: string }` entries
2. THE scan SHALL handle Stage_File_Pattern variations:
   - `decisions/`: match `<date>-<topic>.md` where `<date>` is `YYYY-MM-DD`, plus `ADR-<NNNN>-<topic>.md` where `<NNNN>` is 4 digits
   - `specs/`: match the single file `specs/<topic>/spec.md`
   - `plans/`, `reviews/`, `progress/`, `findings/`, `debug/`: match `<stage>/<topic>.md`
3. WHEN a Stage_Directory does not exist, the scan SHALL treat it as empty (no entries) and SHALL NOT throw.
4. THE scan SHALL be case-sensitive on topic matching (to avoid Topic_Key collisions on case-insensitive filesystems producing false positives).
5. THE scan SHALL parse YAML frontmatter using the project's existing frontmatter utilities (`src/frontmatter.ts` if present, otherwise a minimal parser); malformed frontmatter SHALL degrade to empty object without throwing.
6. THE scan SHALL limit `firstSection` to the content from the first `##`-level heading to the next `##` or end-of-file, truncated to 500 chars.

### Requirement 3: CLI 入口 — 单 topic 与批量重建

**User Story:** As a contributor, I want CLI commands to rebuild a single dossier or all dossiers, so that I can initialize the feature index on a fresh checkout or recover from corruption.

#### Acceptance Criteria

1. THE `scripts/rebuild-feature-dossier.mjs` SHALL be a Node.js ESM script invokable via `node scripts/rebuild-feature-dossier.mjs <topic>` or `node scripts/rebuild-feature-dossier.mjs --all`.
2. WHEN invoked with a single topic argument:
   - The script SHALL call `scanStagesForTopic` + `buildDossier` for that topic
   - Write the result to `.tinkerman/features/<topic>.md`, creating `.tinkerman/features/` if absent
   - Print `dossier: wrote .tinkerman/features/<topic>.md (N stages, M files)` on success
   - Exit 0 on success, 1 on failure with a human-readable error
3. WHEN invoked with `--all`:
   - The script SHALL run Topic_Discovery across all Stage_Directory contents
   - Rebuild every dossier
   - Print a summary `dossier: rebuilt N dossiers (K topics across 7 stages)`
   - Continue on per-topic failures and report them in the summary as `failed: <topic> — <reason>`
4. THE script SHALL be added to `package.json` `scripts` as `dossier:rebuild` (single) and `dossier:rebuild:all` (batch).
5. THE script SHALL exit 2 when the current directory has no `.tinkerman/` directory, with message suggesting `forge init`.
6. THE script SHALL be idempotent: consecutive invocations with the same inputs produce identical file content modulo the `generated_at` timestamp.

### Requirement 4: PostToolUse Hook 自动重建

**User Story:** As a Forge user running `/forge spec` or `/forge plan`, I want the feature dossier to update automatically without touching any skill, so that the index stays fresh with zero manual action.

#### Acceptance Criteria

1. THE `hooks/hooks.json` SHALL gain a new PostToolUse entry:
   - Matcher: `Write|Edit`
   - Trigger condition: the written file path matches the regex `\.tinkerman/(decisions|specs|plans|reviews|progress|findings|debug)/[^/]+` 
   - Command: invokes `scripts/rebuild-feature-dossier.mjs --from-path "$TOOL_INPUT_FILE"` (new mode — see AC7)
2. THE hook SHALL have `timeout: 5` seconds and SHALL NOT block the user's workflow on failure (fail-silent via `|| true`).
3. THE hook SHALL be registered both at the project-local path (`forge/hooks/...`) and the global path (`~/.claude/skills/forge/...`) matching the existing Forge hook conventions.
4. THE hook SHALL NOT trigger when the written file is the dossier itself (`.tinkerman/features/*.md`) to avoid infinite loops.
5. THE hook SHALL NOT trigger on reads; only `Write|Edit` tools.
6. WHEN the Hook fires for a written path it cannot map to a Topic_Key (e.g., `.tinkerman/decisions/ADR-TEMPLATE.md` or an unrecognized filename pattern), it SHALL exit 0 silently without writing anything.
7. THE CLI SHALL support a new flag `--from-path <path>` that:
   - Accepts any file path under a Stage_Directory
   - Derives the Topic_Key using the inverse of Stage_File_Pattern (strip date prefix / ADR prefix / directory level)
   - Rebuilds the dossier for that single topic
   - Exits silently (not printing success message) to keep Hook output clean

### Requirement 5: Topic_Discovery 与命名漂移识别

**User Story:** As a contributor running `dossier:rebuild:all` on an existing repo, I want the tool to discover all active topics and flag potential naming drifts, so that no feature is orphaned and drifted names are visible.

#### Acceptance Criteria

1. THE `src/feature-dossier.ts` SHALL export `discoverTopics(forgeRoot: string): TopicDiscoveryResult` that:
   - Walks each Stage_Directory
   - Extracts candidate Topic_Key values by applying the inverse of Stage_File_Pattern to each file
   - Returns unique topics sorted alphabetically, plus a `drifts` list of candidate pairs flagged as potentially the same feature (see AC3)
2. THE discovery SHALL strip the following prefixes/suffixes when deriving Topic_Key:
   - `decisions/<YYYY-MM-DD>-` (8-char date prefix + separator)
   - `decisions/ADR-<NNNN>-` (ADR prefix)
   - `specs/` trailing `/spec.md` (use directory name as Topic_Key)
   - Other stages: remove `.md` extension
3. THE discovery SHALL flag a `drift` pair when two topics differ only by: (a) a trailing digit/suffix, (b) singular vs plural form, (c) one being a strict substring of the other, or (d) hyphen vs underscore. Drifts are advisory, not errors.
4. WHEN a `spec/<dir>/` directory exists but contains no `spec.md`, the directory name SHALL still be included as a topic candidate and flagged with `status: "spec-dir-empty"`.
5. THE discovery SHALL complete in ≤ 5 seconds on the current Forge repo (~ 29 plans, 8 specs, 40+ decisions).

### Requirement 6: 开放区语义与零冻结冲突

**User Story:** As a Forge maintainer, I want `.tinkerman/features/` and its dossier files to live in the open zone, so that the auto-rebuild Hook never gets blocked by frozen-file protection.

#### Acceptance Criteria

1. THE `src/conflict-classifier.ts` SHALL treat `.tinkerman/features/**` paths as **open zone** (same category as `.tinkerman/status.md`, `.tinkerman/findings/`).
2. THE `.tinkerman/features/` paths SHALL NOT appear in any frozen-zone pattern list (`check-frozen.ts`, `scripts/check-frozen.sh`, `templates/config.md`'s frozen examples).
3. THE `.tinkerman/features/` paths SHALL NOT appear in any guarded-zone pattern list (`src/zone-classification.md`-equivalent rules).
4. THE dossier frontmatter `auto_generated: true` SHALL serve as a soft signal (no machine enforcement) that AI agents avoid editing the file manually; agents SHALL be guided to run `npm run dossier:rebuild <topic>` instead.
5. WHEN a user manually deletes `.tinkerman/features/<topic>.md`, the next triggering Write/Edit on that topic's stage files SHALL regenerate it via the Hook.

### Requirement 7: 首次启用与安全回退

**User Story:** As a user on the commit introducing this feature, I want first-run bootstrap to succeed and failures to degrade gracefully, so that adopting this guard feels safe.

#### Acceptance Criteria

1. WHEN `.tinkerman/features/` does not exist, the CLI SHALL create it as a regular directory (no special permissions).
2. WHEN `scripts/rebuild-feature-dossier.mjs --all` is run for the first time on the current repo, it SHALL succeed (generate a dossier for each discovered topic) without touching any other file under `.tinkerman/`.
3. THE CLI SHALL skip a topic with a clear warning (stderr) rather than failing the whole `--all` run when:
   - A frontmatter file is unparseable (YAML syntax error)
   - A stage file is unreadable (permission error)
   - The discovered topic name contains characters invalid for a filename (shell injection protection)
4. THE Hook SHALL exit 0 with no output on any internal error (fail-silent), so users never see spurious red output in their chat history.
5. THE `.gitignore` recommendation in README.md SHALL note that `.tinkerman/features/` is safe to include in version control (sharing feature history across the team) OR to exclude (treating as local-only derived state); both options are supported.
6. A one-time migration script SHALL NOT be required — `dossier:rebuild:all` serves as both initialization and re-bootstrap.

### Requirement 8: 非功能需求

**User Story:** As a Forge maintainer, I want the dossier system to be fast, non-intrusive, and unit-tested.

#### Acceptance Criteria

1. PERFORMANCE: `buildDossier` (pure function) SHALL complete in ≤ 50ms for a topic with up to 7 stage files totaling ≤ 50KB of content.
2. PERFORMANCE: Single-topic Hook rebuild (scan + build + write) SHALL complete in ≤ 500ms on warm cache; Hook timeout SHALL be 5 seconds for safety margin.
3. PERFORMANCE: `--all` rebuild SHALL complete in ≤ 10 seconds on the current Forge repo.
4. DETERMINISM: `buildDossier` SHALL produce byte-identical output for identical inputs (the `generated_at` field is stamped at write time by the CLI, not by the pure function).
5. ZERO-NEW-RUNTIME-DEPS: The implementation SHALL rely only on existing devDependencies (TypeScript, Node built-ins, existing frontmatter utilities). No new npm packages.
6. UNIT-TESTED: `test/feature-dossier.test.ts` SHALL cover:
   - `buildDossier` happy path (all 7 stages present)
   - `buildDossier` partial stages (only specs + plans)
   - `buildDossier` missing frontmatter handling
   - `scanStagesForTopic` with various file pattern matches (date prefix, ADR prefix, spec subdir)
   - `discoverTopics` output sorting and drift detection
   - `--from-path` inverse-mapping for all 7 Stage_Directory patterns
7. PROPERTY-TESTED: `test/feature-dossier.property.test.ts` SHALL assert:
   - Round-trip: `discoverTopics` output is a superset of the Topic_Key derived from any stage file under `.tinkerman/`
   - Idempotence: `buildDossier(input) === buildDossier(input)` for all valid inputs
   - Escape safety: any input text containing `|`, `\n`, or `<` produces valid markdown (no broken tables or injected HTML)
8. DOCUMENTATION: `README.md` SHALL gain a short subsection under `.tinkerman/ 目录结构` pointing to `.tinkerman/features/` with one sentence on purpose.

### Requirement 9: 与 `/forge learn` 归档的集成（可选、低优先级）

**User Story:** As a user running `/forge learn` at the end of a feature, I want the dossier to be frozen into the archive as the feature's summary document, so that completed features have a permanent single-file retrospective.

#### Acceptance Criteria

1. WHEN `/forge learn` archives a topic to `.tinkerman/archive/<date>-<topic>/`, the archive SHALL include the topic's dossier as `archive/<date>-<topic>/dossier.md` (copy, not symlink).
2. THE archived dossier SHALL be regenerated immediately before archiving to capture the final state.
3. THE archived dossier's frontmatter SHALL add `archived: true` and `archived_at: <ISO-8601 timestamp>`.
4. THIS integration SHALL be implemented as a minimal addition to `src/learn.ts`'s archive logic, NOT as a new skill or command.
5. WHEN the topic has no live dossier at archive time (e.g., feature never went through any stage), the archive step SHALL skip silently without failing.

---

## Out of Scope (明确不做)

- **物理目录重组**：不把 `.tinkerman/specs/`、`.tinkerman/plans/` 等目录搬进 `.tinkerman/features/<topic>/` 下。所有 skill 的输出路径保持原样。
- **跨功能比较视图**：不提供"对比 feature A 和 feature B"的交互视图；单一 topic 索引已经覆盖 90% 回顾场景。
- **Web UI / HTML 渲染**：Dossier 只是 markdown。`/forge review --canvas` 已有独立的 HTML 可视化路径，不混用。
- **Git 历史整合**：不在 dossier 里嵌入 git log（避免 dossier 成为一个重量级聚合器；git 历史通过 `/forge recap` 按时间窗独立查看）。
- **自动重命名漂移 topic**：discoverTopics 只**标记**漂移，不自动改名。命名决策留给用户（避免误判）。
- **跨仓库 dossier**：只在当前 repo 的 `.tinkerman/` 下工作，不处理 worktree 之间的聚合。

## Dogfooding Baseline

本 spec 启用后，应立即对当前 Forge 仓库现有的约 30+ 个 topic（见 `.tinkerman/plans/` 文件列表）执行一次 `dossier:rebuild:all`，生成基线索引。后续通过 Hook 维持同步。

