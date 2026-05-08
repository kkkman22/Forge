# Forge v2.3.0 技术评审报告

**评审对象**：`/Users/king/code/Forge`（forge-loop@2.3.0）
**评审范围**：整个代码仓库的结构、架构、代码质量、测试、文档、安全与交付
**评审时间**：2026-05-07
**评审方法**：文件结构扫描 + 源码/配置抽样阅读 + 已有审计文档（`forge-v2.3-executive-audit.md`、`findings/`、`ROADMAP.md`）交叉验证

---

## 0. 综合评分

| 维度 | 分数 | 趋势 | 说明 |
|------|------|------|------|
| 架构设计 | 8.5 / 10 | ⬆ | 事件溯源 + 纯函数状态机 + 分层抽象非常清晰，Loop/Skills 两栈融合已形成 |
| 代码质量 | 8.8 / 10 | ⬆ | 全仓几乎无 `as any`/`@ts-ignore`，错误层级规整，纯函数占比高 |
| 测试与 CI | 7.0 / 10 | → | 单元与属性测试扎实，整合/端到端仍偏弱，覆盖率门禁偏低 |
| 文档 | 7.5 / 10 | → | README / CLAUDE.md / SECURITY.md 完整，API 文档已生成，国际化覆盖不足 |
| 项目管理 | 7.0 / 10 | ⬇ | `.forge/specs` / `.forge/plans` 并行进行中的任务超过 20 项，WIP 过大 |
| 安全 / 生产就绪 | 7.8 / 10 | ⬆ | 5 层防御模型 + 审计流程成熟；`bypassPermissions` 高度依赖 hook，是潜在单点 |
| **综合** | **7.9 / 10** | ⬆ | 同比 2026-05-01 审计略升（Loop × Skills 融合、SdkDriver 重构、i18n、API 文档已落地） |

一句话结论：Forge 是一个工程纪律**罕见地严谨**的开源项目，把"AI 工作流"做成了可被审计的工程系统；当前主要短板是**测试金字塔倒挂**、**WIP 过多**、以及对 **Claude Agent SDK / PreToolUse Hook** 两个外部边界的**信任假设**。

---

## 1. 仓库全景

| 项 | 值 | 备注 |
|----|----|----|
| 运行时 | Node ≥ 20，ESM，TypeScript 5.9 strict | 现代 |
| 源代码 | 113 个 `.ts` 文件 / ~31.4K 行 | 在 src/ 根目录下 |
| 测试代码 | 237 个 `.ts` 文件 / ~65.4K 行，其中 115 个属性测试（fast-check）| 测试:源码 ≈ 2.08:1 |
| Skills | 19 个 SKILL.md / ~226K 字符 | `forge-router / decide / spec / plan / build / review / test / ship / learn / debug / resume / status / abort / grill / refactor / fix / loop / zoom-out / build-light` |
| Agents | 10 个角色文件 | product / architect / security / designer / critic / explore / debugger / spec-check / quality-check / security-check |
| 入口 | `/forge`（Claude Code skill 命令）+ `forge-loop`（独立 CLI，Agent SDK 驱动） | 双形态 |
| 依赖 | 5 个 runtime、7 个 dev | 精确版本锁定，无 `^` 范围 |
| CI | `check / security-audit / security-audit-nightly / bench / verify-dist / publish` 六个 job | GitHub Actions，Node 22 |

文件体积分布上，`learn.ts (1174)`、`decide.ts (1095)`、`error-recovery.ts (1050)`、`grill.ts (983)`、`state.ts (922)`、`forge-loop-cli.ts (908)` 是"长文件大户"，但经过 v2.2.1 重构 `sdk-driver.ts` 已从 1400 行下降到 489 行（改为 thin orchestrating shell + 抽出 `sdk-generic-iteration.ts / sdk-skill-iteration.ts / sdk-status-helpers.ts` 等模块），这是本季度最显著的架构收益。

---

## 2. 架构评审

### 2.1 核心是一个纯事件驱动状态机

