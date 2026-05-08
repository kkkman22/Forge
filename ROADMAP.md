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
  - **Skills 双模式运行**：`execution-mode.ts` 实现 `interactive` / `autonomous` 双模式；`resolveConfirmation()` 为 11 个确认点定义自主模式预设策略（router→auto-detect、plan→auto-approve、build→continue、review→auto-fix、ship→keep branch，以及 refactor/fix 流程）
  - **状态感知**：`SdkDriver.executeSkillAwareIteration()` 每轮读取 StatusFile，提取 phase/tier/loopFields；`initializeLoopFields()` 启动时写入 `mode: "autonomous"`、`loop_run_id`、`loop_iteration`、`skill_sequence`；`clearLoopFieldsOnShutdown()` 结束时清除
  - **门禁复用**：`evaluateQualityGateForPhase()` 在每轮迭代后评估质量门禁；`evaluateReviewGate()` 复用 review P0/P1 逻辑；`reviewFixAttempts` 管理 review-fix 循环熔断
  - **分发包可用**：Loop 核心逻辑通过 `forge-loop` npm 包发布，分发包用户可通过 `npx forge-loop` 使用

- ✅ **平台抽象层**
  - `AgentInterface`（`loop-types.ts`）定义通用 Agent 接口：`name`、`run()`、`close()`
  - `SdkAgentAdapter` 是 Claude Agent SDK 的具体实现，是唯一导入 `@anthropic-ai/claude-agent-sdk` 的模块
  - `EffectExecutorInterface` 抽象 effect 执行层，与 Agent 实现解耦
  - 替换 Agent 只需实现 `AgentInterface`，无需修改 `SdkDriver` 或 `orchestrator`

- ✅ **国际化（i18n）支持**
  - `src/i18n.ts`：翻译引擎，支持点分隔路径查找、字符串插值、回退链（当前 locale → 默认 locale → key 原文）
  - `locales/en.json` + `locales/zh.json`：中英文翻译数据
  - `src/locale-detector.ts`：自动检测系统语言环境
  - CLI `--lang <zh|en>` 标志手动切换语言
  - `SdkDriver` 全链路 i18n：所有用户可见字符串通过 `this.t()` 翻译函数输出

- ✅ **API 文档生成（TypeDoc）**
  - `package.json` 配置 `typedoc`（v0.28.19），`npm run docs` 生成 API 文档
  - CI 流水线包含 `Verify docs generation` 步骤，保持文档与代码同步
  - `docs/api/` 目录包含完整的生成文档（classes、functions、interfaces、modules）

- ✅ **可观测性增强**（部分完成）
  - Token 使用量追踪：每轮迭代记录 input/output/cache tokens，累计统计
  - 结构化完成摘要：`formatCompletionSummary()` 输出 objective、tier、iterations、per-phase pass/fail、branch name、unresolved issues
  - 统一错误层次：`ForgeError` 基类 + `CliError`/`FrozenZoneViolation`/`UnexpectedEffectError` 子类，含 machine-readable `code` 字段
  - i18n 化的日志输出：所有 warn/error 通过翻译函数输出
  - ⏳ 结构化 JSON 日志格式（可选）— 未实现
  - ⏳ 命令执行耗时统计和性能基线 — 未实现

---

## 中期 — v2.x（剩余改进）

- **Agent Teams → 独立 Subagent 迁移**（优先级：高）
  - `/forge review`：三层评审从 Agent Team 改为独立 Subagent 并行执行 + 主 Agent 汇总（已验证可行）
  - `/forge decide`：四视角决策从 Agent Team 改为两轮 Subagent（第一轮并行评估，第二轮 critic 交叉审查）
  - `/forge build` 全量路径研究阶段：从 Agent Team 改为独立 Subagent 并行研究
  - 更新 `forge-review/SKILL.md`、`forge-decide/SKILL.md`、`forge-build/SKILL.md` 中的 Agent Team 配置章节
  - 更新 `CLAUDE.md` 和 `templates/CLAUDE.md` 中的 Agent Team 相关描述
  - 清理 `teams/` 目录和 `.claude/teams/` 参考配置

