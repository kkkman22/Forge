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

## v2.2.1 待修复 — 上线审计发现项

> 来源：2026-04-27 上线前深度审核（第二轮），详见 `AUDIT_REPORT.md`。
> 以下问题均不构成上线阻断，但应在上线后尽快迭代修复。

### 🔴 高风险（优先修复）

#### H-1: SDK 权限绕过缺少运行时验证

**位置**: `src/sdk-agent-adapter.ts:119-134`

SDK 使用 `bypassPermissions` + `allowDangerouslySkipPermissions` 绕过内置权限检查，完全依赖上层保护机制（PreToolUse hooks、冻结区检查、状态门禁）。代码注释详细说明了设计决策，但没有运行时验证这些保护机制是否就位。如果 hooks 被误删或冻结区逻辑被绕过，Agent 可以不受限制地写入任意文件。

**修复方案**:
- 在 `SdkDriver` 启动时添加轻量级检查：验证 `hooks/hooks.json` 存在且包含 PreToolUse 配置
- 不阻断启动，但输出 `console.warn` 警告日志
- 添加集成测试：确认 hooks 缺失时输出警告

---

#### H-2: 并发 Worktree 创建存在竞态窗口

**位置**: `src/run-manager.ts:95-120`

`setupWorktree()` 先通过 `git worktree list` 检查活跃数量，再创建新 worktree。检查与创建之间存在 TOCTOU（Time-of-Check-Time-of-Use）窗口，两个并发调用可能同时通过并发限制检查，导致超出 `maxConcurrentWorktrees` 上限。

**缓解因素**: 实际使用场景中并发创建 worktree 的概率较低；Git 自身对 worktree 有一定的并发保护。

**修复方案**:
- 使用文件锁（如 `.forge/.locks/worktree.lock`）序列化 worktree 创建操作
- 实现带超时的锁获取，防止死锁

---

### 🟡 中风险（迭代修复）

#### M-1: Frontmatter 字段提取存在正则注入风险

**位置**: `src/frontmatter.ts:82`

`extractStringField()`、`extractListField()`、`extractNumericField()` 使用 `fieldName` 参数直接构造正则表达式，未转义特殊字符。当前代码库中 `fieldName` 均为硬编码常量，不接受外部输入，实际风险低。但作为公共 API，应做防御性编程。

