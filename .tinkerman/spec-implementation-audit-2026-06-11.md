# Spec 实现情况复核报告

> **复核日期**：2026-06-11
> **复核范围**：`.tinkerman/specs/` 下所有 spec（排除 `_archived/`）
> **复核方法**：逐 spec 读取 `requirements.md` 提取**具体可检查交付物**（文件路径/命令/配置键/hook 事件/函数名），再到代码中独立验证是否真实存在——**不采信** `tasks.md` 勾选状态、**不采信** `requirements.md` frontmatter 自报的 `status: completed`、**不采信** `scripts/rebuild-spec-index.mjs` 生成的 `INDEX.md`。
> **结论口径**：`IMPLEMENTED` = 核心交付物均有代码证据；`PARTIAL` = 部分交付物缺失（标注缺口）；`NOT-IMPLEMENTED` = 核心功能在代码中不存在（仅 spec 文档）；`SUPERSEDED` = 被其他 spec 取代。

---

## 0. 执行摘要

| 裁定 | 数量 | 占比（112 个实质 spec） |
|------|------|------|
| ✅ **IMPLEMENTED**（已真实实现） | **79** | 70.5% |
| 🟡 **PARTIAL**（部分实现，有缺口） | **31** | 27.7% |
| ❌ **NOT-IMPLEMENTED**（未实现） | **1** | 0.9% |
| 🔁 **SUPERSEDED**（已被取代） | **1** | 0.9% |
| 📦 **多部分借鉴包**（概念已由其他 spec 落地） | **1**（gsd-core-adoption） | — |
| **合计非 archived 目录** | **113** | — |

**核心结论**：

1. **绝大多数 spec（70.5%）在代码中被真实实现**，且实现质量普遍较高（大量配有单元测试 + property-based 测试）。
2. **所有 113 个 spec 的 frontmatter 都自报 `status: completed`，但这是不实的**：实际有 **32 个 spec 存在程度不等的未实现/部分实现**（1 个完全未实现 + 31 个部分实现）。这是本复核最重要的发现——**项目元数据系统性高估了完成度**。
3. **完全未实现的只有 1 个**：`multi-platform-support`（AgentRegistry/AgentAdapter 多平台抽象层从未构建）。
4. PARTIAL 中约 **9 个为"实质性缺口"**（核心机制缺失或被简化替代），其余约 22 个为"轻微缺口"（≥85% 已完成，仅个别文件/小节/尺寸目标未达）。

### ⚠️ 复核方法论的重要发现（可信度声明）

复核过程中发现**两类系统性误差**，已在结论中校正：

- **首轮 batch 父 agent 产生多次"假阴性"**：浅层 grep 后误报"不存在"。经亲自 `grep` 核实，以下 4 个 spec 被错误判定，已纠正：
  - `claude-2-1-169-inspired-hardening`：父 agent 报 NOT-IMPLEMENTED（"zero hits"）→ 实测 `FORGE_DIAGNOSTIC_MODE`、`2.1.169` 文档、`contextWindowTokens` **均存在** → 实为 **IMPLEMENTED**。
  - `community-ecosystem`：父 agent 报 NOT-IMPLEMENTED → 实测 `examples/{node-api,react-todo}/`、`src/skill-loader.ts`(SkillManifest)、issue 模板 **均存在** → 实为 **PARTIAL**。
  - `ce-inspired-review-enhancement`：父 agent 报"多数未实现" → 实测 `validation-pass.md` agent、`src/review/core.ts` cross-validation、autofix_class、compact-safe **均存在** → 实为 **IMPLEMENTED**。
  - `forge-gate-shared-protocol`：agent 报"引用的 gate-protocol.md 不存在" → 实测 `skills/shared/gate-protocol.md` **存在**且被 decide/spec 引用 → 实为 **IMPLEMENTED**。
- **per-spec 子 agent 偶尔"过度解读 design.md"**：把 design.md 里的计划函数名当作缺失项（如 `branch-lifecycle-enforcement` 被报缺失 3 个函数，实测这些名字不在 requirements.md 中，核心门禁+测试齐全）→ 维持 **IMPLEMENTED**。

凡涉及上述冲突的裁定，本报告以**亲自 grep 核实的结果**为准（标注 `已实证`）。

---

## 1. 需要优先关注的 spec（未实现 / 实质性缺口）

### 1.1 ❌ NOT-IMPLEMENTED（1 个）

