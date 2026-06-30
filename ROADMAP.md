# 🗺️ Forge 路线图

> 本文档描述 Forge 项目的演进方向。已完成版本的详细变更记录见 Git history 和 `.forge/archive/`。

---

## 已完成版本摘要

| 版本 | 日期 | 主题 |
|------|------|------|
| v2.1 | 2026-04-26 | Forge Loop 自主执行引擎、CI 加固、冻结文件硬阻断 |
| v2.1.1 | 2026-04-26 | CI Actions 升级 Node.js 24、Shellcheck 合规 |
| v2.2 | 2026-04-26 | parseListSection 修复、PBT、Forge Loop npm 发包 |
| v2.2.1 | 2026-04-28 | 上线前深度审核修复（H1-H6、M1-M11、L9/L14/L15） |
| v2.3 | 2026-04-28 | Loop × Skills 融合、平台抽象层、i18n、可观测性 |
| v2.4 | 2026-05 | Subagent 迁移、上下文预算、错误恢复、Plugin 分发、MCP Server |
| v2.5 | 2026-05-17 | 瘦身——recap/resume/abort/learn/review 委托官方原语 |
| v2.6 | 2026-05-18 | skill 归位 + 数量精简（SST=22），使用率度量管线 |
| v2.7 | 2026-05-25 | skill consolidation 收尾、Plugin marketplace 发布就绪 |
| v3.0 | 2026-05-26 | 主版本——多 Agent 工作流架构 + 沙箱策略系统引入 |
| v3.1 | 2026-05-30 | 多 Agent 编排基础设施、Resilience Layer、Ship Gates、Spec Lifecycle、上下文爆炸五层防御 |
| v3.2 | 2026-05-31 | Release Automation、RTK 压缩引擎、项目级配置（零全局副作用） |
| v3.3 | 2026-06-01 | Loop native fusion——淘汰 legacy SDK loop，原生调度 + git rollback + 三击检测 |
| v3.3.1 | 2026-06-05 | Claude Code 2.1.163 兼容门禁、doctor 结构化健康快照、SubagentStop 反馈 |
| v3.4 | 2026-06-12 | 审计整改 P0/P1（allowlist/MCP/dist/CI）、项目宪章系统、8 GSD Core 模式、CE-Inspired review |
| v3.5 | 2026-06-18 | 动态重规划闭环、agentic UI 验收、session journal 保留、review per-tier timeout、regenerative checkpoint |
| v3.6 | 2026-06-21 | 分层测试金字塔（ADR-0006）、/forge continue 阶段推进器、context-injection 激活、charter/build 注入、forge:defer 台账、Dim 8 Deletions、YAGNI gate、mcp 压缩委托 Headroom |
| v3.7 | 2026-06-22 | hooks 脚本路径在 plugin install 下解析修复、init.sh non-TTY + AskUserQuestion fallback、skill-craft 借鉴（mattpocock 9 点 + superpowers v6 SDD lessons） |
| v3.8 | 2026-06-23 | init capability checklist（plugin + MCP + companions） |
| v3.9 | 2026-06-25 | agents/ 大重构（symlink 统一 + AGENT-TEMPLATE + 铁律内嵌）、safety v2-v5 加固、adversarial injection corpus + bypass-rate gate（L7）、shared-vocabulary SSOT、guarded-merger/audit-log/secret-redactor 并发与边界修复 |

---

## v3.x — 借鉴与再生（已完成的主线）

> **战略定位**：v3.0 引入多 Agent 工作流 + 沙箱策略系统。v3.1–v3.5 在此之上叠加弹性层、发布门禁、Loop native fusion、审计整改与外部方法论借鉴；v3.6–v3.9 收尾 agent 体系（symlink 统一 + 铁律内嵌）、引入分层测试金字塔与 skill-craft 工艺借鉴、并完成 safety v2-v5 多轮加固与 adversarial injection gate。

### 已完成

