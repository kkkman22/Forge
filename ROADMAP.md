# 🗺️ Forge 路线图

> 本文档描述 Forge 项目的演进方向，分为短期、中期、长期三个阶段。

---

## v2.1 已完成（2026-04-26）

- ✅ **Forge Loop 自主执行引擎** — 基于 Claude Agent SDK 的自主循环 CLI（`forge-loop`），含纯函数状态机、Git 事务、指数退避 + 熔断器、Worktree 隔离、防休眠、优雅关闭
- ✅ **运行时依赖版本锁定** — `package.json` dependencies 使用精确版本
- ✅ **check-frozen.sh 重写为 TypeScript** — shell thin wrapper + TS 实现，保留 fallback
- ✅ **CI 验证范围扩展** — shellcheck、hooks.json 验证、SKILL.md frontmatter 检查
- ✅ **Restatement Checkpoint 机制** — build 阶段周期性上下文刷新，对抗注意力衰减
- ✅ **冻结文件硬阻断** — check-frozen.sh 对 locked/approved 文件以 exit 1 阻断写入
- ✅ **Hooks 升级** — Write/Edit hook 切换到 Node.js；新增 Bash 工具冻结保护
- ✅ **install-dist.sh 安全加固** — 路径安全校验，拒绝空路径和危险系统路径
- ✅ **init.sh 增强** — handoffs 目录、模板复制、hooks 合并失败时详细指引
- ✅ **CI sync-dist → verify-dist** — 不再自动提交，改为校验失败报错
- ✅ **forge-resume 增强** — 优先读取 interim 日志，恢复后立即执行 Restatement
- ✅ **回滚安全网** — `executeRollback` 执行 `git reset --hard` 前自动 `git stash`，stash 失败不阻断回滚
- ✅ **权限绕过文档化** — `sdk-agent-adapter.ts` 中 `bypassPermissions` 已添加设计决策注释

## v2.1.1 已完成（2026-04-26）

- ✅ **CI Actions 升级至 Node.js 24 运行时** — `actions/checkout` v4→v5、`actions/setup-node` v4→v6
- ✅ **CI 构建 Node.js 版本升级** — 20→22（当前 LTS）
- ✅ **Shellcheck 合规** — 修复 4 个脚本共 7 处 shellcheck 警告

---

## v2.2 已完成（2026-04-26）

- ✅ **`parseListSection` 正则 bug 修复** — 替换字符串从错误的 UUID 值修正为标准的 `"\\$&"` 反向引用，修复含正则特殊字符的 section title 无法解析的问题
- ✅ **正则特殊字符 property-based 测试** — 新增 2 个 PBT（round-trip 一致性 + non-matching title 返回空数组，各 200 次迭代）
- ✅ **Forge Loop npm 发包** — `npx forge-loop "目标"` 一行即可使用自主执行引擎
  - `package.json`：`name` → `forge-loop`、`private` → `false`、`files: ["dist/src/"]`
  - CI 新增独立 `publish` job（Git tag `v*` 触发，含 typecheck → test → tsc → npm publish）
  - 现有 Skills 分发包流程不受影响

---

## v2.2.1 已完成（2026-04-28）

> 来源：2026-04-27 上线前深度审核（第二轮），详见 `AUDIT_REPORT.md`。

### 🔴 高风险（已修复）

- ✅ **H-1: SDK 权限绕过运行时验证** — `SdkDriver` 启动时调用 `validateHooksPresence(cwd)` 检查 `hooks.json` 存在且含 PreToolUse 配置，缺失时输出 `console.warn`
- ✅ **H-2: 并发 Worktree 竞态窗口** — `run-manager.ts` 实现 `acquireFileLock()` / `releaseFileLock()`，使用 `O_CREAT | O_EXCL` 原子文件锁序列化 worktree 创建，含超时防死锁
- ✅ **H-3: 分发包冻结保护失效** — `build-dist.sh` 现在复制 `check-frozen.js` 及其完整依赖链（`state.js`、`frontmatter.js`）到分发包 `dist/src/`
- ✅ **H-4: Worktree 删除导致 notes 丢失** — `forge-loop-cli.ts` 新增 `backupWorktreeNotes()` 函数，在 worktree 删除前将 notes 备份到主仓库 `.forge/runs/` 目录
- ✅ **H-5: notesContent 初始化与文件不一致** — `SdkDriver` 构造时传入 `branchName`：`{ runId: config.runId, branchName: config.branchName, entries: [] }`
- ✅ **H-6: 熔断器与 PUA L4 阈值不匹配** — 已文档化设计意图：PUA L1-L3 用于预警和方法论切换，熔断器用于终止，L4 仅在熔断器阈值被调高时触发