#### `multi-platform-support` — 未实现 ｜ 已实证 ｜ HIGH
- **spec 描述**：引入 `AgentRegistry` / `AgentAdapter` / `AgentProtocol` 抽象层，支持 Claude/Mock/OpenAI 等多 AI 平台，CLI 提供 `--agent <name>`。
- **代码现实**：`grep AgentRegistry|AgentAdapter|AgentProtocol src/` **零命中**；无 `--agent` CLI 选项；无非 Claude 适配器。`src/subagent-runner.ts` 是 Claude SDK 专用编排，非平台抽象。
- **结论**：该架构**从未构建**。spec 描述的多平台能力在代码中不存在。

### 1.2 🔁 SUPERSEDED（1 个）

#### `token-budget-compression` — 已被取代 ｜ HIGH
- spec 目标路径 `skills/forge-spec/SKILL.md` 等已不存在——被 `forge-single-entry-skills-collapse` 重构为 `skills/forge/lib/*/instructions.md` 单入口结构。压缩目标（CLAUDE.md ≤9.5K）已通过该重构达成（实测 9.4K）。

### 1.3 🟡 PARTIAL — 实质性缺口（核心机制缺失或被简化，约 10 个）

| spec | 已实现部分 | 关键缺口 |
|------|-----------|---------|
| **`audit-remediation-v221`** | `escapeRegExp`(frontmatter.ts)、`FrozenZoneViolation` | spec 针对 `src/sdk-driver.ts`/`orchestrator.ts`/`failure-handler.ts`/`effect-executor.ts`/`run-manager.ts` 架构——**这些文件全部不存在**（已实证）。25 项中仅 2-3 项落地，其余随计划架构一起未建。 |
| **`workflows-integration`** | dispatcher/stream-adapter/audit-writer/ipc-emitter 等 skeleton | 仅骨架；tasks.md 自述 **82 条验收标准中 41 条推迟**到未来 spec；`cli-subprocess-driver.ts`/`sdk-agent-adapter.ts` **不存在**（已实证）；无真实 bp() 接线、无 429 降级、无 stuck-timeout。 |
| **`forge-slimming-plan`** | T1 清理 + T2 委托适配器（recap/resume/abort/learn）+ deprecation 机制 | T3 技能搬迁**基本未做**：31 项仅 13 项完成（42%）；技能数量未降到 ~20（lib 下仍 37 子目录）；缺少合并评估/边界澄清报告。 |
| **`v2.4-review-followups`** | orphan-detector(execFileSync)、inject-plan-context.mjs | hook fail-closed 的 `validateHooksPresence` **零调用**未接线；forge-loop 5 条 E2E 路径**全缺**；`src/internal/` 不存在；branches 覆盖 79%（目标 85%）；15+ 文件仍有未豁免 `console.*`；`check-skill-function-refs` 未带 `--strict`。 |
| **`context-explosion-defense`** | `forge_read_cached` MCP 工具、Read Dedup Iron Law、track-read-budget.mjs | track-read-budget.mjs **未注册为 hook**（已标 `@deprecated`）；阶段边界 60%/80% 强制清退机制缺失；subagent 文件式返回缺失。 |
| **`phase-advance-hardening`** | Plan Structure Check、stop-additional-context.mjs 通用启发式 | **核心机制缺失**：spec 要求的 `persistent-loop.sh` Cases 5-10（带去重的确定性阶段推进）——脚本已删除，被简单启发式替代；R3 规则内容错；`glm-summary-ending.md` 不存在。 |
| **`sandbox-execution`** | `sandbox-profile.ts`(V1/V2+`toSdkSandboxSettings`)、`frozen-zone-hook.ts`(programmatic) | **未发现 `SdkAgentAdapter` 把 sandbox 配置真正传入 SDK `Options.sandbox`**；旧 `check-sandbox` shell hook 未废弃；`bypassPermissions→acceptEdits` 迁移未见。 |
| **`sandbox-phased-implementation`** | `sandbox-phased.ts` 纯函数 + 测试齐全 | `forge init` 不生成 `.tinkerman/sandbox.json`；无 `--sandbox <profile>` CLI；零 SKILL 引用 sandbox 检查点。 |
| **`i18n-support`** | i18n 引擎、locale-detector、config-store、locales/{en,zh}.json | 框架在但**未接入运行时**：无 CLI `--lang`、无 `SKILL.{locale}.md`、核心文件硬编码字符串未替换为 `t()`。 |

> 此外 `community-ecosystem`、`engineering-governance-hardening`、`execution-package-context-control`、`plugin-distribution`、`process-lifecycle-management`、`pms-pack-v1`、`remaining-backlog` 也属中等缺口，详见 §3。

---