- ✅ **v3.1 多 Agent 编排 + Resilience Layer** — Ship Gates、Spec Lifecycle、Context Explosion Defense 五层、Hooks v2.1.153 全生命周期、`/goal` TDD 模式、Decide auto-dispatch
- ✅ **v3.1 Constitution 铁律补强** — §2.7 No Confirmation Between Steps、§2.8 Scripts as Black Box、§3.1 review fallback ladder（L0→L1→L2→L3，L3 阻断 ship）
- ✅ **v3.2 Release Automation** — `bump-version.mjs` 一键发版，RTK 压缩引擎 + fallback ladder，配置全量迁移到项目级（零全局副作用），`bash-ban-raw` hook
- ✅ **v3.3 Loop native fusion** — 淘汰 legacy loop/SDK 系统（Wave 3），原生调度策略 + cache-aware scheduler、`stopWhen` 条件终止、三击检测 + git rollback、loop state JSON schema（26 tests）
- ✅ **v3.3.1 Claude Code 2.1.163 门禁** — semver 兼容性检查（`src/compatibility.ts`）、`requiredMinimumVersion` managed setting、`forge-doctor` 扩展为 plugin/hooks/commands/bin/MCP 多维健康检查 + `--json` 结构化输出、SubagentStop additionalContext 反馈
- ✅ **v3.4 审计整改 + 方法论借鉴**
  - [SECURITY] P0/P1 审计整改（allowlist 加固、MCP 安全、dist sync、CI gates）
  - 项目宪章系统（`.forge/charter.md`）—— 跨 spec 锚定工程约束
  - 8 GSD Core 模式借鉴（注入防御、上下文裁剪、科学调试）
  - CE-Inspired Review（confidence anchoring、adversarial-check、validation pass、autofix）
  - Reframing Gate / Clarification Gate（decide/spec 发散思维门）
  - superpowers best practices 借鉴（CSO、rationalization、adversarial stance、plan gate、session hook）
- ✅ **Loop Engineering 橙皮书借鉴（#98）** — 行为验证 + `/forge triage` 自动发现 + 理解腐烂对策；`/forge triage` 作为 Loop Engineering 的 discovery 动作
- ✅ **再生式 Checkpoint（#99）** — 长会话状态保全（借鉴 MiMo-Code）
- ✅ **review per-tier 动态 agent timeout（#100）** — 按 tier 动态分配 review agent 超时预算，避免轻量任务空耗 / 重任务超时
- ✅ **session journal 保留策略（#101）** — `scripts/prune-sessions.sh` + `scripts/prune-event-logs.sh` 限制 `.forge/knowledge/sessions/` 无限增长
- ✅ **agentic UI 验收（#102）** — `/forge accept` 接入 agent-browser 驱动，端到端功能验收（UI 操作→截图→verdict）；新增 `docs/acceptance-onboarding.md`、三态 verdict（pass/inconclusive/fail）、tier fallback、token 经济
- ✅ **动态重规划闭环（#103）** — failure_class 分类 + scheduler debug 分支 + 增量 replan，失败后按类别触发局部重规划而非整体重来
- ✅ **mcp SIGTERM 关闭竞态修复（#104）** — 消除 MCP integration test 中 SIGTERM 关闭竞态
- ✅ **mcp 压缩委托 Headroom（#107）** — 移除 RTK 压缩引擎 + `forge_read_cached`，压缩统一委托给 Headroom
- ✅ **ui-harness 测试隔离（#108）** — ui-harness 测试不再启动真实浏览器
- ✅ **tool-health 日志拆分（#109）** — tool-health event log 从 tracked summary 中拆分，便于独立保留/清理
- ✅ **usage metrics hook（#112）** — UserPromptSubmit hook 接入 usage metrics recorder，记录每次 prompt token 消耗
- ✅ **charter 注入 build（#113）** — charter grounding 注入 build 阶段（§2.5），restatement checkpoint 重读 charter invariants
- ✅ **context-injection 激活（#114）** — context-injection scaffold 接入 `/forge review` 与 `/forge decide`，按 taskType 注入相关上下文
- ✅ **`/forge continue` 阶段推进器（#115）** — 交互式推进当前任务下一阶段，跨会话阶段续接
- ✅ **`forge:defer` 延迟决策回收** — build 期标记 `forge:defer` + `deferred.md` 台账；learn §0.9 sweep 步骤回收
- ✅ **review Deletions 维度（Dim 8）** — quality-check 新增"本不该写的代码"扫描维度，产出 delete-list
- ✅ **Ponytail YAGNI 纪律采纳** — forge-build agent Pre-task YAGNI gate + hard-boundaries 自检清单
- ✅ **v3.6 分层测试金字塔 + 阶段推进（#112-#116）**
  - Layered Test Pyramid（ADR-0006）四层验证模型
  - `/forge continue` 交互式阶段推进器，跨会话推进下一阶段（#115）
  - context-injection scaffold 激活，按 taskType 注入 review/decide（#114）
  - charter grounding 注入 build 阶段 §2.5，restatement checkpoint 重读 charter invariants（#113）
  - UserPromptSubmit hook 接入 usage metrics recorder（#112）
  - `forge:defer` 延迟决策标记 + deferred.md 台账 + learn §0.9 sweep 回收
  - mcp 压缩委托给 Headroom，移除 RTK 压缩引擎 + `forge_read_cached`（#107）