### 🟡 中风险（已修复）

- ✅ **M-1: Frontmatter 正则注入** — `frontmatter.ts` 新增 `escapeRegExp()` 函数，`extractStringField`/`extractListField`/`extractNumericField` 均使用转义
- ✅ **M-2: Effect 错误分类不精细** — 引入 `FrozenZoneViolation` 错误类（继承 `ForgeError`），冻结区违规直接终止循环不触发退避
- ✅ **M-3: Backoff 边界条件** — `calculateBackoffMs()` 使用 `Math.max(1, consecutiveErrors)` 防御零值
- ✅ **M-4: PUA 状态恢复错误吞没** — 所有 PUA 相关 catch 块改用 `err.stack ?? err.message` 记录完整堆栈
- ✅ **M-5: Worktree 创建失败分支未清理** — catch 块中执行 `git branch -D branchName`，含手动清理指引
- ✅ **M-6: Agent 调用缺少超时** — `SdkAgentAdapter` 实现 `globalTimeoutMs`（默认 30 分钟），通过 `setTimeout` + `AbortController` 强制超时
- ✅ **M-7: resumeRun 从未被调用** — CLI 支持 `--resume <branchName>` 标志，连接 `RunManager.resumeRun()`
- ✅ **M-8: abort 信号无法中断 effect 执行** — `SdkDriver.executeEffects()` 传递 `this.currentAbortController?.signal` 给 `EffectExecutor`，executor 在每个 effect 执行前检查 signal 状态
- ✅ **M-9: sanitizeBranchName 覆盖不全** — 正则采用白名单 `[a-zA-Z0-9\-_./]`，所有 Git 非法字符（`~^*[:?\\@{}`）均被排除；`@{` 在白名单过滤前单独处理
- ✅ **M-10: buildPressurePrompt 返回值被丢弃** — `PuaStateManager.handleFailure()` 中添加注释说明设计意图：状态通过 StatusFile 持久化，下次迭代从 StatusFile 重建
- ✅ **M-11: 硬失败路径不更新 PUA 状态** — `executeGenericIteration` 和 `executeSkillAwareIteration` 的 catch 块均调用 `puaStateManager?.handleFailure()`

### 🟢 低风险（已修复）

- ✅ **L-9: 状态转换守卫缺失** — `orchestrator.ts` 添加终态守卫：`aborted`/`stopped` 状态拒绝所有事件
- ✅ **L-14: confirmSpec 不调用验证函数** — `confirmSpec()` 现在调用 `validateTestability()` 和 `validateBrownfieldDelta()`
- ✅ **L-15: plan.ts 不检查 spec 状态** — 新增 `validateSpecLocked()` 函数，plan 执行前检查 spec 是否已锁定

### 🟢 低风险（保持观察）

| # | 问题 | 位置 | 说明 | 状态 |
|---|------|------|------|------|
| L-10 | `stop_condition_met` 不增加 `currentIteration` | orchestrator.ts | stop 后循环立即终止，实际影响有限 | 保持观察 |
| L-11 | router.ts 与 skill-scheduler.ts full 档位序列不一致 | router.ts, skill-scheduler.ts | 注释说明是设计意图 | 保持观察 |
| L-12 | 孤儿导出函数 | router.ts, skill-scheduler.ts | 仅测试中使用 | 保持观察 |
| L-13 | brownfield 提升逻辑被困 light 分支 | router.ts | brownfield 仅 light→standard | 保持观察 |
| L-16 | AtomicTask 缺少 dependsOn 字段 | plan.ts | 无法表达任务间依赖 | 保持观察 |

---

## v2.3 已完成（2026-04-28）— 平台改进

- ✅ **Forge Loop × Skills 融合**（核心演进方向）
  - **Loop 驱动 Skills**：`skill-scheduler.ts` 的 `determineNextSkill()` 根据 StatusFile 状态决定下一个 SKILL 阶段；`SKILL_COMMAND_SEQUENCES` 定义 tier 对应的阶段序列（light/standard/full）
  - **Skills 双模式运行**：`execution-mode.ts` 实现 `interactive` / `autonomous` 双模式；`resolveConfirmation()` 为 11 个确认点定义自主模式预设策略
  - **状态感知**：`SdkDriver.executeSkillAwareIteration()` 每轮读取 StatusFile，提取 phase/tier/loopFields；`initializeLoopFields()` + `clearLoopFieldsOnShutdown()` 管理生命周期
  - **门禁复用**：`evaluateQualityGateForPhase()` 每轮评估质量门禁；`evaluateReviewGate()` 复用 review P0/P1 逻辑；`reviewFixAttempts` 管理 review-fix 循环熔断
  - **分发包可用**：Loop 核心逻辑通过 `forge-loop` npm 包发布