## 2. 完整裁定总表（113 项，按字母序）

> 置信度：HIGH = 关键交付物已 `grep`/读源码确认；MEDIUM = 部分依赖 agent 报告未逐一复核。`已实证` = 亲自核实过文件存在性。

| # | spec | 裁定 | 置信 | 一句话证据 / 缺口 |
|---|------|------|------|----------------|
| 1 | agent-description-cso | 🟡 PARTIAL | HIGH | 18/21 agent 用 "Use when"；3 个 review agent 仍是角色描述 |
| 2 | agent-frontmatter-hardening | ✅ IMPL | HIGH | disallowed-tools / memory / initialPrompt / effort 均已加 |
| 3 | agent-team-migration | ✅ IMPL | HIGH | `runSubagentsWithConcurrency` + decide dispatch_mode + teams/ 已移除 |
| 4 | architect-design-it-twice | ✅ IMPL | HIGH | architect.md / forge-decide-arch.md 含 Design It Twice + 术语表 |
| 5 | archive-transcript-purge | ✅ IMPL | HIGH | `archive-spec.sh` 含 --purge-cc/blacklist/manifest + ADR |
| 6 | audit-remediate-0608 | 🟡 PARTIAL | HIGH | REQ-01/02/03/05/06 已编码；REQ-04 分支覆盖未运行时校验 |
| 7 | audit-remediate-p0p1 | ✅ IMPL | HIGH | 10/10 全部落地（DANGEROUS_SCRIPT_PATTERNS、allowlist、dist-sync、CI 依赖等） |
| 8 | audit-remediation-v221 | 🟡 PARTIAL | HIGH | **已实证** sdk-driver/orchestrator/effect-executor 全不存在；25 项仅 2-3 项落地 |
| 9 | branch-lifecycle-enforcement | ✅ IMPL | HIGH | **已实证** branch-gate.ts 核心门禁+unshipped 检测+测试齐全 |
| 10 | build-discipline-enhancement | ✅ IMPL | HIGH | tdd-rules §14 / change-summary / 依赖纪律 / CLAUDE.md 各节齐 |
| 11 | build-goal-replace-loop | ✅ IMPL | HIGH | /goal 模式 + build.use_goal + CI SANDBOX_FAIL_IF_UNAVAILABLE + persistent-loop.sh 已删 |
| 12 | build-subagent-protocol | ✅ IMPL | HIGH | 4 状态码/escalation/Self-Review/TDD Red Flags 在 forge-build.md |
| 13 | ccbp-hardening-phase2 | ✅ IMPL | HIGH | 7 个 if 过滤 + PreCompact/PostCompact + worktree 隔离 + 版本检查 |
| 14 | ccbp-inspired-hardening | 🟡 PARTIAL | MED | 4 agent + dispatcher + 规则齐；缺 Execution Contract 段、settings.local.json.example（父子 agent 说法不一） |
| 15 | ce-inspired-review-enhancement | ✅ IMPL | HIGH | **已实证** validation-pass agent + cross-validation(src/review/core.ts) + autofix + compact-safe |
| 16 | ci-check-integration | ✅ IMPL | HIGH | ci_check_command 贯穿 build/test/ship + init + 反模式记录 |
| 17 | claude-2-1-169-inspired-hardening | ✅ IMPL | HIGH | **已实证** FORGE_DIAGNOSTIC_MODE + 2.1.169 文档 + contextWindowTokens + 元数据持久化 |
| 18 | claude-md-self-evolution | ✅ IMPL | HIGH | 模板/CLAUDE.md §6/learn 蒸馏/SessionStart 注入/陈旧检测齐；Stop hook 为空（次要） |
| 19 | cmux-integration | ✅ IMPL | HIGH | Mirror_Daemon/Sync_Once/Cmux_Adapter/Events_NDJSON(event-writer.ts)/i18n/property 测试 |
| 20 | cmux-skills-collapse | ✅ IMPL | HIGH | 3 cmux skill 已折叠 + 旧目录删 + Conditional_Availability_Gate |
| 21 | community-ecosystem | 🟡 PARTIAL | HIGH | **已实证** CONTRIBUTING/issue 模板/examples/skill-loader 齐；缺 `forge skill install` 命令 + SKILL i18n |
| 22 | configchange-hook | ✅ IMPL | HIGH | **已实证（复核纠正）** hooks/hooks.json:408-420 注册 ConfigChange hook（partial-spec-backlog-remediation REQ-01 落地）；audit 误检 plugin.json/settings.json |
| 23 | context-aware-domain-knowledge | ✅ IMPL | HIGH | glossary.md 避免/关系/歧义 + grill 实时维护 + 4 型冲突联合 |
| 24 | context-explosion-defense | 🟡 PARTIAL | HIGH | forge_read_cached + Iron Law 齐；track-read-budget.mjs **未接 hook** |
| 25 | context-optimization | ✅ IMPL | HIGH | MCP server(4 工具) + run-with-trim.sh |
| 26 | cursor-team-kit-integration | ✅ IMPL | HIGH | **已实证（复核纠正）** 5 skill 全在 skills/forge/lib/{verify,recap,control-cli,control-ui,fix-conflicts}/instructions.md；audit 误用 pre-collapse 路径 |
| 27 | ddd-tactical-bdd-collaboration | ✅ IMPL | HIGH | 6 核心模块 + storm.ts + DDD 模板 + pack lint + context-boundary hook |
| 28 | debugger-six-phase-diagnosis | ✅ IMPL | HIGH | debugger.md 6 阶段协议 + iron gate + cleanup/post-mortem |
| 29 | decide-auto-dispatch | ✅ IMPL | HIGH | auto/inline/agents 模式 + config 默认 auto + agents-dispatcher.ts |
| 30 | decide-spec-divergent-thinking | ✅ IMPL | HIGH | gate-protocol.md Reframing/Clarification Gate + learn 回流 |
| 31 | dist-sync-guard | ✅ IMPL | HIGH | check-dist-sync.mjs + dist-resync.sh + CI + evolved-rules R6 |
| 32 | docs-governance-system | ✅ IMPL | HIGH | 14 个 TS 模块 + 5 检查脚本 + SSOT + INDEX 自动生成 |
| 33 | documentation-onboarding | ✅ IMPL | HIGH | 快速开始 + 3 引导路径 + 4 工作流示例 + 68 个 .en.md |
| 34 | engineering-governance-hardening | 🟡 PARTIAL | HIGH | ADR/Zod/benchmark/prompt-defense/SECURITY 齐；**Event Sourcing(Req3) 全缺** |
| 35 | error-recovery-strategy | ✅ IMPL | HIGH | src/error-recovery/ 8 模块（~1200 行）：scanner/detector/classifier/reconciler/engine/serde |
| 36 | evidence-chain-replay | ✅ IMPL | HIGH | src/replay.ts + replay instructions（时间线+证据链+缺失阶段） |
| 37 | execution-package-context-control | 🟡 PARTIAL | MED | plan.ts 权重/task-graph/schema 齐；缺 review/ship 门禁包检查、AskUserQuestion 接线 |
| 38 | feature-dossier-index | ✅ IMPL | HIGH | feature-dossier.ts + rebuild 脚本 + PostToolUse hook + 30+ dossier + 93 测试 |
| 39 | forge-decide-agent-teams | 🟡 PARTIAL | MED | 6 agent 定义 + PoC 脚本齐；缺 skills/forge-decide-teams/SKILL.md + PoC 报告 |
| 40 | forge-gate-shared-protocol | ✅ IMPL | HIGH | **已实证** skills/shared/gate-protocol.md 存在且被 decide/spec 引用 |
| 41 | forge-init-env-optimization | ✅ IMPL | HIGH | init.sh 写 4 环境变量 + alwaysLoad + 摘要表 |
| 42 | forge-learn-reframing-integration | ✅ IMPL | HIGH | learn instructions 扫 gate 日志 + evolved-rule 提议 + gate-stats.md |
| 43 | forge-loop-native-fusion | ✅ IMPL | HIGH | 旧 CLI/测试已删；loop skill(180 行) + ScheduleWakeup/CronCreate + src/loop/ |
| 44 | forge-resume-from-pr | 🟡 PARTIAL | HIGH | resume-from-pr.mjs 完整+测试；**CLI `--from-pr` 解析缺失**（只能直跑脚本） |
| 45 | forge-review-diff-context-fidelity | ✅ IMPL | HIGH | prepare-diff-context.mjs(186 行) + contract 测试 + PBT |
| 46 | forge-review-fix-optimization | 🟡 PARTIAL | HIGH | 10+ TS 模块(context-budget/incremental-verifier/fix-checklist/quality-gate/scheduler)齐；缺预算报告、review SKILL 的 Review_Summarizer、单测 |
| 47 | forge-single-entry-skills-collapse | ✅ IMPL | HIGH | 单 SKILL 注册 + 36 子折叠 + dispatcher 10 步 + 10 安全控制 + manifest |
| 48 | forge-slimming-followups | 🟡 PARTIAL | HIGH | slimming-migration.md + smoke-channels.yml + --verify-count 齐；CHANGELOG "28" 未替换、docs drift 检查不全 |
| 49 | forge-slimming-plan | 🟡 PARTIAL | HIGH | T1/T2 大部分齐；**T3 基本未做**（31 项仅 13 项=42%） |
| 50 | frozen-zone-structured-feedback | 🟡 PARTIAL | HIGH | 结构化 JSON/PostToolUse 脚本/审计日志/zone registry 齐(~90%)；**hooks.json 未注册 PostToolUse** |
| 51 | grill-integration-in-decide | ✅ IMPL | HIGH | Round 0 Proactive Grill + Round 2a 增强触发 + product.md 规则 6/7 |
| 52 | gsd-core-adoption | 📦 多部分包 | HIGH | 8 子概念(prompt-defense/context-budget/file-locking/verify/debugger 等)**已由专用 spec 落地**；bundle 自身为 draft 调研文档 |
| 53 | hook-system-enhancement | ✅ IMPL | HIGH | 5 新 hook 脚本 + 3 Stop 拆分 + terminalSequence + duration_ms 追踪 |
| 54 | i18n-support | 🟡 PARTIAL | HIGH | 引擎/detector/config-store/翻译齐；**未接运行时**（无 --lang、无 SKILL locale、硬编码未替换） |
| 55 | immutable-evidence-artifacts | ✅ IMPL | HIGH | evidence-artifact.ts(8/8)：schema/writer/不可变/freshness/MCP 工具/supersedes |
| 56 | knowledge-tdd-methodology | ✅ IMPL | HIGH | learn RED/GREEN/REFACTOR 流 + skill-feedback.md + evolved-rules Verified_via 字段 |
| 57 | local-ci-parity | ✅ IMPL | HIGH | detectCiCommandDrift + .githooks/pre-push + test skill Layer3 + known-failures |
| 58 | loop-skills-fusion | ✅ IMPL | HIGH | quality-gate.ts/skill-scheduler.ts/sdk-status-helpers.ts(均注 loop-skills-fusion) + autonomous 模式 |
| 59 | misc-forge-optimization | 🟡 PARTIAL | HIGH | R1/R3 ADR + R6 EnterWorktree 齐；缺 bgIsolation/sparsePaths/SIMPLE(init)、!(README)、--bare 注释 |
| 60 | missions-inspired-rigor | ✅ IMPL | HIGH | contract-validator/handoff-schema/known-failures/events-cursor/resume 全配测试 |
| 61 | multi-platform-support | ❌ NOT-IMPL | HIGH | **已实证** 无 AgentRegistry/Adapter/Protocol、无 --agent、无非 Claude 适配器 |
| 62 | mutation-gate-rollout | ✅ IMPL | HIGH | mutate.ts + pack feature_flags + ship-gates 集成 + stryker 依赖 |
| 63 | output-bloat-control | ✅ IMPL | HIGH | agent model 字段(haiku/sonnet/inherit) + CLAUDE.md §2.6 + 800 token + opusplan 文档 |
| 64 | output-conciseness | ✅ IMPL | HIGH | CLAUDE.md §2.6(根+模板) + build references |
| 65 | oz-skills-inspiration | ✅ IMPL | HIGH | 6/6：imperatives/skeleton/style-guide/black-box scripts/frontend-check/accept |
| 66 | pack-system | ✅ IMPL | HIGH | src/pack/+context/+glossary/spec-leak-detector/scenario-linter 12 项 + 测试 |
| 67 | parallel-status-tracking | ✅ IMPL | HIGH | status-resolver.ts/status-manager.ts 全函数 + 多任务 .tinkerman/status/ |
| 68 | partial-spec-backlog-remediation | ✅ IMPL | HIGH | 6 hook 注册 + cleanup-chain 超时 + superseded 文档 + 测试 |
| 69 | phase-advance-hardening | 🟡 PARTIAL | HIGH | Plan Structure Check 齐；**核心 persistent-loop Cases 5-10 缺失**（脚本已删，被简单启发式替代） |
| 70 | plan-document-streamlining | ✅ IMPL | HIGH | lightweight/full 路由 + 2 reference 文档 + format frontmatter |
| 71 | plan-no-placeholders | ✅ IMPL | HIGH | No-Placeholders 铁律 + 黑名单表 + Placeholder Scan + Zero Context |
| 72 | plan-vertical-slice-hitl-afk | ✅ IMPL | HIGH | Vertical Slice 约束 + HITL/AFK 表 + atomic-task-format Interaction 字段 |
| 73 | plugin-data-persistence | ✅ IMPL | HIGH | plugin-data-path.mjs + 3 消费脚本 getCachePath/migrateOldCache |
| 74 | plugin-distribution | 🟡 PARTIAL | HIGH | .claude-plugin/{plugin,marketplace}.json + CI 校验 + dist-plugin 齐；缺 repo 根 manifests/可行性报告/forge-mcp-bundle/迁移指南 |
| 75 | plugin-init-experience | ✅ IMPL | HIGH | init dispatcher(plugin/clone) + bootstrap-check.mjs(SessionStart) + forge-root-resolver.ts |
| 76 | pms-pack-v1 | 🟡 PARTIAL | HIGH | pack.yaml/8 contexts/9 glossary/4 state-machine/20+ scenarios/accept-gate 齐；缺 templates/pms-init/、forge-mutate 路径异 |
| 77 | policy-profiles | ✅ IMPL | HIGH | PolicyProfile(solo/team/enterprise) in workflow-graph.ts+config.ts + doctor/status + 双语文档 |
| 78 | process-lifecycle-management | 🟡 PARTIAL | HIGH | ProcessRegistry 单例 + process-tree-cleaner + serialize 齐；缺 effect-executor/run-manager git 超时、PID orphan 扫描 |
| 79 | project-charter | ✅ IMPL | HIGH | charter skill(init/update/check/show + drift) + spec/plan/learn 读 charter grounding |
| 80 | remaining-backlog | 🟡 PARTIAL | HIGH | R3 社区基础设施 + R4 skill 插件机制 + R5 示例项目齐；**R1 压缩目标未达**、R2 未验证 |
| 81 | review-adversarial-stance | 🟡 PARTIAL | HIGH | 3 agent 对抗立场铁律齐；**review instructions 缺 Independent Verification 段(Req4)** |
| 82 | review-comment-bitbucket | ✅ IMPL | HIGH | src/review-comment-bitbucket/(10 文件) + 11 测试：platform-gate/hash/reconcile/format |
| 83 | review-no-mainagent-fallback | ✅ IMPL | HIGH | HARD-GATE + L0-L3 ladder + --force-skip-review + ADR + 多测试 |
| 84 | review-report-methodology-field | 🟡 PARTIAL | HIGH | schema/parser/测试齐；enum 5 值(多 saved-workflow) vs spec 要求 4（轻微扩展） |
| 85 | review-subagent-concurrency | ✅ IMPL | HIGH | runSubagentsWithConcurrency + config(env 覆盖) + 测试 |
| 86 | review-subagent-prompt-diff-context | ✅ IMPL | HIGH | DIFF_CONTEXT_PREAMBLE in src/review/subagent.ts + 测试 |
| 87 | routing-assumptions | ✅ IMPL | HIGH | router.ts assumptions 字段 + generateAssumptions() + state.ts 解析 |
| 88 | runtime-worker-context-control | ✅ IMPL | HIGH | phase-worker-runtime.ts(288 行) + forge-phase-worker.mjs + forge-sync-runtime.mjs |
| 89 | sandbox-execution | 🟡 PARTIAL | MED | sandbox-profile.ts + frozen-zone-hook.ts 齐；**未见 SdkAgentAdapter 传入 Options.sandbox**、旧 shell hook 未废弃 |
| 90 | sandbox-phased-implementation | 🟡 PARTIAL | MED | sandbox-phased.ts 纯函数+测试齐；缺 forge init 模板/--sandbox CLI/SKILL 检查点 |
| 91 | session-resume-check | ✅ IMPL | HIGH | hooks/session-start-resume-check.sh(4 检查) + auto-resume.sh 已注册(命名偏差) |
| 92 | ship-gate-commit-verification | ✅ IMPL | HIGH | checkReviewFreshness() + reviewed_at_commit schema + 单元/property 测试 |
| 93 | ship-gate-hardening | ✅ IMPL | HIGH | ship-gates.ts(992 行)：3 门禁 + P1 fixlist + L0-L3 + skip-gate + 持久化 |
| 94 | skill-behavioral-guardrails | 🟡 PARTIAL | HIGH | 18/21 rationalizations、14/17 Not For；**loop/fix/refactor 两段皆缺** |
| 95 | skill-composability | ✅ IMPL | HIGH | 4 skill 拆分 + references/(build 19 文件) + 跨 skill 引用 + function-contracts |
| 96 | skill-document-optimization | 🟡 PARTIAL | HIGH | build 28K(达标)/plan 15.5K(达标)；**review 27.9K(超 17K 64%)、learn 25.6K(超 21K)**；CLAUDE.md 指令稀疏 |
| 97 | skill-function-integration-audit | ✅ IMPL | HIGH | skill-function-registry.ts(691 行) + Trimmer 映射 + 预算报告路径 + backlog.ts |
| 98 | skills-cross-pollination | 🟡 PARTIAL | HIGH | glossary/ADR 筛/"Use when"(36/36)/grill/zoom-out/episode/evolution 齐；**渐进披露 150 行目标 10 个 skill 未达** |
| 99 | spec-lifecycle-management | ✅ IMPL | HIGH | rebuild-spec-index.mjs(3 模式) + INDEX.md + spec-template + 状态机 |
| 100 | state-resilience | ✅ IMPL | HIGH | STATUS/REVIEW_REPORT_DEFAULTS + 调度器保守降级 + reconstructStateFromGit() |
| 101 | subagent-hook-context-budget | ✅ IMPL | HIGH | hook-stdin-router.mjs + inject-evolved-rules.mjs + 各脚本短路 + settings 清理 |
| 102 | subagent-result-truncation | ✅ IMPL | HIGH | 3 agent Turn Budget/maxTurns(15/12/10)/Final Report Block + 测试 |
| 103 | subagent-truncation-fix | ✅ IMPL | HIGH | truncation-detection.ts + review/fallback.ts 串行重试 + REPORT 标记 + 6 测试 |
| 104 | tdd-vertical-slice-enforcement | ✅ IMPL | HIGH | CLAUDE.md §2.1.1 + tdd-rules §5/§6 + atomic-task-format Vertical Slice |
| 105 | token-budget-compression | 🔁 SUPERSEDED | HIGH | 目标路径已不存在；被 forge-single-entry-skills-collapse 重构取代（CLAUDE.md 9.4K 达标） |
| 106 | token-language-optimization | 🟡 PARTIAL | HIGH | P3 build-light 齐；P2 混合语言未用到 agent 定义；无 BPE 基线 |
| 107 | typed-mcp-capabilities | ✅ IMPL | HIGH | typed-capabilities.ts(6 工具) + server.ts 注册 + legacy 替换警告 |
| 108 | typedoc-api-docs | ✅ IMPL | HIGH | typedoc.json + devDep + docs 脚本 + CI 步骤 + .gitignore |
| 109 | ultrareview-ci-integration | ✅ IMPL | HIGH | run-ci-ultrareview.sh(347 行) + ultrareview.yml + 模板 + init 提示 |
| 110 | user-task-flow-docs | ✅ IMPL | HIGH | docs/flows/(4 流×双语) + README 路由 + workflow-graph SSOT |
| 111 | v2.4-review-followups | 🟡 PARTIAL | HIGH | 2/8 全 done、2 partial、**4 大缺口**（hook 未接线/E2E 缺/console 未迁移/--strict 未加） |
| 112 | workflow-graph-dsl | ✅ IMPL | HIGH | workflow-graph.ts(502 行)：类型/13 阶段/7 profile/校验；router/scheduler/docs 消费 |
| 113 | workflows-integration | 🟡 PARTIAL | HIGH | dispatcher 等 skeleton 齐；**41/82 AC 推迟**、cli-subprocess-driver.ts 缺失 |