- ✅ **v3.7 hooks/install 韧性 + skill-craft 借鉴（#119-#127）**
  - hooks 脚本路径在 plugin install 下解析修复（`CLAUDE_PLUGIN_ROOT` 优先 + 三路 fallback）（#125-#127）
  - init.sh non-TTY + AskUserQuestion fallback（#125）
  - skill-craft 借鉴 mattpocock/skills 9 点改进（spec `mattpocock-skill-craft-borrow`）：user/model-invoked 二分、会话拓扑、领域文档三分、red-capable loop gate、Completion Criterion 双属性、Skill Failure Modes 词汇表、Leading Words
  - superpowers v6.0.0 SDD lessons 借鉴（unverifiable verdict / plan pre-flight / model tier / plan constraints）（#119）
- ✅ **v3.8 init capability checklist** — init 完成时给出 plugin + MCP + companions 能力核对清单
- ✅ **v3.9 agents 大重构 + safety 加固**
  - agents/ 体系：11 个 forge-* agent 回流并中文化 description、`.claude/agents/` 全部改为 symlink 指向 `agents/`（ADR-0010）、AGENT-TEMPLATE + 铁律内嵌（spec #2/#3）、symlink 完整性门禁（spec #1）、查重 + lint 门禁接入 `npm run check`
  - safety v2-v5 系列加固：destructive-guard + spawn-policy + knowledge-quota（R1-R4）、normalization engine + nonce bypass、whitelist + fail-closed + flag 完整性、wrapper-prefix whitelist、git global flag value-swallow（-C/--git-dir bypass）修复
  - adversarial injection corpus + bypass-rate gate（L7）、dogfooding behavior KPI aggregator（L8 foundation）、structural assembly fingerprint snapshot tests（L3）
  - shared-vocabulary SSOT 抽取（Two-Phase / JSON schema / Known-failures YAML / Return Protocol / Findings-Only / Confidence_Anchor），3 checker 通过 Step 0.1 Read 加载（R8）
  - 并发与边界修复：guarded-merger 用真实 `completed_at` 解析 + 移除 `Date.now()`/`Math.random()` 非确定性、audit-log 共享 O_EXCL 锁串行化 + 锁超时写 gap marker、secret-redactor 覆盖 PEM/PGP/JWT、check-frozen 跨平台 CLI 入口检测 + URL 解码
  - ADR-0009（治理文档与 agent 元数据源语言定中文）、ADR-0011（agent 选择性安装暂不实现，前瞻决策）

### 进行中 / 待评估

- ⏳ **`forge-decide-agent-teams` PoC 收尾** — `.forge/specs/forge-decide-agent-teams/` 已 approved，11 个任务跑完得出 adopt/keep/hybrid 决策；当前停滞需要 close 或 ship
- ⏳ **`forge-refactor` / `forge-fix` / `forge-fix-conflicts` 整合评估** — 三者命令序列相近，仍待基于使用率数据决定是否合并为 `forge-maintenance` 子命令
- ⏳ **`forge-grill` / `forge-zoom-out` 使用率评估** — 跟踪实际调用频次，若低则并入 `decide` / `debug`

### 保持观察（v2.2.1 遗留低风险项）

| # | 问题 | 位置 | 说明 |
|---|------|------|------|
| L-11 | router.ts 与 skill-scheduler.ts full 档位序列不一致 | router.ts, skill-scheduler.ts | 注释说明是设计意图 |
| L-12 | 孤儿导出函数 | router.ts, skill-scheduler.ts | 仅测试中使用 |
| L-13 | brownfield tier-boost 范围 | router.ts | brownfield + `hasAuthChanges`/`touchesExistingModules` 触发 standard→full boost（v3.x 后已非 light→standard） |