- ✅ **平台抽象层**
  - `AgentInterface`（`loop-types.ts`）定义通用 Agent 接口
  - `SdkAgentAdapter` 是 Claude Agent SDK 的唯一具体实现
  - `EffectExecutorInterface` 抽象 effect 执行层

- ✅ **国际化（i18n）支持** — `src/i18n.ts` + `locales/{en,zh}.json` + CLI `--lang`，`SdkDriver` 全链路 i18n

- ✅ **API 文档生成（TypeDoc）** — `npm run docs`，CI `Verify docs generation` 步骤

- ✅ **可观测性增强（全部完成）**
  - Token 使用量追踪：每轮迭代记录 input/output/cache tokens
  - 结构化完成摘要：`formatCompletionSummary()`
  - 统一错误层次：`ForgeError` + 子类，含 machine-readable `code`
  - i18n 化的日志输出
  - ✅ **结构化 JSON 日志格式** — `logger/index.ts` 支持 `format: "json"`，`--log-format json` + `--log-file` 启用 dual-write
  - ✅ **命令执行耗时统计和性能基线** — `performance-tracker.ts` + `formatPerformanceBaseline()`，追踪 iteration timing / subagent timing / degradation detection

---

## v2.4 已完成（2026-05）— 中期改进全部交付

- ✅ **Agent Teams → 独立 Subagent 迁移** — 见 `.forge/archive/2026-04-29-agent-team-migration/`
  - `/forge review`：三层评审改为独立 Subagent 并行 + 主 Agent 汇总（`subagent-runner.ts` 的 `buildSubagentInvocations` + `runSubagentsInParallel`）
  - `/forge decide`：四视角决策改为两轮 Subagent（并行评估 + critic 交叉审查）
  - `/forge build` 全量路径研究阶段：独立 Subagent 并行研究
  - 保留 `skills/forge-decide-teams/` 作为 PoC，跟进官方 Agent Teams 演进
- ✅ **上下文预算管理** — `src/context-budget.ts` 实现 CLASSIFICATION_MAP + 六种 trimmer
  - `Explore_Summarizer`：Explore 结果摘要化（文件签名 + 关键入口）
  - `Review_Summarizer`：Review 报告只保留 findings 列表
  - `Test_Output_Trimmer`：vitest 只保留失败用例和摘要
  - `Git_Output_Limiter`：git diff/status 超阈值时只展示文件列表
  - `Subagent_Summary_Protocol`：定义"留 context"vs"丢弃"协议
  - 四种信息生命周期：`persistent` / `phase-scoped` / `ephemeral` / `write-and-discard`
- ✅ **错误恢复策略** — `src/error-recovery.ts`
  - `Git_State_Scanner`：基于 git log 重建执行状态
  - `buildReconciliationPatch`：commit/progress/status 三方对齐
  - 中断点精确定位：区分"未提交"/"已提交未更新 progress"/"progress 更新 phase 未推进"
  - `/forge resume --from-pr` 跨会话恢复
- ✅ **Plugin 分发**（`.forge/decisions/2026-05-12-plugin-distribution.md`）
  - `.claude-plugin/plugin.json` + `marketplace.json` 官方插件分发
  - 22 个 slash command 自动生成（`scripts/gen-plugin-commands.mjs`）
  - CI `plugin-validate` job 验证 manifest + 版本同步
  - 保留 clone（Forge Loop 开发者）+ dist（企业内网）双通道
- ✅ **CC Purge 集成**（`.forge/decisions/2026-05-12-cc-purge-integration.md`）
  - `scripts/archive-spec.sh --purge-cc=ask|skip|auto` 集成 `claude project purge`
  - 两提示流（dry-run + confirm）、manifest-first、worktree-aware、黑名单保护
- ✅ **MCP Server 集成** — `src/mcp/`（server + tools + trimmers + schemas）暴露 Forge 能力为 MCP tool
- ✅ **CCBP Hardening Phase 2**（`.forge/archive/2026-05-12-ccbp-hardening-phase2/`）— hooks dispatcher 统一 + 参数校验

---

## v2.5 / v2.6 — 瘦身 + 与官方原生能力对齐（进行中）

> **战略定位**：Claude Code 过去一年新增了 Skills、Plugins、Subagents、Checkpointing、Auto Memory、Worktrees、Agent Teams、`/loop`、`/goal`、`/code-review`、`/ultrareview` 等能力。Forge 应站在官方原语之上，只保留方法论差异化，避免重复造轮子。

