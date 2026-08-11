# GSD Core 借鉴 Spec 总览

> 来源：[open-gsd/gsd-core](https://github.com/open-gsd/gsd-core) v1.4.4 深度调研
> 仓库 SHA：`820ef28785dfde7597849a1271f7dec4d36c5b7a`
> 生成日期：2026-06-12（v1.3.0 基线 2026-06-04 首版，v1.4.4 全面重写 2026-06-12）
> 评估日期：2026-06-12（代码交叉验证完成）
> 状态：draft — 待 `/forge plan` 拆解为可执行任务

---

## 评估结论（2026-06-12）

对 8 个子 Spec 逐一与 Forge 代码库交叉验证后，结论如下：

| 结论 | 数量 | Spec |
|------|------|------|
| ✅ **已通过现有实现满足** | 4 | Spec 1, 2, 4, 6, 7 |
| ⚠️ **部分值得借鉴** | 2 | Spec 3（+ Spec 8 合并）, Spec 5 |

### ✅ 已通过现有实现满足（无需开发）

| Spec | Forge 现有实现 | 评估理由 |
|------|--------------|---------|
| **Spec 1** Prompt 注入防御 | `scripts/forge-prompt-guard.js` + `scripts/forge-read-injection-scanner.js` + 39 regex patterns | 完整实现：Unicode tags + markdown XSS + 压缩存活模式 + hooks registered |
| **Spec 2** 上下文分层裁剪 | `src/context-budget.ts`（797 行） | **Forge 比 gsd-core 更精细**：`InformationLifecycle` 4 类型 + `CLASSIFICATION_MAP` 13 source types + 6 named trimmers + `ContextBudgetReport`。gsd-core 的 PEAK/GOOD/DEGRADING/POOR 只是展示名称 |
| **Spec 4** 判别联合结果类型 | `src/branch-gate.ts:77-82` `BranchGateResult` | 已有完整 discriminated union（`kind: "passed" | "skipped" | "blocked" | "warned" | "auto_fixed"`）。`createHub()` 不适用——Forge 通过 SKILL markdown 路由命令，非代码 dispatch |
| **Spec 6** 偏差分级规则 | `src/error-recovery/types.ts`（276 行）+ `engine.ts`（212 行）+ `src/execution-mode.ts`（301 行） | Forge 的 `safe_auto/gated_auto/manual/advisory` = gsd-core 的 4-Tier。`autoFixable` vs `requiresUserDecision`。Three-Strike = 修复限制。Slopsquatting 无冲突目标（src/ 中零 package install） |
| **Spec 7** 文件锁定与原子操作 | `src/state.ts:487-543`（通用锁系统）+ `src/tool-health-writer.ts:107-151`（O_EXCL + spin-wait + jitter + stale detection） | 完整实现：`LockInfo`、`LockResult`、`lockFilePath()`、`isLockStale()`、`attemptLock()` + property tests。Loop 的 `git reset --hard` 是受控安全机制（three-strike 回滚），abort 的 `git stash` 是 advisory text（非自动执行） |

### ⚠️ 部分值得借鉴（有明确可执行项）

| Spec | 已有 | 缺失（可执行） | 实现方式 |
|------|------|----------------|---------|
| **Spec 3** Goal-Backward 验证 | adversarial stance + stub detection + evidence_artifact_id + confidence 过滤 + dedup + P0/P1 block + fallback L0-L3 | **L3 Wired 检查**（5 种 wiring 路径）+ **L4 Data-Flow 检查**（端到端 trace）+ **Must-haves merge rule** + **状态矩阵**（VERIFIED/HOLLOW/ORPHANED/STUB/MISSING） | **spec-check agent instructions (markdown) 修改，非代码** |
| **Spec 5** 科学调试框架 | 4-phase（collect→pattern→hypothesize→fix）+ `validateHypothesis()` + `analyzeHypothesisResults()`（3-strike 升级）+ `isValidPhaseTransition()` | **reasoning checkpoint 5 字段**（当前 Hypothesis 只有 3 字段：description/verifyCommand/expectedOutcome）+ **debug session 文件**（5-file protocol）+ **4 调试模式** | **debug SKILL instructions + minor Hypothesis type extension** |
| **Spec 8** 4 级 Artifact 验证 | L1 Exists + L2 Substantive（已在 spec-check） | **L3 Wired + L4 Data-Flow** | **与 Spec 3 完全重叠，应合并** |

---

## 调研背景

对 open-gsd/gsd-core 仓库进行了 v1.4.4 全量深度调研（3,537 commits，33 agents，67 commands，88 workflows，68 references，11 hooks，15 runtimes），识别出 20 个核心模式。经评估后选取 8 个高价值项生成 spec，其余 12 个暂不需要或 Forge 已做得更好。

### v1.4.0→v1.4.4 关键新增（vs v1.3.0 基线）

| 新特性 | 版本 | 对 Forge 的价值 |
|--------|------|----------------|
| Research Module（内容寻址缓存 + provider waterfall + package legitimacy） | v1.4.0 | ⭐⭐⭐ 高 — librarian agent 可直接借鉴 |
| Namespace Meta-Skills（两阶段路由，token 成本 2150→120） | v1.4.0 | ⭐⭐ 中 — Forge 已有 `/forge` 单入口 |
| Workflow byte budget（非行数限制） | v1.4.0 (#717) | ⭐⭐ 中 — context-budget.ts 已用 token ratio 更精确 |
| Claude Code 生命周期 hooks（SubagentStop/Stop/PreCompact/FileChanged） | v1.4.0 | ⭐⭐ 中 — Forge hook 系统可扩展 |
| Per-phase-type model resolution | v1.4.0 | ⭐ 低 — Forge 只有一个 runtime |
| Codebase drift gate | v1.4.0 (#2003) | ⭐⭐ 中 — dist-sync 可借鉴 |
| Orchestrator 不再 context:fork | v1.4.2 | ⭐ 低 — 架构差异 |
| plan-review-convergence inline | v1.4.3 | ⭐ 低 — Forge 已 inline |
| anthropic-fable provider preset | v1.4.4 | ⭐ 低 — Forge 无多 provider |

## Spec 列表（含评估结论）

| # | Spec | 评估结论 | 现有实现 | 可执行项 |
|---|------|---------|---------|---------|
| 1 | [Prompt 注入防御](spec-1-prompt-injection-defense.md) | ✅ 满足 | forge-prompt-guard + forge-read-injection-scanner | 无 |
| 2 | [上下文分层裁剪](spec-2-context-layered-trimming.md) | ✅ 满足（Forge 更优） | context-budget.ts（797 行，更精细） | 无 |
| 3 | [Goal-Backward 验证](spec-3-goal-backward-verification.md) | ⚠️ 部分借鉴 | spec-check agent | L3/L4 + must-haves + status matrix |
| 4 | [判别联合结果类型](spec-4-discriminated-union-results.md) | ✅ 满足 | branch-gate.ts BranchGateResult | 无（createHub 不适用） |
| 5 | [科学调试框架](spec-5-scientific-debugging.md) | ⚠️ 部分借鉴 | debug.ts（4 阶段） | checkpoint 5 字段 + debug 文件 + 4 模式 |
| 6 | [偏差分级规则](spec-6-deviation-tier-rules.md) | ✅ 满足 | error-recovery/engine.ts | 无 |
| 7 | [文件锁定与原子操作](spec-7-file-locking-atomic-ops.md) | ✅ 满足 | state.ts + tool-health-writer.ts | 无 |
| 8 | [4 级 Artifact 验证](spec-8-four-level-artifact-verification.md) | ⚠️ 合并到 Spec 3 | spec-check（L1/L2） | 与 Spec 3 L3/L4 重叠 |

## 可执行工作项（仅 Spec 3 + 5）

### Spec 3: Goal-Backward 验证增强

| 工作项 | 类型 | 影响文件 | 工作量 |
|--------|------|---------|--------|
| L3 Wired 检查（5 种 wiring 路径） | spec-check instructions (markdown) | `skills/forge/lib/review/instructions.md` | 2-3h |
| L4 Data-Flow 检查（端到端 trace） | spec-check instructions (markdown) | `skills/forge/lib/review/instructions.md` | 1-2h |
| Must-haves merge rule | spec-check instructions (markdown) | `skills/forge/lib/review/instructions.md` | 1h |
| 状态矩阵（VERIFIED/HOLLOW/ORPHANED/STUB/MISSING） | spec-check instructions (markdown) | `skills/forge/lib/review/instructions.md` | 1h |
| **小计** | | | **5-7h** |

### Spec 5: 科学调试框架增强

| 工作项 | 类型 | 影响文件 | 工作量 |
|--------|------|---------|--------|
| Hypothesis type 扩展（+falsification_test +blind_spots） | TypeScript | `src/debug.ts` | 1h |
| Reasoning checkpoint 5 字段模板 | debug instructions (markdown) | `skills/forge/lib/debug/instructions.md` 或等效 | 1-2h |
| Debug session 文件协议（5-file） | debug instructions (markdown) | 同上 | 1-2h |
| 4 调试模式 | debug instructions (markdown) | 同上 | 1h |
| **小计** | | | **4-6h** |

**总计可执行**：9-13h（原估 37-50h 的 25-35%）

## GSD Core 中 Forge 已做得更好的方面

- ✅ TDD 铁律（RED→GREEN→REFACTOR + 垂直切片强制执行）
- ✅ 知识演化协议（evolved-rules + 置信度评分 + 自动清理）
- ✅ Three-Strike 重路由（3 次失败后强制 debug + 架构质疑）
- ✅ No-Confirmation 铁律（禁止阶段间停顿询问）
- ✅ Agent Teams 模式（团队协作 + TaskList 共享 + 消息传递）
- ✅ 三级路由（Light/Standard/Full + 不可跳步）
- ✅ Fallback Ladder（L0→L1→L2→L3 + L3 阻断 ship）
- ✅ 冻结区/受保护区/开放区文件权限分区
- ✅ Pre-push 全量验证（test + lint + dist-sync + docs links）
- ✅ **上下文管理**（InformationLifecycle 4 类型 + 6 named trimmers — 比 gsd-core PEAK/GOOD/DEGRADING/POOR 更精细）
- ✅ **判别联合**（BranchGateResult 5 kind — 已有完整 discriminated union）
- ✅ **文件锁定**（state.ts 通用锁系统 + tool-health-writer.ts O_EXCL — 完整实现）
- ✅ **偏差处理**（error-recovery safe_auto/gated_auto/manual/advisory 4 级 — 等价于 gsd-core 4-Tier）

## GSD Core v1.4.4 中暂不借鉴的模式

| 模式 | 理由 |
|------|------|
| 多运行时支持（15 runtimes） | Forge 只支持 Claude Code 单运行时 |
| Runtime Config Adapter Registry | 同上 |
| Installer Migrations（versioned + journal） | Forge 无 installer 分发体系 |
| STATE.md / CONTEXT.md 双文件格式 | Forge 使用 `.tinkerman/progress/` + `.tinkerman/specs/` 文件系统 |
| Per-phase-type model resolution | Forge 无多 phase model 配置需求 |
| Namespace Meta-Skills（6 routers） | Forge 已有 `/forge` 统一入口，分层路由增加复杂度 |
| Checkpoint Protocol（human-verify/decision/action） | Forge 的 review 三层 + No-Confirmation 已覆盖 |
| createHub() command dispatch | Forge 通过 SKILL markdown 路由，非代码 dispatch |

## 参考

- GSD Core 仓库：https://github.com/open-gsd/gsd-core
- GSD Core v1.4.4 核心源码：`src/command-routing-hub.cts`、`src/state.cts`、`src/verify.cts`、`src/prompt-budget.cts`、`src/context-utilization.cts`、`src/debug.cts`、`src/research-cache.cts`
- GSD Core Hook 系统：`hooks/gsd-prompt-guard.js`、`hooks/gsd-read-injection-scanner.js`、`hooks/gsd-worktree-guard.js`
- GSD Core Agent 定义：`agents/gsd-executor.md`、`agents/gsd-verifier.md`、`agents/gsd-debugger.md`
- GSD Core Workflow 系统：`workflows/` 目录（88 个 workflow，byte-budget 限制）
- GSD Core References：`references/` 目录（68 个 reference 文档）
- Forge AGENTS.md：`/AGENTS.md`
- Forge Agent Definitions：`.Codex/agents/`
- Forge Skill Instructions：`skills/forge/lib/*/instructions.md`
- Forge 现有实现交叉验证：`src/context-budget.ts`、`src/branch-gate.ts`、`src/state.ts`、`src/tool-health-writer.ts`、`src/debug.ts`、`src/error-recovery/`、`src/execution-mode.ts`