> **已关闭的遗留项**：L-10（`stop_condition_met`/`currentIteration`，随 v3.3 loop native fusion 淘汰 legacy `orchestrator.ts` 失效）、L-16（`AtomicTask.dependsOn` 已在 `task-graph.ts` + `plan/validate.ts` 实现，含 R25 拓扑校验）。

### 明确保留（不动）

- `skills/forge/lib/decide-teams/` — PoC 跟进 Agent Teams 趋势，每季度评估
- `cmux-skills/forge-loop-signals/` — opt-in 可视化，30 行声明式文件，零维护成本
- `/forge control-cli` + `/forge control-ui` — `/forge test` 三态验证体系的执行层
- `forge-storm` — `/forge spec` 的前置方法论能力，对 DDD 项目有独有价值
- `forge-pack-pms` — 在 `packs/` 目录，不是主包 skill

---

## 剩余中期项

- **Events_NDJSON 多消费者扩展**（优先级：中）
  - 当前：cmux Mirror_Daemon 单消费者
  - 目标：IDE 插件（VS Code 状态栏）、Web Dashboard、CI 集成报告器
  - 字节游标协议已就位，无需协议改动

- **cmux 终端深度集成**（优先级：低，跟随 Tier 1）
  - cmux 0.63+ 已原生支持 Claude Code Teams（`cmux claude-teams`）和 Codex Teams（`cmux codex-teams`），自动注入 tmux shim、设置 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`、把 teammate 渲染为原生分屏
  - Forge 不再造可视化轮子；策略转为"在 cmux 终端中检测到时优先建议 `cmux claude-teams`，并复用 sidebar/通知环投射 `/forge decide --mode=teams` 的中间状态"
  - 余下增量在 `cmux-skills/forge-loop-signals/` 与 `forge-sidebar-sync/` 中持续维护，零运行时开销

- **Agent Teams 分层 adoption（Tier 0：立即可做）**（优先级：中）
  - 三个动作不依赖任何 issue 关闭、不切换主流程：
    1. **`TaskCompleted` / `TeammateIdle` / `TaskCreated` hook 集成** — 即使主流程是 Subagent，用户偶尔自发开 Agent Teams 时这些 hook 让 Forge 的 review/test 门禁也能拦截 teammate 提交
    2. **Subagent definition 复用** — `agents/*.md`（product/architect/security/designer/critic/spec-check/quality-check/security-check）补 frontmatter 后可同时作为 Subagent 和 teammate 使用，零重写
    3. **`forge-decide-agent-teams` PoC 收尾** — `.forge/plans/forge-decide-agent-teams.md` 已 approved，11 个任务跑完得出 adopt/keep/hybrid 决策。当前停滞需要 close 或 ship

---

## 长期 — v4.0（社区与生态）

面向社区开放，构建可扩展的 AI 编码工作流生态。v3.0 已落地多 Agent 工作流 + 沙箱策略系统，v4.0 聚焦生态与平台扩展。

- **Agent Teams 分层 adoption（Tier 1 / 2 / 3，长期跟踪）**

  ROADMAP 早期把 Agent Teams 视为"等所有 issue 关闭后整体回迁"。基于 2026-05 官方文档与 issues 跟踪，这个判断已修正——**没有"整体回迁"这件事**，而是按场景分层取舍。

  **Tier 1 — 受限场景启用**（约束满足时作为 `/forge decide` 的可选模式，非默认）

  仅在以下条件**全部**满足时把 Agent Teams 当作 high-token / high-quality 的可选模式（类似 opusplan 的定位，不替换 Subagent，是补充）：
  - 终端环境为 cmux（推荐，0 配置；`cmux claude-teams` 自动注入 shim 与 env）/ macOS/Linux + tmux / iTerm2 / Ghostty 等支持 split-pane 的终端
  - 任务路由器判定为 full-tier 且 task type ∈ {architecture, research, debug-with-competing-hypotheses}
  - 决策可在单次 20 分钟内完成（无需 resume）
  - token 预算允许 5x 单 session 消耗

  **Tier 2 — 永不回迁**（写入 ADR 关闭讨论）
  - `/forge review` — 本质是 fan-out → gather → merge，子任务无相互依赖；review 需要 `/forge resume`；spec-check / quality-check / security-check 必须由同一逻辑去重。Subagent 模式更合适
  - `/forge build` 与 `/forge loop` — 需要原子 commit + git transaction + Restatement Checkpoint + 熔断器；与 Agent Teams 的 resume / shutdown 不可靠直接冲突

  **Tier 3 — 长期跟踪的官方限制**（非全部要求关闭，仅作判断依据）

  | 类型 | 项目 | 状态 | 影响 Forge 的判定 |
  |------|------|------|--------------|
  | 架构性（不会修复） | Lead 固定，无法转移领导权 | 永久 | Tier 1 单 session 场景可接受 |
  | 架构性 | Permissions spawn 时锁定，无法 per-teammate | 永久 | 与 Forge 三区权限模型矛盾 |
  | 架构性 | Split-pane 仅 tmux/iTerm2 | 永久 | Tier 1 通过环境检测兜底；**对 cmux 用户已缓解**（cmux 原生 split-pane） |
  | bug | `/resume` 不恢复 in-process teammates | Open（官方 Limitations） | Tier 1 通过任务时长上限规避 |
  | bug | Idle teammates 不响应（[#29163](https://github.com/anthropics/claude-code/issues/29163)、[#29271](https://github.com/anthropics/claude-code/issues/29271)、[#24108](https://github.com/anthropics/claude-code/issues/24108)） | Open | 通过 `TeammateIdle` hook + 超时兜底；**cmux 用户额外受益**于 cmux 通知 + sidebar 徽章，idle 状态可视化降低实际危害 |
  | bug | SendMessage 运行时不可用（[#47021](https://github.com/anthropics/claude-code/issues/47021)、[#50622](https://github.com/anthropics/claude-code/issues/50622)） | Open | Tier 1 PoC 用 lead 协调而非 teammate 互发 |
  | bug | Context compaction 丢 team config（[#23620](https://github.com/anthropics/claude-code/issues/23620)） | Open | Tier 1 通过任务时长上限规避 |
  | tradeoff | 每 teammate 独立 context = token 5x | 永久 | Tier 1 仅在 full-tier 启用 |

  **2026 年期间已经改善的项**（影响判定）：
  - ✅ 三个 hook 加入：`TeammateIdle` / `TaskCreated` / `TaskCompleted`
  - ✅ Task claiming 文件锁防 race
  - ✅ Subagent definition 可作为 teammate 引用（Forge 的 agents 直接复用）
  - ✅ Plan approval 模式（teammate 在 read-only plan mode 等 lead 批准）

  **跟进策略**：季度复检上表，重点关注 Tier 1 启用条件中"任务时长上限"是否能因 resume 修复而放宽

- **社区建设**
  - 贡献者指南完善和 issue 模板标准化
  - SKILL 插件机制：支持第三方开发和发布自定义 SKILL
  - 示例项目和最佳实践文档

- **沙箱执行环境**（已有雏形）
  - 当前：`check-sandbox.ts` + `sandbox-policy.ts` + `sdk-sandbox-policy.ts` 提供基础能力
  - 目标：细粒度的权限控制模型，替代 `bypassPermissions`

- **多 AI 平台支持**
  - 平台抽象层已就位（`AgentInterface`），当前只有 claude + mock 两个 adapter
  - 目标：添加 Codex / Gemini CLI 等 adapter，验证抽象层通用性

---

## Forge 的核心护城河（瘦身时不动的部分）

以下能力是 Forge 区别于 Claude Code 原生 + 其他 plugin 的真正差异化，任何瘦身决策都不影响这些：

1. **三维路由**（tier × type × phase）+ 自动降级
2. **TDD 铁律** — Plan 阶段强制嵌入 TDD 步骤 + hooks 强制执行
3. **Spec 锁定 + frozen zone 分级保护**（locked/approved/open 三级 + `FrozenZoneViolation`）
4. **五维度结构化 learn** — 跨项目经验库 + ADR
5. **Property-based Testing 文化** — 147 个 PBT 文件（`.property.test.ts`）
6. **三层独立评审中的 Spec-alignment 层**
7. **Forge Loop 的工程纪律** — Git 事务、熔断器、指数退避、完成摘要、PUA 引擎
8. **Domain Pack 机制** — PMS pack 作为示例
9. **证据化三态验证**（VERIFIED / NOT_VERIFIED / INCONCLUSIVE）+ control-cli/ui 执行层
10. **事件风暴（storm）作为 `/forge spec` 的 DDD 前置**

---

*本路线图会随项目进展持续更新。具体排期和优先级可能根据社区反馈和实际需求调整。*