---

## 3. PARTIAL 分级（便于排期）

### 3.1 实质性缺口（建议优先处理）— 9 项
`audit-remediation-v221`、`workflows-integration`、`forge-slimming-plan`、`v2.4-review-followups`、`context-explosion-defense`、`phase-advance-hardening`、`sandbox-execution`、`sandbox-phased-implementation`、`i18n-support`

> 特点：核心机制缺失、被简化替代、或已建但未接线（hook 未注册/CLI 未接）。
>
> **复核纠正（2026-06-11）**：`configchange-hook` 和 `cursor-team-kit-integration` 经独立验证后确认为 IMPLEMENTED，已从本列表移除。详见 §2 裁定总表 #22/#26 条目。

### 3.2 中等缺口 — 8 项
`community-ecosystem`（缺 skill install 命令）、`engineering-governance-hardening`（Event Sourcing 全缺）、`execution-package-context-control`、`plugin-distribution`（缺根 manifests/迁移指南）、`process-lifecycle-management`（缺超时/孤儿扫描）、`pms-pack-v1`（缺 init 模板）、`remaining-backlog`（压缩目标未达）、`forge-resume-from-pr`（CLI 未接）

### 3.3 轻微缺口（≥85% 完成，收尾即可）— 14 项
`agent-description-cso`、`audit-remediate-0608`、`ccbp-inspired-hardening`、`forge-decide-agent-teams`、`forge-review-fix-optimization`、`forge-slimming-followups`、`frozen-zone-structured-feedback`、`misc-forge-optimization`、`review-adversarial-stance`、`review-report-methodology-field`、`skill-behavioral-guardrails`、`skill-document-optimization`、`skills-cross-pollination`、`token-language-optimization`