### v2.5 目标 — 收缩与官方重叠的基础能力

- **`/forge recap`** 改为轻量 wrapper，依赖官方 `/compact` + `/context`
- **`/forge resume`** 基础层依赖官方 `/resume` + Checkpointing，只保留"五问题结构化"和 `--from-pr`
- **`/forge abort`** 只做归档 `.forge/status.md` + 重置，停止重复实现中止逻辑
- **`/forge learn`** 裁掉 Auto Memory 已覆盖的内容（build commands / debugging notes），聚焦跨项目 ADR 和五维度结构化沉淀
- **`/forge review`** 安全层/质量层改为可选委托给官方 `/code-review` + `/security-review`，保留 Spec-alignment 层作为差异化
- **Forge Loop 定位刷新** — 文档重写，从"自主执行"改为"带工程纪律的自主执行"，明确对比 `/goal` 和 `/loop` 的差异（Git 事务、熔断器、质量门禁、Spec 对齐）

### v2.6 目标 — skill 归位 + 数量精简

- **`forge-mutate` 归位到 pack** — 当前依赖 pack 声明的 `mutation_critical_modules` 才有意义；改为随 pack 启用自动注册，不再常驻主包 skill 列表
- **`forge-refactor` + `forge-fix` + `forge-fix-conflicts` 整合评估** — 三者命令序列相近，考虑合并为 `forge-maintenance` 单 skill 的三个子命令
- **`forge-accept` + `forge-verify` + `forge-ship` 职责明确化** — 不一定合并，但 README 和文档需要讲清楚三者的决策边界
- **`forge-grill` / `forge-zoom-out` 使用率评估** — 跟踪实际调用频次，若低则并入 `decide` / `debug`
- **目标**：主包 skill 数量从 30 降到 ~20，plugin.json 和 README 对齐真实命令集

### v2.5 / v2.6 明确保留（不动）

- `skills/forge-decide-teams/` — PoC 跟进 Agent Teams 趋势，每季度评估
- `cmux-skills/forge-loop-signals/` — opt-in 可视化，30 行声明式文件，零维护成本
- `/forge control-cli` + `/forge control-ui` — 是 `/forge test` 三态验证体系的执行层，不是通用 harness
- `forge-storm` — 是 `/forge spec` 的前置方法论能力，对 DDD 项目有独有价值
- `forge-pack-pms` — 本来就在 `packs/` 目录，不是主包 skill，无需调整

---

## 剩余中期项（未完成）

- **Events_NDJSON 多消费者扩展**（优先级：中）
  - 当前：cmux Mirror_Daemon 单消费者
  - 目标：IDE 插件（VS Code 状态栏）、Web Dashboard、CI 集成报告器
  - 字节游标协议已就位，无需协议改动

- **cmux claude-teams 模式**（优先级：低，阻塞中）
  - 利用 cmux 多窗格为 `/forge decide` 和 `/forge review` 多 Subagent 提供可视化面板
  - 阻塞条件：等待官方 Agent Teams 可靠性问题解决（见 v3.0 长期项）

---

## 长期 — v3.0（社区与生态）

面向社区开放，构建可扩展的 AI 编码工作流生态。

- **Agent Teams 重新评估**（阻塞条件：Claude Code 官方解决以下问题）
  - 会话恢复：`/resume` 能恢复 in-process teammates（当前官方文档明确标注为已知限制）
  - 状态持久化：team config 在 context compaction 后不丢失（[#23620](https://github.com/anthropics/claude-code/issues/23620) Open）
  - Shutdown 可靠性：teammates 关闭不阻塞主流程
  - 内存 GC 不破坏 team membership（[#29271](https://github.com/anthropics/claude-code/issues/29271) Open）
  - SendMessage 接收者验证（[#25135](https://github.com/anthropics/claude-code/issues/25135) Open）
  - **跟进策略**：每季度检查上述 issues 状态
  - **回迁判定**：Agent Team 仅用于需要多轮持续对话的场景；fan-out → gather → merge 模式永久使用独立 Subagent

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
5. **Property-based Testing 文化** — 133 个 PBT 文件
6. **三层独立评审中的 Spec-alignment 层**
7. **Forge Loop 的工程纪律** — Git 事务、熔断器、指数退避、完成摘要、PUA 引擎
8. **Domain Pack 机制** — PMS pack 作为示例
9. **证据化三态验证**（VERIFIED / NOT_VERIFIED / INCONCLUSIVE）+ control-cli/ui 执行层
10. **事件风暴（storm）作为 `/forge spec` 的 DDD 前置**

---

*本路线图会随项目进展持续更新。具体排期和优先级可能根据社区反馈和实际需求调整。*