`orchestrator.ts` 是整条 Loop 的心脏，全部为纯函数：

- `createInitialState()` → 零副作用的初始状态；
- `transition(state, event, limits)` → 接收 `OrchestratorEvent`（7 种）返回 `{ state, effects[] }`；
- 副作用都表述为 `OrchestratorEffect` 数据（commit / rollback / start_backoff / abort / stop / schedule_iteration / ship_*）；
- 终态守卫（aborted / stopped 拒绝所有事件）、idle 守卫（只接 start），并用 TypeScript `never` 做穷尽检查。

这是教科书式的"可测试状态机"。配合 `failure-handler.ts` 的熔断器（`shouldCircuitBreak`）与指数退避（`calculateBackoffMs`），构成了非常干净的"失败即回滚"回路。

### 2.2 分层抽象清晰，可替换性强

```
 forge-loop-cli.ts (CLI / 信号处理 / 参数解析)
        │
        ▼
 SdkDriver (run loop, i18n, observability, PUA, sandbox, skill-aware)
        │
 ┌──────┴──────┬────────────────┬────────────────┐
 ▼             ▼                ▼                ▼
 Orchestrator  EffectExecutor   AgentInterface   StatusFileIO
 (pure FSM)    (git/commit/...) (SDK 适配)       (状态读写)
```

- `AgentInterface`（在 `loop-types.ts`）是唯一的 Agent 抽象，`SdkAgentAdapter` 是 Claude SDK 的**唯一绑定点**。要替换为 Codex / Rovodev 只需实现这一个接口。
- `loop-types.ts` 是零导入的类型枢纽，**系统化地避免循环依赖**——这是很多大型 TS 项目都做不好的事。
- `SdkDriver` 把 skill-aware 与 generic 两条路径分别委派给 `sdk-skill-iteration.ts` 和 `sdk-generic-iteration.ts`，主类只剩 489 行、明确只做"编排"。

### 2.3 双栈融合（/forge × forge-loop）已经走通

v2.3 的关键演进是把 SKILL 结构化流程和自主循环拼在一起：
- `SKILL_COMMAND_SEQUENCES`（在 `skill-scheduler.ts`）给 light/standard/full 定义了 skill 阶段序列；
- `execution-mode.ts` 的 `resolveConfirmation()` 为 11 个确认点定义自主模式预设策略；
- StatusFile 持久化 `mode / loop_run_id / loop_iteration / skill_sequence / phase / tier`，重启后可从中恢复；
- `evaluateQualityGateForPhase()` / `evaluateReviewGate()` 复用交互模式的门禁逻辑，review-fix 循环由 `reviewFixAttempts` 做熔断。

这让 Forge 在业界形成了一个**差异点**：不是"跑一个 prompt loop"，而是"跑一个有阶段、有门禁、有可恢复状态的工作流 loop"。

### 2.4 三维路由 + 行为提示

`router.ts` 把任务分析拆成：
- **Tier**（决定命令序列）
- **TaskType**（决定"怎么做"）
- **ProjectPhase**（决定"强调什么"）
- **WorkNature**（feature / refactor / bugfix，决定命令序列变体）

判定优先级**用户覆盖 > 全量信号 > 标准 > 轻量 > 默认 standard**，口号是"宁重勿轻"——这种"偏保守"的默认值选择很明智，符合 AI 自动决策容易过度乐观的实际情况。

### 2.5 状态保护分区：机制层面漂亮，执行层面有暴露面

三级分区 `frozen / guarded / open` 的设计非常干净：
- 物理上由 `hooks/hooks.json` 的 PreToolUse Hook 拦截 Write/Edit/Bash；
- 逻辑上由 `check-frozen.ts` / `state.ts` 的 `getProtectionZone()` 统一裁决；
- 并把 `src/prompt-defense-patterns.ts` 追加为**源码级硬冻结**（repo-level policy-lock），即使不在 `.forge/` 也拒绝修改。