> 特点：多为尺寸/行数目标未达、个别文件或小节缺失、单点枚举值差异。

---

## 4. 复核方法与可信度

### 4.1 流程
1. 枚举 `.tinkerman/specs/` 全部 113 个非 archived 目录（`find` 纯名，规避 `ls` 颜色码干扰）。
2. 每 spec 读取 `requirements.md` 的 Introduction + Requirements/Acceptance Criteria，抽取 2-4 个最具体的可检查交付物。
3. 在 `src/`、`skills/forge/lib/`、`.claude/agents/`、`scripts/`、`hooks/`、`.claude/settings*.json`、`commands/`、`workflows/`、`packs/`、`templates/`、`.github/workflows/`、`package.json` 中 `grep`/`glob` 验证交付物是否真实存在（非 stub/TODO）。
4. 分类裁定；对父子 agent 结论冲突的 spec，**亲自 `grep` 核实文件存在性**裁决（§0 已列出 5 处纠正）。
5. **明确排除项**：不读 `tasks.md` 勾选；不信 frontmatter `status`；不采信 `INDEX.md`；`dist/`/`dist-plugin/` 仅作次要参考（构建产物，非源证据）。

### 4.2 并发与限流
首轮用并行 general-purpose subagent 触发账户级 429 限流（因子 agent 各自再派生 per-spec 子 agent，并发爆炸）。后续改用 **`Explore` 只读 agent**（物理上无法再生子 agent）小波次（3 并发）完成，并辅以主线程亲自 `grep` 实证关键冲突。