**修复方案**:
```typescript
const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const regex = new RegExp(`^${escaped}:\\s*"?([^"\\n]*)"?\\s*$`, "m");
```

---

#### M-2: Effect 执行失败时错误分类不够精细

**位置**: `src/sdk-driver.ts:280-320`

当 effect 执行失败时（如 commit 被冻结区阻断），错误被统一处理为 `iteration_hard_failure`，没有区分"预期阻断"（冻结区违规）和"意外崩溃"（git 命令失败）。这导致冻结区阻断也会触发指数退避和熔断器，而非立即终止。

**修复方案**:
- 引入错误分类枚举：`FrozenZoneViolation`（预期）vs `GitCommandFailure`（意外）
- 冻结区违规直接终止循环，不触发退避

---

#### M-3: Backoff 计算的边界条件

**位置**: `src/failure-handler.ts:115`

`calculateBackoffMs()` 在 `consecutiveErrors = 0` 时返回 `baseMs * 2^(-1)` = 30 秒，虽然文档注释说参数"must be ≥ 1"，但没有运行时强制。调用方（orchestrator.ts）仅在 `consecutiveErrors >= 1` 时触发 backoff，实际风险低。

**修复方案**:
```typescript
export function calculateBackoffMs(consecutiveErrors: number, baseMs = DEFAULT_BASE_MS): number {
  return baseMs * 2 ** (Math.max(1, consecutiveErrors) - 1);
}
```

---

#### M-4: PUA 状态恢复中的静默错误吞没

**位置**: `src/sdk-driver.ts:410-435`

PUA 引擎状态恢复的多个 try-catch 块仅输出简短 `console.warn`，不包含完整错误堆栈（`err.stack`），增加了生产环境调试难度。

**修复方案**:
- 在 catch 块中记录 `err instanceof Error ? err.stack : String(err)`
- 考虑引入结构化日志，区分 warn/error 级别

---

#### M-5: Worktree 创建失败时分支未清理

**位置**: `src/run-manager.ts:130-155`

如果 worktree 初始化（`mkdirSync`）失败，清理逻辑会移除 worktree 但不删除已创建的 Git 分支，导致孤立分支 `forge/<name>` 累积。

**修复方案**:
```typescript
catch (initError) {
  try {
    execFileSync("git", ["worktree", "remove", "--force", worktreePath], { cwd: repoRoot });
    execFileSync("git", ["branch", "-D", branchName], { cwd: repoRoot });
  } catch {
    // 清理为尽力而为
  }
  throw new Error(...);
}
```

---

#### M-6: Agent 调用缺少超时机制

**位置**: `src/sdk-agent-adapter.ts:85-120`

Agent SDK 调用通过 async generator 迭代消息，但没有全局超时。如果 SDK 挂起，整个循环将无限阻塞。`AbortController` 可通过外部信号中断，但没有自动超时触发。

**修复方案**:
- 添加可配置的全局超时（默认 30 分钟），通过 `AbortController` + `setTimeout` 实现
- 超时后自动 abort 并触发 `iteration_hard_failure`

---

### 🔴 高风险 — 来源：功能逻辑自洽性审核（oc_ad.md）

> 以下问题来自第二份独立审核报告，经源码验证后确认有效且与上述条目不重复。

#### H-3: 分发包冻结保护完全失效（P0）

**位置**: `hooks/hooks.json:38-41`，`scripts/build-dist.sh:58-63`

`hooks.json` 中 PreToolUse Hook 调用 `node forge/dist/src/check-frozen.js`，但 `build-dist.sh` 只复制 shell 脚本（`check-frozen.sh`），不复制编译后的 `.js` 文件。由于 `2>/dev/null || ...` 的静默失败机制，Hook 失败时不报错，导致分发包用户的 `.forge/` 冻结保护完全失效。

**已验证**: `dist/claude-code/bundles/forge/` 中确实不存在 `dist/src/check-frozen.js`，仅有 `scripts/check-frozen.sh`。

**注意**: 此问题仅影响分发包用户（通过 `git clone` 安装的用户）。本地开发环境中 `dist/src/check-frozen.js` 存在，保护正常工作。

**修复方案**（二选一）:
- **方案 A**: 修改 `hooks/hooks.json`，将 `check-frozen.js` 调用改为 `check-frozen.sh`
- **方案 B**: 在 `build-dist.sh` 中增加 `dist/src/` 目录的复制

---

#### H-4: Worktree 删除导致 notes 永久丢失（P0）

**位置**: `src/run-manager.ts:281`，`src/forge-loop-cli.ts:294-312`

Notes 存储在 `worktreePath/.forge/runs/<runId>/notes.md`（worktree 内部）。当 `decideWorktreeCleanup` 决定删除 worktree（`commitCount === 0`）时，notes 文件随 worktree 一同被 `git worktree remove` 删除，迭代历史永久丢失。

**修复方案**: 将 notes 统一存储到 repo root 的 `.forge/runs/` 目录下，或在 worktree 删除前备份 notes 到主仓库。

---

#### H-5: notesContent 初始化与文件内容不一致

**位置**: `src/run-manager.ts:127-128`，`src/sdk-driver.ts:177-178`

`RunManager.setupNewRun()` 创建 `notes.md` 时包含 `branchName`：`formatNotesDocument({ runId, branchName, entries: [] })`。但 `SdkDriver` 初始化 `notesContent` 时不包含 `branchName`：`formatNotesDocument({ runId, entries: [] })`。第一次 `persistNotes` 后，文件中的 `Branch:` 行被覆盖丢失。

**修复方案**: `SdkDriver` 构造时传入 `branchName`，使初始 `notesContent` 与文件一致。

---

#### H-6: 熔断器阈值与 PUA L4 阈值不匹配

**位置**: `src/orchestrator.ts`（熔断器阈值 3），`src/pua-engine.ts`（L4 阈值 5+）

熔断器在连续 3 次失败时触发 abort，但 PUA L4（最高压力级别）需要 5+ 次连续失败才激活。这意味着 PUA L4 的高级压力响应永远不会被触发——循环在到达 L4 之前就已被熔断器终止。

**修复方案**（二选一）:
- 统一阈值：将 PUA L4 阈值降至 3（与熔断器一致）
- 明确设计意图并文档化：PUA 用于预警（L1-L3），熔断器用于停止

---

### 🟡 中风险 — 来源：功能逻辑自洽性审核（oc_ad.md）

#### M-7: resumeRun 方法存在但从未被调用

**位置**: `src/run-manager.ts:152-201`，`src/forge-loop-cli.ts`

`RunManager.resumeRun()` 有完整实现，但 CLI 入口从未调用。进程崩溃后重启会调用 `setupNewRun` 创建新 run，旧的 notes 和上下文丢失。

**修复方案**（二选一）:
- **方案 A**: 在 CLI 中添加 `--resume` 标志，连接 `resumeRun` 方法
- **方案 B**: 移除 `resumeRun` 及相关代码，明确文档化"不支持 resume"

---

#### M-8: abort 信号无法中断 effect 执行

**位置**: `src/sdk-driver.ts:289-297`，`src/effect-executor.ts`

`requestStop()` 的 abort 信号只传递给 Agent Adapter，不传递给 Effect Executor 的 commit/rollback 操作。用户发送 Ctrl+C 后，当前正在执行的 git 操作无法被中断，可能导致用户看到"已停止"但后台仍在执行 git 命令。

**修复方案**: 将 abort signal 传递给 `executeEffects`，在 effect 执行关键点检查 signal 状态。

---

#### M-9: sanitizeBranchName 未完全覆盖 Git 分支名限制

**位置**: `src/git-transaction.ts:79-96`

正则 `ILLEGAL_BRANCH_CHARS_RE = /[^a-zA-Z0-9\-_./]/g` 未排除 `~`、`^`、`*`、`[`、`:` 等 Git 非法字符。`@{` 替换只删除 `@` 留下 `{`。可能生成被 Git 拒绝的分支名，导致运行时 `git checkout -b` 失败。

**修复方案**: sanitize 后调用 `git check-ref-format --branch` 验证分支名有效性，或完善正则覆盖所有 Git 非法字符。

---

#### M-10: buildPressurePrompt 返回值在 handlePuaFailure 中被丢弃（设计意图，非缺陷）

**位置**: `src/sdk-driver.ts:840`

`handlePuaFailure` 中调用 `buildPressurePrompt()` 但未使用返回值。经验证，这是设计意图：PUA 状态被持久化到 StatusFile，下一次迭代开始时从 StatusFile 重建 `puaContext`（含 `pressurePrompt`），再传递给 `buildSkillAwarePrompt`。不需要修复，但建议添加注释说明意图。

---

#### M-11: 硬失败路径不更新 PUA 状态

**位置**: `src/sdk-driver.ts:389-414`

`iteration_hard_failure` 事件（SDK 崩溃、验证错误）不调用 PUA 处理函数，PUA 引擎无法感知硬失败。硬失败可能是更严重的问题，但 PUA 不会因此升级压力等级。

**修复方案**: 在 `executeGenericIteration` 和 `executeSkillAwareIteration` 的 catch 块中添加 `handlePuaFailure` 调用。

---

### 🟢 低风险 — 来源：功能逻辑自洽性审核（oc_ad.md）

| # | 问题 | 位置 | 说明 | 建议 |
|---|------|------|------|------|
| L-9 | 状态转换守卫缺失 | orchestrator.ts | `user_interrupt`、`backoff_elapsed`、`stop_condition_met` 无状态前置条件检查，理论上可从 `aborted` 状态触发 | 添加状态守卫，终态拒绝事件 |
| L-10 | `stop_condition_met` 不增加 `currentIteration` | orchestrator.ts | 迭代计数与实际执行不一致，但 stop 后循环立即终止，实际影响有限 | 统一计数语义 |
| L-11 | router.ts 与 skill-scheduler.ts full 档位序列不一致 | router.ts, skill-scheduler.ts | router 含 `decide`/`spec`，scheduler 不含。注释说明是设计意图，但可能引发维护困惑 | 添加交叉引用注释 |
| L-12 | 孤儿导出函数 | router.ts, skill-scheduler.ts | `getWorkNatureSequenceKey`、`getCommandSequence`、`shouldCommitForPhase` 仅测试中使用 | 清理或连接到生产调用点 |
| L-13 | brownfield 提升逻辑被困 light 分支 | router.ts:625-627 | brownfield 任务仅从 light→standard 提升，永远不会到 full | 评估是否需要 standard→full 提升 |
| L-14 | confirmSpec 不调用验证函数 | spec.ts | 直接锁定 spec 不经过 `validateTestability` 等验证 | 在 confirmSpec 中调用验证函数 |
| L-15 | plan.ts 不检查 spec 状态 | plan.ts | 可能在 spec 未锁定时执行 plan | 添加 spec 状态前置检查 |
| L-16 | AtomicTask 缺少 dependsOn 字段 | plan.ts | 无法表达任务间依赖关系 | 评估是否需要任务依赖 |

---

## 中期 — v2.x（平台改进）

在核心稳定的基础上，提升开发体验和可维护性。

- **Forge Loop × Skills 融合**（核心演进方向）

  当前 Forge Loop（自主执行引擎）和 Forge Skills（`/forge` 交互式命令）是两套割裂的系统。Loop 通过 Agent SDK 启动独立的 Claude Code 会话自主迭代，但会话内部不感知 Forge 的 SKILL 体系、状态目录和路由机制。目标是让两者真正互补：

  - **Loop 驱动 Skills**：Forge Loop 的每轮迭代内部调用 Forge Skills，而非当通用自主循环引擎
    ```
    forge-loop "为用户 API 添加分页功能"
      ├─ 迭代 1: router → 标准路径（自主模式，跳过确认）
      ├─ 迭代 2: plan → 拆解任务（自主模式，跳过确认）
      ├─ 迭代 3: build → 执行任务 1（commit）
      ├─ 迭代 4: build → 执行任务 2（commit）
      ├─ 迭代 5: review → 发现 P0（rollback + 自动重试）
      ├─ 迭代 6: 修复 P0 → review 通过（commit）
      ├─ 迭代 7: test → 验证
      └─ 迭代 8: ship → 默认保留分支
    ```
  - **Skills 双模式运行**：解决 Loop 完全自动化与 Skills 人工确认之间的矛盾。每个 SKILL 支持两种运行模式，通过 `.forge/status.md` 中的 `mode` 字段切换。Loop 启动时写入 `mode: autonomous`，结束时清除。

    | 确认点 | 交互模式（`/forge`） | 自主模式（`forge-loop`） |
    |--------|---------|---------|
    | Router 档位确认 | 等用户确认或覆盖 | 直接采用 AI 建议 |
    | Plan 任务拆解确认 | 等用户确认 | 直接执行 |
    | Build 暂停确认 | 轻量路径每两步暂停 | 不暂停，连续执行 |
    | Review P0/P1 处理 | 提示用户决定 | 自动进入修复循环（熔断上限保护） |
    | Ship 交付方式 | 用户选择 | 默认保留分支（最安全选项） |

    核心逻辑（路由分析、任务拆解、TDD 执行、三层评审、质量门禁）完全复用，只是决策权从"人确认"切换到"预设策略自动决策"。质量保障不降级——review 照常运行，P0 照常触发修复循环，只是不再等人点确认。
  - **状态感知**：Loop 读取 `.forge/status.md` 和 `.forge/plans/*.md`，根据当前阶段决定下一轮调用哪个 SKILL
  - **门禁复用**：Loop 的迭代成功/失败判定复用 Skills 的质量门禁（review P0/P1、test 通过率、ship 三重检查）
  - **分发包可用**：评估将 Loop 核心逻辑（迭代/commit/rollback/熔断）SKILL 化的可行性，使分发包用户也能通过 `/forge loop` 使用自主执行模式

  互补定位：
  | | `/forge`（Skills） | `forge-loop`（Loop） |
  |---|---|---|
  | 驱动方式 | 人在 Claude Code 对话中 | 程序在终端中，无人值守 |
  | 人机协作 | 每个阶段可介入、确认、覆盖 | 只设定目标和约束 |
  | 适用场景 | 需求模糊、需要人类判断 | 目标明确、可自动验证 |
  | Git 事务 | 无（人工管理） | 自动 commit/rollback |
  | 失败处理 | 人工决策 | 指数退避 + 熔断器 |

- **平台抽象层评估**
  - 评估将 Claude Code 特定 API 抽象为通用接口的可行性
  - 降低与单一 AI 平台的耦合度，为多平台支持做准备

- **国际化（i18n）支持**
  - SKILL.md 和用户提示信息的多语言框架
  - 支持中文、英文等主要语言的运行时切换

- **API 文档生成（TypeDoc）**
  - 为 `src/` 下的公开函数和类型生成 API 参考文档
  - 集成到 CI 流水线，保持文档与代码同步

- **可观测性增强**
  - 结构化日志输出（JSON 格式可选）
  - 命令执行耗时统计和性能基线
  - 错误追踪和诊断信息改善

---

## 长期 — v3.0（社区与生态）

面向社区开放，构建可扩展的 AI 编码工作流生态。

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