**但要注意**：
1. PreToolUse Hook 是 **bash shell 字符串**，用 `grep -oE` 从 `$TOOL_INPUT` 中抓 `.forge/...` 路径，对 **命令行拼接、反引号、空格编码、多命令串联** 等变体的健壮性依赖 grep 正则；
2. `2>/dev/null` 让 fallback 路径的**错误输出**被吞没（退出码保留），生产线上 Hook 是否实际生效很难从日志侧观察；SessionStart / UserPromptSubmit 里的辅助 hook 带 `|| true`，失败会被完全静默；
3. `SdkDriver.run()` 里会调用 `validateHooksPresence()`，但只输出 `console.warn` 不阻断，意味着"hook 丢失"时依然会以 `bypassPermissions` 运行。

这是本评审最大的**架构层风险**——详见第 7 节。

---

## 3. 代码质量

### 3.1 类型纪律

- 全仓 `as any` / `@ts-ignore` / `@ts-expect-error` **0 处**（命中的一次 `any` 仅出现在注释中）；
- `tsconfig.json` 启用 `"strict": true`；
- `BranchValidationError extends Error` 等错误子类附带 `readonly code` 常量字面量，做到 machine-readable；
- 接口广泛使用（`loop-types.ts` 单文件就定义了 15+ 对外接口）；
- 字段命名风格前后一致（camelCase for TS / snake_case 出现在 StatusFields 以对齐 YAML frontmatter）。

### 3.2 错误与日志

- `ForgeError → CliError / FrozenZoneViolation / UnexpectedEffectError / PromptDefenseError / BranchValidationError` 层级清楚；
- 有统一的 `src/logger/`（types / log-entry / log-sink / log-file-writer / timing），`createLogEntry(event, level, message, context, metadata)` 是标准入口；
- **但还有 12 个文件使用 `console.*`**（`forge-loop-cli.ts / run-manager.ts / failure-sink.ts / mcp/server.ts / orphan-detector.ts / pua-state-manager.ts / sdk-status-helpers.ts / sdk-quality-helpers.ts / sdk-skill-detection.ts / check-frozen.ts / process-registry.ts / logger/log-sink.ts`），内部一致性未完成迁移；尤其讽刺的是 logger 自身的 `log-sink.ts` 也还在 console 之列。

### 3.3 纯函数占比

纯函数模块分工非常细：`plan.ts / ship.ts / review.ts / learn.ts / debug.ts / test-engine.ts / router.ts / spec.ts / task-graph.ts / state.ts / frontmatter.ts / orchestrator.ts / failure-handler.ts / git-transaction.ts / context-accumulator.ts / agent-output.ts / error-recovery.ts / fix-checklist.ts / fix-recovery.ts / incremental-verifier.ts / episode.ts / pattern-stats.ts / evolution-marker.ts / backlog.ts / branch-lifecycle.ts / ...`

这种"引擎纯函数 + 驱动/适配有副作用"的模式使单元测试成本极低，property-based 测试能够直接发力。

### 3.4 值得注意的反模式

- `src/index.ts` 是一个**非常大的 barrel file**，对外 export 了大量本来属于内部的模块（`error-recovery` 23 个函数、`pattern-stats`、`episode`、`orphan-detector`、`process-registry`、`status-resolver`…）——这**对 semver 非常不友好**，一旦 npm 发包后很难收回。建议分一次重构把"真的是公共 API"和"只是跨模块内部导出"分开。
- `error-recovery.ts` 23 个 exported 函数，内部凝聚度偏弱，命名空间偏扁；长期可考虑按 `classification / reconciliation / scanning` 拆成子模块。
- `learn.ts / decide.ts / grill.ts / forge-loop-cli.ts` 每个都超 900 行，里面混合了多个职责（知识文档生成 + 维护 + 术语回写 + 反馈分析…），拆分为子模块会更容易维护。

---

## 4. 测试与 CI

### 4.1 亮点