### 4.3 已实证清单（主线程亲自 grep 确认）
- `src/status-file-ext.ts:103,496` + `scripts/inject-evolved-rules.mjs:181` → FORGE_DIAGNOSTIC_MODE 存在
- `docs/claude-code-compatibility.md` → 含 2.1.169
- `src/context-budget.ts:60,93-97` → contextWindowTokens 存在
- `examples/{node-api,react-todo}/` + `src/skill-loader.ts`(SkillManifest) + `.github/ISSUE_TEMPLATE/skill_plugin_proposal.md` → community-ecosystem 部分实现
- `skills/shared/gate-protocol.md` → 存在（forge-gate-shared-protocol）
- `agents/validation-pass.md` + `src/review/{types,core,subagent}.ts`(cross-validation) → ce-inspired 实现
- `src/branch-gate.ts` 导出 + 无 `AgentRegistry` 命中 + `src/sdk-driver.ts` 不存在 + `src/event-writer.ts`(NDJSON 实写处) 等

### 4.4 未尽事宜 / 建议下一步
- **元数据失真**：建议把 `requirements.md` 的 `status: completed` 改为反映真实状态（34 个应降级为 `partial`），或引入独立于自报的验证机制——否则 `INDEX.md` 与实际持续背离。
- **`gsd-core-adoption`**：建议在 INDEX 中标注为"借鉴调研包（子概念已由专用 spec 落地）"，避免按普通 spec 计数。
- 若需对某 PARTIAL spec 做**逐条 AC 级**深度复核，可单独发起（本报告按每 spec 2-4 关键交付物抽样验证）。

---

*本报告由代码实现复核生成，所有 `已实证` 项均经主线程亲自 `grep`/读源码确认；其余项基于 subagent 报告并交叉核对。*

---

## 附：复核后归档动作（2026-06-11）

基于本复核结论，以下 2 个 spec 已于复核当日归档至 `.tinkerman/archive/2026-06-11-*/`，INDEX.md 同步更新（active 112→110，archived 11→13）：

- **`multi-platform-support`**（原 ❌ NOT-IMPLEMENTED）→ 归档，原因：多平台抽象层经复核确认从未实现，决定不做。
- **`token-budget-compression`**（原 🔁 SUPERSEDED）→ 归档，原因：被 `forge-single-entry-skills-collapse` 重构为 `skills/forge/lib/*/instructions.md` 单入口结构，原 skill 路径已不存在。

故截至归档后：实质 spec = 110，其中 IMPLEMENTED 77 / PARTIAL 33。