- **上下文预算管理**（优先级：高）
  - Explore agent 返回结果摘要化（文件签名 + 关键入口点，而非全量代码）
  - Review 报告只保留 findings 列表，分析过程写入独立文件不留在 context
  - 测试输出裁剪：vitest 只保留失败用例和摘要统计，通过用例静默
  - Subagent 结果摘要协议：定义"需要留在 context 的信息"vs"一次性消费后丢弃的信息"
  - git diff/status 输出限制：超过阈值时只展示文件列表 + 统计，不展示全量 diff

- **错误恢复策略**（优先级：高）
  - 会话中断后的自动恢复：基于 git log + progress.md + status.md 重建执行状态
  - `/forge resume` 增强：检测 git 中已完成但 progress 未标记的任务（commit 存在但 progress 未更新）
  - 长任务拆分策略：build 和 review 可在不同会话中完成，中间状态通过文件系统持久化
  - 中断点精确定位：区分"任务完成但未提交"、"已提交但 progress 未更新"、"progress 已更新但 phase 未推进"

- **可观测性增强（剩余项）**
  - 结构化 JSON 日志输出（可选格式，便于日志聚合工具消费）
  - 命令执行耗时统计和性能基线（每轮迭代 wall-clock 时间、Agent 调用延迟）

- **Events_NDJSON 多消费者复用**（优先级：中）
  - `.forge/events.ndjson` 事件流已由 cmux Mirror_Daemon 消费，未来可扩展更多消费者
  - 潜在消费者：IDE 插件（VS Code 状态栏）、Web Dashboard、CI 集成报告器
  - 字节游标协议允许并发读取，无需锁定

- **cmux claude-teams 模式**（优先级：低）
  - 利用 cmux 多窗格能力，为 `/forge decide` 和 `/forge review` 的多 Subagent 提供可视化面板
  - 每个 Subagent 在独立 cmux pane 中运行，主 Agent 在中央 pane 协调
  - 依赖 Agent Teams 可靠性问题解决（参见长期规划中的阻塞条件）

---

## 长期 — v3.0（社区与生态）

面向社区开放，构建可扩展的 AI 编码工作流生态。

- **Agent Teams 重新评估**（阻塞条件：Claude Code 官方解决以下问题）
  - 会话恢复：`/resume` 能恢复 in-process teammates（当前官方文档明确标注为已知限制）
  - 状态持久化：team config 在 context compaction 后不丢失（[#23620](https://github.com/anthropics/claude-code/issues/23620) Open）
  - Shutdown 可靠性：teammates 关闭不阻塞主流程（当前 shutdown 需等待当前请求完成）
  - 内存 GC 不破坏 team membership：v2.1.47-v2.1.59 的 GC 优化过度清理了 team 记录（[#29271](https://github.com/anthropics/claude-code/issues/29271) Open）
  - SendMessage 接收者验证：不存在的接收者应报错而非静默丢失消息（[#25135](https://github.com/anthropics/claude-code/issues/25135) Open）
  - **跟进策略**：每季度检查上述 issues 状态，官方解决后重新评估 `/forge decide` 和 `/forge review` 是否回迁 Agent Team 模式
  - **回迁判定标准**：Agent Team 仅用于需要多轮持续对话的场景（成员间实时依赖），fan-out → gather → merge 模式永久使用独立 Subagent

- **社区建设**
  - 贡献者指南完善和 issue 模板标准化
  - SKILL 插件机制：支持第三方开发和发布自定义 SKILL
  - 示例项目和最佳实践文档

- **沙箱执行环境**
  - 隔离的任务执行沙箱，限制文件系统和网络访问范围
  - 细粒度的权限控制模型，替代当前的 `bypassPermissions` 方案

- **多 AI 平台支持**
  - 基于平台抽象层，支持 Claude 以外的 AI 编码助手
  - 统一的 Agent 协议适配器
  - 跨平台的状态文件和工作流兼容

---

*本路线图会随项目进展持续更新。具体排期和优先级可能根据社区反馈和实际需求调整。*