- **属性测试规模罕见**：115 个 `*.property.test.ts`，32.8K 行，使用 fast-check 验证不变量（分支名 round-trip、frontmatter 解析、三级状态机转换、DAG 调度、I/O 序列化…）。这是整个仓库最值得炫耀的工程资产。
- **覆盖率**：README 声明 89.35% statements / 89.62% branches / 95.2% functions，来源可信（`npm run check` 入口本身就包含覆盖率）。
- **CI 边界质量验证丰富**：shellcheck、hooks.json JSON schema、SKILL.md frontmatter `name:` 字段完整性、README metrics 校验、skill function 引用校验、skill description 校验、skill 长度校验、evolution-marker 区域校验——共 5 个脚本级 linter。
- **性能基线**：bench job 在 PR 上跑 vitest bench 并与 main 基线做对比（阈值 1.20），渲染成 PR 评论——这在开源项目里属于高水位的工程实践。

### 4.2 短板

1. **整合测试 9 个 / 端到端 0 个**：属于一个 CLI 工具的明显盲区。`forge-loop` 的"创建 worktree → 若干轮 agent 调用 → 清理 → 备份 notes"全链路没有真实环境 E2E 测试，只有 `sdk-driver-integration.test.ts` 这种带 mock agent 的半整合测试。
2. **覆盖率门禁偏低**：`vitest.config.ts` 中 branches=70%，而项目实际达到 89.6%，实际 baseline 完全可以上调到 80% 甚至 85%，把"不会倒退"这件事变成合约。
3. **部分 skip 测试 / 已存在的失败用例**未在评审材料中全量披露（审计报告提到 3 个 pre-existing test failures），需要纳入 quality gate。
4. **bench 仅对比，不阻断**：没有性能回归阻断门禁，长期会积累"温水煮青蛙"。

---

## 5. 文档

### 5.1 优秀

- **README.md 556 行**，既有 30 秒 Bug 修复演示、5 分钟新功能演示、也有初始化脚本说明、12 命令速查、三维路由详解、状态目录结构、forge-loop 架构图——完整度很高。
- **CLAUDE.md 是一份"项目宪法"**：分 6 节（Task Routing / Execution Discipline / Review / Knowledge / Self-Evolution / Session Boundaries），详版在 `docs/forge-constitution-detail.md`。
- **SECURITY.md** 完整定义私报渠道、SLA（3 天响应 / 14 天 critical 修复）、支持版本、CVE/GHSA 记录格式、`[SECURITY]` 条目必须关联 ADR。
- **CHANGELOG.md** 回溯到 1.0.0，每条安全修复显式 `[SECURITY]` 前缀 + ADR 号链接。
- **ADR 体系**：`.forge/decisions/ADR-*.md`（模板 + auto-numbering + index + supersession + Jaccard 相似度匹配），长期可追溯。
- **API 文档**：`docs/api/` 已由 `typedoc` 生成，并纳入 CI `npm run docs` 校验。

### 5.2 待加强

- **README 国际化**：面向国际受众的英文入口文档缺失（README 中文为主，`examples/*/README.en.md` 存在但 skill 层几乎全中文）。
- **references/ 补全情况**：审计曾指出"6 files reference references/ subdirectories that don't exist"。本次核实时 `skills/forge-build/references/` 已齐备 12 个 MD 文件（`anti-drift / branch-gate / change-summary / closure-probes / context-budget / dependency-discipline / failure-patterns / function-contracts / no-mid-build-confirmation / status-updates / subagent-orchestration / tdd-rules`），SKILL.md 中引用的 4 个全部命中，此问题已在 v2.3 周期修复，不再是风险项。仍需 follow-up 的是 `forge-review / forge-plan / forge-ship` 等其他 skill 的 references 目录是否齐备。
- **Hello World 教程 / 故障排查 FAQ / 端到端场景**少，上手门槛偏高。
- **技术栈迁移提示缺失**：TypeScript strict + ESM + 仅 Node 20+，对于 CommonJS 习惯用户没有过渡指引。

---

## 6. 项目管理与演进

