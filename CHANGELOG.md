# Changelog

All notable changes to Forge will be documented in this file.

## Format Conventions

Entries follow [Keep a Changelog](https://keepachangelog.com/) with Forge-specific additions:

- **`[SECURITY]` prefix**: security fixes (including CVE / GHSA remediations) are tagged `[SECURITY]` in the `Fixed` section. Each `[SECURITY]` entry **must link at least one ADR** (`ADR-NNNN`) describing the root-cause analysis and remediation decision. See [SECURITY.md](SECURITY.md) for the record format.
- **ADR references**: architectural changes reference the driving ADR when one exists (`ADR-NNNN: <title>`).

## [Unreleased]

### Added

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
