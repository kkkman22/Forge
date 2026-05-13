# Changelog

All notable changes to Forge will be documented in this file.

## Format Conventions

Entries follow [Keep a Changelog](https://keepachangelog.com/) with Forge-specific additions:

- **`[SECURITY]` prefix**: security fixes (including CVE / GHSA remediations) are tagged `[SECURITY]` in the `Fixed` section. Each `[SECURITY]` entry **must link at least one ADR** (`ADR-NNNN`) describing the root-cause analysis and remediation decision. See [SECURITY.md](SECURITY.md) for the record format.
- **ADR references**: architectural changes reference the driving ADR when one exists (`ADR-NNNN: <title>`).

## [Unreleased]

### Added

- **Forge Slimming Plan (T1/T2/T3)** — delegate overlapping capabilities to Claude Code native commands
  - T1: teams/ cleanup verified, command count aligned to SST=22, archive audit script, v2.3 observability sync
  - T2: `/forge recap` delegates to `/compact`+`/context`; `/forge resume` delegates to `/resume`; `/forge abort` narrowed to archive+reset; `/forge learn` deduplicates with Auto_Memory; `/forge review` adds `--delegate-quality`/`--delegate-security` flags
  - T3: `forge-mutate` pack-conditional registration (requires `mutation_critical_modules` flag); gate skill boundary clarification; usage metrics pipeline for R14/R16 evaluation
  - New scripts: `audit-archive-candidates.mjs`, `metrics-recorder.mjs`, `aggregate-metrics.mjs`, `validate-gate-boundary.mjs`
  - `gen-plugin-commands.mjs` now supports `--verify-count` (CI) and `--stamp-count`
  - Forge Loop repositioned as "autonomous execution with engineering discipline"
  - Deviation record: SST=22 within 18-22 target, R14/R16 evaluations pending 14-day metrics
- **`/forge resume --from-pr`** — one-command recovery from a Pull Request. Accepts GitHub/GitLab/Bitbucket URLs or bare PR numbers. Auto-resolves the associated Forge spec slug from PR metadata (title prefix, branch name, description link, or ADR), loads the full context bundle (spec/plan/progress/reviews), and updates `.forge/status.md`. Requires Claude Code 2.1.29+ for CC session recovery; falls back to Forge-only state recovery on older versions. See `scripts/resume-from-pr.mjs` and `skills/forge-resume/SKILL.md` §5.
- **CI UltraReview 集成** — 每个 PR 自动触发 `claude ultrareview` AI 评审
  - 新增 `scripts/run-ci-ultrareview.sh` 封装 CLI 调用、JSON 解析、artifact 生成
  - 新增 `.github/workflows/ultrareview.yml` CI workflow（PR 触发、artifact 上传、PR 评论）
  - 新增 `templates/review-ci.md.tmpl` 标准化评审产物模板
  - `skills/forge-review/SKILL.md` 新增 CI 证据接入步骤和 `[confirmed-by-ci]` 前缀规则
  - `scripts/init.sh` 新增 CI AI 评审启用交互提示
  - 详见 `docs/ci-ultrareview-usage.md`
- **Plugin Distribution** — Forge 可通过 `claude plugin install forge` 安装，支持自动更新和版本锁定
  - 新增 `.claude-plugin/plugin.json` 和 `.claude-plugin/marketplace.json`
  - 新增 28 个 slash command wrappers（`commands/*.md`）
  - 新增 `scripts/gen-plugin-commands.mjs` 自动生成命令文件
  - 新增 `test/plugin-manifest.test.ts`（12 tests）
  - `scripts/build-dist.sh` 新增 `dist-plugin/` 输出
  - CI 新增 `plugin-validate` job
  - `/forge status` 新增 clone + plugin 冲突检测
  - README 新增方式三 Plugin 安装和迁移指南
  - 参见 `.kiro/specs/plugin-distribution/feasibility.md` Phase A 可行性报告
- **CCBP Hardening Phase 2** — compaction protection + agent frontmatter + dispatcher + rules + version gate
  - `[ADDED]` `scripts/hook-precompact.sh` + `scripts/hook-postcompact.sh` — compaction boundary state protection
  - `[ADDED]` `.claude/hooks/scripts/dispatcher.sh` — unified 6-event dispatcher
  - `[ADDED]` 3 lazy-loaded rules: `.claude/rules/forge-src.md`, `skill-editing.md`, `branch-protection.md`

### Changed

- **归档流程增加 CC transcripts 清理**（ADR: `.forge/decisions/2026-05-12-cc-purge-integration.md`）
  - 新增 `scripts/archive-spec.sh`：归档 spec/plan/progress 到 `.forge/archive/<date>-<slug>/` 并可选清理 Claude Code 项目状态
  - 支持 `--purge-cc=ask|skip|auto`（默认 ask，交互两次确认）
  - 生成 `purge-manifest.json` 记录 dry-run 预览、用户决策、执行结果
  - 安全保护：黑名单路径拒绝、worktree 路径解析、CC 版本检测降级
  - 需要 Claude Code >= 2.1.126（低版本自动跳过并 warning）
  - 47 项 bash 测试覆盖所有分支
- **CCBP Hardening Phase 2** — Hooks `if:` conditional filtering + agent frontmatter improvements
  - `[CHANGED]` hooks.json: added `if:` filters to 5 PreToolUse/PostToolUse entries to skip irrelevant tool calls
  - `[CHANGED]` agent frontmatter: forge-build gets `hooks: {Stop}` (CI allowlist) + `isolation: worktree`; forge-ship gets `hooks: {PreToolUse}` (branch protection); forge-plan gets `initialPrompt`
  - `[CHANGED]` CC minimum version bumped to 2.1.121 (recommended ≥2.1.138) — `scripts/init.sh` version gate
- **Structured Frozen-Zone Feedback** (ADR-0001: Frozen-Zone Protection — Migrate from Exit-Code Blocking to Structured JSON Feedback)
  - PreToolUse hook returns structured JSON diagnostic on frozen-zone violations
  - PostToolUse defence-in-depth hook detects breaches and emits warning
  - Zone_Registry reads from `.forge/config.md` at runtime
  - Audit logging to `.forge/runs/*-frozen-events.jsonl` with rotation
  - `/forge status` shows frozen-zone activity summary
  - Feature flag `FORGE_STRUCTURED_FROZEN=1` (default); set to `0` for legacy mode
  - Requires Claude Code 2.1.121+ for PostToolUse; PreToolUse works on 2.1.10+

### Fixed

- **Evolved Rules Integration & Retirement (2026-05-10 session)** — R1-R9 分类融入基础设施或留在 evolved-rules
  - R1-R4 退役到 `.forge/knowledge/solutions/evolved-rules-retired.md`（已永久融入 CLAUDE.md / SKILL.md / hooks）
  - R5 (Implicit Idle) 融入 `skills/shared/next-step-protocol.md` 新增"三种违规形态"表
  - R6 (Claimed New File Existence) + R7 (Pack/Loader Integration Evidence) + R8 (Stub Detection) 融入 `.claude/agents/spec-check.md` 新增 Check Items 3a/5/6 + 扩展 Severity Judgment 表
  - R7 对应的 Plan 任务模板融入 `skills/forge-plan/references/atomic-task-format.md` 新增"Pack Data Task Integration Test Requirement"章节
  - R9 (Lint 严格度分层) 固化到 `CONTRIBUTING.md` 新增"Lint Strictness Layering"章节
  - `.forge/knowledge/evolved-rules.md` 活跃规则由 9 条精简至 5 条（R5/R6/R7/R8/R9 重编号为 R1-R5），每条新增 `Infra_Ref` 字段指向落地位置

- **Legacy biome 存量清理 (2026-05-10 session)** — 全仓零 lint 告警
  - 修复 4 errors（format + import 排序）+ 116 warnings + 13 infos
  - 手工修复源码 9 处 `!` non-null assertion → null-check + early return
  - 手工修复测试 12 处 `as any` → `MirrorDaemonStartResult` discriminated union（新增 `test/cmux-mirror/types.ts`）
  - 手工修复 4 处其他 `any` → 精确类型或 `unknown` + narrowing
  - 修复 `test/cmux-mirror/cmux-json-schema.test.ts` non-null-asserted-optional-chain
  - 清理未使用类型定义 `Action` in `test/cmux-mirror/session-totality.property.test.ts`
  - `biome.json` test override 追加 `noNonNullAssertion: "off"`（测试代码语义等价于 `expect(...).toBeDefined()`）
  - README.md 指标同步：模块 126→134、测试文件 257→267、属性测试 129→132、总测试 4184→4691
  - 6 个 skill 标记 `skeleton_exempt_legacy: true`（forge-pack + 5 个 utility skill）
  - 3 个 skill description 重写满足 2 句 + 祈使动词首句规则（forge-mutate、forge-pack、forge-storm）

- **Sprint 3 Gap Remediation** — Fixes from 2026-05-10 audit
  - Merged `business-analyst.md` agent definition to main branch (Three Amigos collaboration now works)
  - Glossary parser now supports aggregated YAML format (PMS Pack glossary loads 111 terms)
  - `loadOwnershipMap` no longer a stub — reads `.forge/context-ownership.yaml` for real boundary checks
  - 3 new Bonvoy loyalty scenarios in `pms-marriott-sample` (NoShow forfeit, tier amenity, points+cash)
  - Lint rule form clarified via requirements amendment (YAML declarative, not Biome plugin)
  - Audit findings archived (`.forge/findings/` + `.forge/decisions/`)
  - Evolved rules R6/R7/R8 added for review blind-spot prevention

### Added

- **Evolved Rules Automation Infrastructure (补强 1/2/3)** — 规则演化模型闭环自动化
  - **补强 1 (Staleness Auto-Detection)**: `src/evolved-rules-staleness.ts` 纯函数 + `scripts/flag-stale-evolved-rules.mjs` CLI。扫描 `.forge/runs/` session 目录 mtime，对 >= 5 sessions 未触发的规则自动标记 `stale_flags` frontmatter。通过 Stop hook 每会话执行。
  - **补强 2 (Rule Violation Counter)**: `src/evolved-rules-violations.ts` 纯函数 + `scripts/record-evolved-rule-violation.mjs` CLI。扫描最近 24 小时内的 `.forge/runs/`、`.forge/progress/`、`.forge/reviews/` 内容，匹配 R1-R5 的 violation/guard 模式，自动更新 `Last_triggered` 字段。通过 Stop hook 每会话执行。
  - **补强 3 (Infra_Ref Back-Validation)**: `src/evolved-rules-infra-refs.ts` 纯函数 + `scripts/verify-evolved-rule-infra-refs.mjs` CLI。解析每条规则的 `Infra_Ref` 字段，验证引用的文件与 section 在主分支仍存在。纳入 `npm run check` 和 CI，基础设施损坏立即 fail。Dogfooding 时抓到 1 个真实 Infra_Ref 漂移（R1 的 "§规则 3" 应为 "§三种违规形态"）。
  - 37 个新单元测试全绿（13 staleness + 11 violation + 13 infra-refs）
  - 规则演化模型现闭环：观察 → evolved-rules → 自动触发计数 → 自动 staleness 标记 → 人工决策融入/退役 → Infra_Ref 自动守护

- **PMS Domain Pack v1.0** — Hotel PMS domain knowledge pack
  - 8 Bounded Contexts with context map (10 edges)
  - Context-specific glossary (9 files, 12+ terms each, Chinese aliases)
  - 4 state machine YAML definitions (reservation, folio, room-status, housekeeping-task)
  - 20 Gherkin scenarios across 5 categories (check-in, check-out, night-audit, reservation, folio)
  - Banned patterns for PMS (4 categories: code/infrastructure/framework/technical)
  - BusinessDayClock utility with DST support (32 tests, 3 timezones)
- **State Machine Engine** (`src/state-machine/`) — YAML loader, ST001-ST005 validator, property test derivation
- **Forced Acceptance Gate** (`src/accept-gate.ts`) — Pack-driven ship blocking for critical contexts
- **Mutation Testing Engine** (`src/mutate.ts`) — Stryker.js integration with pack-driven module targeting
- **Micro-Review Engine** (`src/build-micro-review.ts`) — Task-level spec alignment check after each atomic task
- **IRON-LAW / HARD-GATE XML tags** — Semantic markers for AI agent compliance
- **`scripts/check-iron-laws.sh`** — Uniqueness validation for iron law and hard gate names
- **Rationalization Catalog expansion** — 15+ entries in 5 categories in `tdd-rules.md`
- **`scripts/init.sh --pack`** flag — Enable domain packs during project initialization
- Sprint 2 zero-pack regression tests and PMS integration tests (24 new tests)
- R4 rule in `evolved-rules.md`: "SKILL Reload After Context Recovery" — requires
  re-reading the current phase SKILL.md after context compaction or session resume.
- `forge-resume` SKILL Reload Step: mandatory SKILL.md re-read after recovery for
  all phases (not just build).
- Compaction Recovery Check paragraphs in forge-ship, forge-review, forge-test,
  forge-learn SKILLs: self-check points for post-compaction execution.
- Stop hook (`persistent-loop.sh`) now covers 6 auto-advance scenarios:
  plan→build (Case 5), build→review (Case 6), review→test (Case 7),
  test→ship (Case 8), ship→learn (Case 9), and loop iteration handoff (Case 10).
  These detect phase completion via `.forge/` state and inject command-style
  instructions to resume the pipeline.
- `checkPlanStructure()` in `src/plan.ts`: evaluates plan structure for split
  trigger conditions (task count > 15, multiple Sprint headings, delivery task
  names, chained Sprint dependencies).
- Plan Structure Check integrated into `forge-plan` Self-Check (Step 4a) with
  acknowledge/split user interaction.
- R3 rule in `evolved-rules.md`: "Sprint Is Not Phase Boundary" — injected at
  every session start via SessionStart hook.
- Stop hook dedupe mechanism: 60s TTL prevents repeated injection on same
  phase state; stale markers (>24h) auto-cleaned.
- `scripts/lint-evolved-rules.mjs`: validates `rule_count` frontmatter matches
  actual rule heading count.

- **ADR Registry** (Requirement 1): canonical `.forge/decisions/ADR-NNNN-*.md` records with `/forge decide` auto-numbering via `nextAdrId`, auto-updated `.forge/knowledge/adr-index.md`, supersession tracking, and related-ADR matching via Jaccard similarity. Template at `.forge/decisions/ADR-TEMPLATE.md`.
- **Security posture documentation** (Requirement 6):
  - README "🛡️ 安全与信任" section listing the 5-layer defense model.
  - `SECURITY.md` with private disclosure channels, SLA (≤3 days acknowledgement / ≤14 days critical fix), supported versions and `[SECURITY]` entry format.
  - CI `security-audit` job running `npm audit --audit-level=high` and `scripts/check-deps.mjs` on every PR, plus a nightly cron on `main`.
  - `scripts/check-deps.mjs` scanner: typosquatting allowlist, exact-version pin enforcement for runtime deps, license compatibility check.
  - `CONTRIBUTING.md` "安全贡献指南" section covering secret/PII handling, shell command construction, dependency review checklist, and ADR-required files.

### Changed

- **Runtime dependency pinning**: `minimatch` pinned to exact version (`10.2.5`) per supply-chain policy. Open ranges no longer allowed for any entry under `dependencies`.
- **Protected zone rules** (`.forge/config.md`): `.forge/decisions/ADR-*.md` moved to Guarded zone (append-only; supersession re-renders frontmatter). Non-ADR decision transcripts (`.forge/decisions/[0-9]*.md`) remain Open zone.

## [2.3.0] - 2026-04-28

### Added

- **Spec 导入模式**：`/forge spec <file-path>` 支持从外部规格文档导入并转化为 Forge 格式
  - 开发者可将产品经理交付的 spec 文档放入 `.forge/inbox/`，通过 `/forge spec .forge/inbox/xxx.md` 导入
  - 导入后自动执行转化 → Review（五项自检）→ Lock 流程，复用现有规格引擎的全部质量保障
  - 转化规则：提取目的/需求/场景/不做什么/Delta，将验收标准适配为"当...则..."格式，自动去除实现细节
  - `SpecFrontmatter` 新增 `importSource` 字段记录原始文件路径，便于追溯
  - 新增 4 个导入边界情况处理：文件不存在、无法提取需求、原文包含实现细节、与已有 spec 冲突
- **`.forge/inbox/` 目录**：外部规格暂存区，开发者放置 PM 交付的 spec 文档供导入使用
- **`createImportedSpec()` 纯函数**：`src/spec.ts` 新增导入模式创建函数，支持 forge-loop 自主执行引擎调用
- **Property 8 测试**：`test/spec.property.test.ts` 新增 5 个属性测试覆盖导入模式的 draft 状态、brownfield Delta 兼容性、confirm/reject 兼容性和 testability 兼容性

### Changed

- `templates/config.md` 开放区新增 `.forge/inbox/` 目录说明

## [2.2.0] - 2026-04-26

### Added

- **npm 公开发布支持**：`forge-loop` 现可通过 `npx forge-loop "目标"` 一行命令使用，无需克隆仓库手动编译
  - `package.json` 配置 `files: ["dist/src/"]`，仅发布编译后的运行时源码
  - 包名从 `forge` 改为 `forge-loop`，与 CLI 命令名一致
  - `private` 设为 `false`，允许 npm 公开发布
- **CI npm publish job**：`.github/workflows/ci.yml` 新增独立 `publish` job，Git tag `v*` push 时自动发布
  - 发布前执行完整的 typecheck → test → tsc 编译流水线
  - 使用 `NPM_TOKEN` secret 认证 npm registry
- **parseListSection 正则特殊字符 property-based 测试**：
  - Property 1：regex special character round-trip（`formatListSection` → `parseListSection` 往返一致性，200 次迭代）
  - Property 2：non-matching title with special characters returns empty array（200 次迭代）

### Fixed

- **`parseListSection` 正则转义替换字符串**：`String.prototype.replace` 的替换字符串从错误的 UUID 值修正为标准的 `"\\$&"` 反向引用模式，修复含正则特殊字符（`(`, `)`, `[`, `]`, `+`, `*` 等）的 section title 无法正确解析的问题

## [2.1.1] - 2026-04-26

### Changed

- **CI Actions 升级至 Node.js 24 运行时**：`actions/checkout` v4→v5、`actions/setup-node` v4→v6，消除 GitHub Actions Node.js 20 弃用警告
- **CI 构建 Node.js 版本升级**：20→22（当前 LTS）
- **README 新增 Forge Loop 章节**：完整介绍自主执行引擎的架构、工作流程、安全机制和 CLI 用法；更新 `src/` 目录结构，列出所有 Loop 相关模块
- **文档审计与修正**：
  - README：属性测试文件数 32→36、覆盖率数据更新为实际值（90.47% statements / 92.16% branches / 98.72% functions）
  - README：scripts/ 列表补全 `auto-resume.sh` 和 `persistent-loop.sh`；src/ 列表补全 `check-frozen.ts` 和 `loop-index.ts`
  - README：冻结文件保护说明修正为调用 `check-frozen.js`（非 `.sh`）
  - ROADMAP：v2.1 已完成列表补充 Forge Loop、回滚安全网、权限绕过文档化；v2.2 移除已完成项

### Fixed

- **Shellcheck 合规**：修复 4 个脚本共 7 处 shellcheck 警告
  - `auto-resume.sh` / `persistent-loop.sh`：`ls -t *.md` 替换为 `find + xargs ls -t`（SC2012）
  - `init.sh`：移除多余 `echo` 包裹（SC2005）；`A && B || C` 重写为 `if/then/else`（SC2015）
  - `install-dist.sh`：`${f#${BUNDLE_DIR}/}` 内层变量加引号（SC2295）

## [2.1.0] - 2026-04-26

### Added

- **Restatement Checkpoint 机制**：build 阶段新增周期性上下文刷新，对抗长任务中的注意力衰减
  - 可配置的 `restatement_interval`（默认 3，范围 2–10），每 N 个任务触发一次 Checkpoint
  - 异常触发：Subagent 返回 BLOCKED/NEEDS_CONTEXT/DONE_WITH_CONCERNS 时立即执行
  - 中间会话日志（`sessions/*-interim.md`）支持 `/forge resume` 精确恢复
  - 失败重试 Restatement：TDD GREEN 阶段失败时，重试前强制重申上下文，防止机械重复
  - 轻量路径完全排除 Restatement（改动足够小，无注意力衰减风险）
- **CI 验证范围扩展**：新增 shellcheck 静态分析、`hooks.json` JSON schema 验证、`SKILL.md` frontmatter 完整性检查
- **`install-dist.sh` 路径安全校验**：拒绝空路径和危险系统路径（`/`、`$HOME`、`/usr` 等），防止误操作
- **`init.sh` 增强**：新增 `handoffs/` 目录创建；从模板复制 `metrics.md` 和 `tool-health.md`；hooks 合并失败时提供详细的手动操作指引
- **`state.ts` 受保护区写入提示**：`checkWritePermission` 对 guarded zone 返回追加操作提示，而非静默放行
- **CLAUDE.md 模板新增 §2.5 上下文刷新纪律**：将 Restatement 规则写入项目宪法
- **`config.md` 模板新增 `restatement_interval` 配置项**

### Changed

- **`check-frozen.sh` 重写为 TypeScript 优先**：shell 脚本改为 thin wrapper，优先调用编译后的 `check-frozen.js`；fallback 保留原有 shell 解析逻辑
- **冻结文件保护改为硬阻断**：`check-frozen.sh` 对 locked/approved 文件以 `exit 1` 阻断写入（原先仅打印警告）
- **Hooks 升级**：Write/Edit hook 从 shell 脚本切换到 Node.js 调用；新增 Bash 工具的冻结文件保护 hook
- **CI `sync-dist` 改为 `verify-dist`**：不再自动提交 dist 变更，改为校验失败时报错，要求开发者本地构建后提交
- **`/forge resume` 增强**：优先读取 `*-interim.md` 中间日志恢复上下文；恢复后首次派发 Subagent 前立即执行 Restatement Checkpoint
- **`forge-build` 流程图更新**：标准路径和全量路径流程图增加 Restatement 循环和异常触发分支

### Fixed

- `install-dist.sh` 修复 `--target ""` 空路径导致的潜在危险操作

## [2.0.1] - 2026-04-24

### Changed

- **Agent frontmatter 全部使用 `model: inherit`**：移除硬编码的 `haiku`/`sonnet`，改为继承会话模型，兼容所有 coding plan（官方、Bedrock、Vertex、API key）
- **移除 Codex 平台支持**：Forge 专注于 Claude Code 单平台，移除 `dist/codex/`、install 脚本中的 codex 选项、README 中的 Codex 引用
- `install-dist.sh` 简化为无需 `--platform` 参数（保留向后兼容，传 `--platform claude-code` 仍可工作）

### Removed

- `dist/codex/` 目录及相关构建逻辑
- README 中所有 Codex 相关的安装说明和前置条件

## [2.0.0] - 2026-04-24

### Added

- **分发模型**：新增 `dist/` 目录结构，支持 Claude Code 分发包
  - `scripts/build-dist.sh`：从源定义构建平台适配的分发包
  - `scripts/install-dist.sh`：支持 `--platform`、`--dry-run`、`--backup` 的安装脚本
  - 每个分发包含平台特定的 `INSTALL.md`
- **已知失败模式**（`known-failures.md`）：记录反复出现的失败模式，供 `/forge debug` Phase 2 自动搜索和 `/forge build` 探针阶段回流
- **会话日志**（`sessions/`）：每次 `/forge learn` 写入简洁的会话摘要，供 `/forge resume` 恢复上下文
- **项目类型路由**：`classifyTask` 新增可选的 `ProjectContext` 参数，brownfield 项目触碰现有模块时 light 自动提升为 standard
- **知识库验证脚本**（`scripts/validate-knowledge.sh`）：5 项健康检查（文档数量、低置信度、frontmatter 完整性、known-failures 存在性、sessions 日志）
- **`/forge abort` 命令**：安全中止当前任务，归档状态到 `.forge/archive/`，重置 `status.md`

### Changed

- 前置条件从"仅 Claude Code"扩展为"Claude Code 或 Codex"
- 安装方式新增分发包安装路径（推荐），保留直接克隆方式（开发者）
- `.forge/knowledge/` 目录结构扩展：新增 `known-failures.md` 和 `sessions/` 子目录
- 状态文件保护分区：`known-failures.md` 加入受保护区（可追加，不可删除）
- `/forge debug` Phase 2 新增已知失败模式搜索步骤
- `/forge learn` 新增 §8.5（已知失败模式记录）和 §8.6（会话日志）

## [1.1.0] - 2026-04-24

### Added

- **`src/review.ts`**：评审引擎核心逻辑（置信度过滤、去重合并、跨评审者一致性提升、报告质量门 6 项检查）
- **`src/debug.ts`**：调试引擎核心逻辑（假设验证升级、假设完整性校验、四阶段状态机）
- **`test/review.property.test.ts`**：19 个 PBT 测试
- **`test/debug.property.test.ts`**：19 个 PBT 测试

### Fixed

- `generateKnowledgeDocument` 新增 `sanitizeDate` 日期 round-trip 验证，非法日期 fallback 到 `1970-01-01`
- `package.json` 依赖版本从 `^` 范围锁定为精确版本

## [1.0.0] - 2026-04-24

### Added

- 初始发布
- 13 个命令覆盖完整开发生命周期（router、decide、spec、plan、build、review、test、ship、learn、status、resume、debug、abort）
- 三级路由自动匹配任务复杂度（light / standard / full）
- 统一状态目录 `.forge/`，含文件保护分区（冻结 / 受保护 / 开放）
- 7 个 Subagent 角色 + 2 个 Agent Team 配置
- 4 个 Claude Code Hooks
- 交互式项目初始化脚本 `scripts/init.sh`
- 10 个 src/ 纯函数模块 + 133 个 PBT 测试
- CI：TypeCheck + Lint + Test 三重门禁