### 6.1 过高的 WIP

`.forge/plans/` 下有 **26 个 plan 文件**，`.forge/specs/` 下有 **8 个活跃 spec**（`agent-team-migration / branch-lifecycle-enforcement / error-recovery-strategy / parallel-status-tracking / ship-delivery-unification / skill-function-integration-audit / structured-observability / token-budget-compression`）。加上 archive 中刚归档的 `agent-team-migration` 与 `ship-delivery-unification`，过去几周至少有 10+ 条并行工作线。

这是个典型的"太多 WIP"信号。从 dogfooding 观察（发现 6：Context Window 压力）和审计报告（"Progress files show some plans spanning 2-3 sessions"）都能看到项目正在为 **context 预算 + 并行上下文切换** 付出成本。

**建议**：限定一次只做 3–4 个 spec，用 WIP 限制而不是"多就是好"。

### 6.2 SKILL 与纯函数的对接度仍然偏低

`findings/skill-function-audit.md` 明确指出：**30 个 exported 函数中 ✅ 已对接 0 个，⚠️ 概念引用 16 个，❌ 未对接 2 个**——这是真正值得优先处理的内部一致性问题。SKILL.md 中很多"Merge_Review_Findings"、"Explore_Summarizer"等概念名与 `src/*.ts` 的具体函数名之间没有显式映射，会出现"SKILL 说要做 X，但 SKILL 并没有告诉 AI 调用哪个函数"的对接断层。好在 `check-skill-function-refs.sh` 已经作为 CI 的一部分在检查，但覆盖度看起来还不够。

### 6.3 自进化机制是亮点

`.forge/knowledge/evolved-rules.md`（规则化错误预防）、`instincts.md`（置信度打分的经验模式库）、`known-failures.md`、`rule-changelog.md`、`pattern-stats.ts`（Pattern / Episode / Upgrade）——这套结构让项目从"一次性的工作流"变成了**自带反馈回路的可学习系统**。当前 rule_count=0、三条 instinct 都已记录，是一个**刚启动但方向正确**的资产积累。

---

## 7. 安全评审（重点）

| 层 | 机制 | 评价 |
|----|------|------|
| 1. 工具调用 | PreToolUse Hook + `check-frozen.js` | 思路正确，执行脆弱（下面说明） |
| 2. Shell 注入 | `git-transaction.ts` 纯函数构造 `{executable, args[]}`，执行走 `execFileSync` | 优秀，已把"禁止字符串拼 shell 命令"做成纪律 |
| 3. 输入威胁 | `prompt-defense.ts` + `prompt-defense-patterns.ts`（后者是硬冻结源文件） | 思路和层级都对，pattern id（非内容）写入 log 避免 PII 泄漏是高质量设计 |
| 4. 依赖供应链 | `minimatch: 10.2.5` 等精确版本；`npm audit --audit-level=high`；`check-deps.mjs` 做 typosquatting 防御 | 扎实 |
| 5. 不变量 | 115 个属性测试 | 业界一流 |
| 6. 安全披露 | SECURITY.md SLA + ADR 追溯 | 流程完整 |

### 7.1 最大的单点风险：`bypassPermissions` + Hook

`src/sdk-agent-adapter.ts` 显式启用 `permissionMode: "bypassPermissions"` + `allowDangerouslySkipPermissions: true`，把 SDK 内建的交互式权限提示完全绕过。随后依赖：

1. `.claude/settings.json` / `hooks/hooks.json` 的 PreToolUse hooks；
2. 这些 hooks 调用的是 `node forge/dist/src/check-frozen.js "$TOOL_INPUT_FILE" 2>/dev/null || node ~/.claude/skills/forge/dist/src/check-frozen.js ... 2>/dev/null`——**stderr 被 `2>/dev/null` 完全吞掉**，用户无法看到失败原因；退出码会保留为 fallback 路径的值，fail-closed 依赖 Claude Code **严格尊重非零退出码**这个隐式合约。当 Node 完全不在 PATH 时两条命令都会 exit 127，客户端若把 127 当作"无事发生"就会直接放行。
3. `SdkDriver.run()` 启动时 `validateHooksPresence()`，但**只 warn，不阻断**。

**含义**：只要 `dist/src/check-frozen.js` 没构建、Node 不在 PATH、hooks.json 配置被覆盖，或 Claude Code 不严格校验退出码，Loop 进程依然以"绕过所有权限"的身份继续跑，并且**用户很可能不会察觉**——这是四个隐式前提叠在一起的信任假设。

**建议**（按成本由低到高）：
- 短期：把 `validateHooksPresence` 失败的日志从 warn 升为 error，要求 `--force-no-hooks` 显式覆盖；**同时在 check-frozen 命令里加一层 trap，Node 缺失 / dist 未构建时以 exit 2 显式终止，而不是让 exit 127 混入被忽略的噪声里**；
- 中期：把 PreToolUse 的 grep + shell 抽取逻辑迁移到纯 Node.js 脚本，统一 tool-input 解析与错误传播，消除 `2>/dev/null` 对 stderr 的吞噬；
- 长期：实现 `--sandbox` 的强制走 sandbox policy（已有 `sandbox-policy.ts` 基础），在非 sandbox 模式下保留 hook 保护，但允许审计日志溯源。

### 7.2 其他小风险

- `orphan-detector.ts` 使用 `execSync("ps -eo pid,ppid,etime,command")`——`execSync` 而非 `execFileSync`，虽然命令是常量字符串无注入风险，但**与其它模块的"一律 execFileSync + argv"纪律不一致**，建议改写；
- `hooks/hooks.json` 中 `UserPromptSubmit` 钩子里的 `head -50 .forge/plans/*.md` 在 plan 文件特别多时会把**所有 plan 的前 50 行都贴进每条 prompt**——这是 dogfooding 发现 6"Context Window 压力"的直接贡献者；
- `src/prompt-defense-patterns.ts` 为硬冻结源文件，但其**加载方式**（pattern 是 TS 常量而非外部资源）意味着要新增 pattern 就必须改码并过 ADR 流程；对于一些需要快速反应的对抗样本，这个环可能慢。

---

## 8. 关键风险清单

| # | 风险 | 严重度 | 建议处置 |
|---|-----|--------|----------|
| R1 | `bypassPermissions` 启用后，hook 生效依赖"Claude Code 尊重非零退出码 + hooks.json 存在 + Node 在 PATH + dist 已构建"四个隐式前提，任一失守时 `SdkDriver` 只 warn 不阻断 | 高 | 把 hooks 缺失/失败升为阻断级日志；check-frozen 里显式 trap；sandbox 强化 |
| R2 | 并行 WIP 过大（25 个 plan / 8 个 active spec） | 中 | 引入 WIP 上限；锁定 2.4 版本只做 2–3 条线 |
| R3 | SKILL ↔ 纯函数对接低（0 已对接 / 2 未对接 / 16 概念引用） | 中 | 持续推进 `skill-function-integration-audit` spec |
| R4 | 整合 / 端到端测试不足（9 integration / 0 E2E） | 中 | 优先补 forge-loop 5 条核心路径的 E2E |
| R5 | `src/index.ts` 公共 API 面过大，难以 semver 演进 | 中 | 拆分为 `@forge-loop/core` / `internal` 两层 |
| R6 | `console.*` 未完全迁移到 logger（11 个文件） | 低 | 列入 v2.4 clean-up |
| R7 | 覆盖率门禁偏低（branches=70%） | 低 | 提升至 85%，作为不回归防线 |
| R8 | Claude Agent SDK 锁定在 `0.2.119`（pre-1.0） | 中 | 订阅 SDK changelog，准备兼容层 |
| R9 | `learn.ts / decide.ts / grill.ts / forge-loop-cli.ts` 单文件 ≥ 900 行 | 低 | 渐进式拆分为子模块 |
| R10 | Hook 里 grep 抽取路径对路径特殊字符鲁棒性有限 | 中 | 迁移 hook 为 Node.js 脚本，统一路径解析 |

---

## 9. 优先改进建议

### P0（2 周内）
1. **加强 hook 缺失感知**：`validateHooksPresence` 失败从 warn 改为 error（默认阻断），通过 `--force-no-hooks` 允许覆盖；**同时在 check-frozen 命令里加一层 trap，Node 缺失 / dist 未构建时以 exit 2 显式终止**，避免 exit 127 被客户端当作"无事发生"；添加一条属性测试验证 `bypassPermissions` 路径必须在 hooks 存在的前提下生效。
2. **补 E2E 测试**：为 `forge-loop` 至少覆盖五条关键路径（成功 / 软失败 / 硬失败 / worktree 模式 / 中断恢复）；用 mock Claude SDK + 真实 git 仓库。
3. **收敛 `src/index.ts` 的公共 API 面**：只保留真正意图被 npm 使用者消费的符号，将 internal utilities 移至 `src/internal/` 子目录不在 barrel 中对外导出。

### P1（1 个月内）
4. **限定 WIP**：把活跃 spec 控制在 ≤ 4；把 `.forge/plans/` 里的 25 个 plan 按优先级分层归档。
5. **提升覆盖率门禁**：`branches 70 → 85`、`statements 80 → 90`，与实际水位对齐。
6. **SKILL–函数映射审计**：把 `findings/skill-function-audit.md` 里 16 条"概念引用"逐条补齐成显式函数调用约定；CI 增加"SKILL 中提到的函数必须存在于导出中"校验。
7. **完成 `console.*` → `logger` 迁移**：11 个文件收尾。
8. **英文文档一线**：至少把 README / Quickstart / SECURITY 做一份对等英文版，其他 skill 文档分阶段。

### P2（1–2 个月）
9. **迁移 Bash hook 为 Node.js**：消除 `grep -oE` 的路径鲁棒性问题，统一 tool-input 解析与错误传播。
10. **拆分长文件**：`learn.ts / decide.ts / grill.ts / forge-loop-cli.ts` 按职责拆分；`error-recovery.ts` 按 classification / reconciliation / scanning 三组拆分。
11. **性能基线入门禁**：`bench` 结果若相对 main 回归超过阈值且未说明，阻断 PR 合并。
12. **SDK 兼容层**：抽象一层 thin wrapper 适配 `@anthropic-ai/claude-agent-sdk`，为未来 SDK 升级 / Codex 回迁做准备。

---

## 10. 最终评价

Forge v2.3.0 最打动我的点：

- **把"AI 工作流"当工程系统写**——纯函数状态机 + 事件溯源 + ADR + frozen 保护分区 + 属性测试 + 自进化知识库，每一块都落到具体代码与 CI 检查；
- **敢于自审**——`forge-v2.3-executive-audit.md`、`findings/dogfooding-observations.md`、`findings/skill-function-audit.md` 写得比大部分外部评审还诚实；
- **工程纪律同业少见**——全仓 0 `as any`、0 `@ts-ignore`、115 属性测试、精确版本锁定、`[SECURITY]` + ADR 绑定。

最需要警惕的点：

- **权限绕过 + hook 依赖**是系统的"单点信任"，任何侧链失守都会放大影响；
- **并行 WIP 过大**会慢慢侵蚀"严谨"这个核心竞争力；
- **对外 API 面 / SDK 依赖**还没有 semver 保护层，npm 发包后每一次重构都在"公开面"。

如果接下来一个季度能把 **P0 + P1** 落地，Forge 有机会从"高质量的 personal project"升格为"值得被社区严肃采用的基础设施"。这份底子，值得。

---

*评审者：Kiro / Claude Opus 4.7*
*参考文献：forge-v2.3-executive-audit.md、.forge/findings/dogfooding-observations.md、.forge/findings/skill-function-audit.md、ROADMAP.md、CHANGELOG.md*
