---
name: forge-build
description: "Execute an approved plan through TDD with subagent isolation, atomic commits, and three-strike failure safety. Use when running `/forge build`, an approved plan exists, or the implementation phase of a standard or full tier task begins."
skeleton_exempt_legacy: true
disable-model-invocation: true
---

## Current Context

Branch: !`git branch --show-current`
Plan status: !`head -5 .forge/plans/*.md 2>/dev/null || echo "no plan"`
Last commit: !`git log --oneline -1 2>/dev/null || echo "no commits"`

# /forge build — 执行引擎

> **触发方式**：标准路径第二步 / 全量路径第四步 / 轻量路径第一步 / 直接输入 `/forge build`
> **职责**：按计划以 TDD 方式逐任务实现代码，Subagent 隔离 + 原子提交
> **输出路径**：`.forge/progress/<topic>.md`（实时进度）+ 项目代码变更

---

## 1. Overview

`/forge build` turns plans into code. Three execution paths based on routing tier, TDD iron rules per task, atomic commits for traceability.

**核心原则**：测试先于代码，验证先于声明。没运行过的测试 = 不存在的测试。

**Not For**：纯文档更新 / 纯配置变更（无行为影响）/ 需求不明时（先 spec）

**Plan 即合同铁律**：Plan 批准后，所有任务必须全部完成。Plan 中任务的 priority（P0/P1/P2/P3）仅决定执行顺序，不表示"可跳过"或"留到后续"。禁止输出"建议后续再做"、"P2 可以推迟"等跳过话术。如果任务不该做，它就不应出现在 Plan 中。

## 1a. Nature Mode 路由

Build 启动时读取 `.forge/status.md` → 提取 `work_nature` 字段 → 按值路由：

| work_nature | 行为 |
|-------------|------|
| `feature` (默认) | 走原有通用流程（§2-§6），不加载 nature-specific references |
| `refactor` | 加载 `references/refactor-mode.md` + `references/refactor-method-library.md` → 执行预检 → scan/design/apply |
| `bugfix` | 加载 `references/bugfix-mode.md` + `references/bugfix-method-library.md` → 执行预检 → analyze/apply/verify |

**条件加载**：仅当 `work_nature ≠ feature` 时读取对应 reference。feature mode 不读取 refactor / bugfix references。

**预检查入口闸门**：nature mode 第一步执行 nature-specific 预检查。不通过 → 结构化拒绝（`🚫 命中检查：<条目> 证据：<路径> 建议：<路由>`）→ 回路由器。

**逃生舱**：`--nature=refactor|bugfix|feature` 显式覆盖、`/forge refactor` / `/forge fix` 子命令仍可进入对应 mode。

→ 函数签名详见 references/function-contracts.md

## 2. Pre-build Checks

标准/全量路径下，build 前必须逐条通过。任一不满足，不得继续。

| # | Check | Block Condition | Route |
|---|-------|---------|-------|
| 1 | **Spec Gate** — scan `.forge/specs/` status | Not `"locked"` (no-Spec Plan exempt) | → `/forge spec` |
| 2 | **Plan Gate** — scan `.forge/plans/` status | Not `"approved"` | → `/forge plan` |
| 3 | **Dir Integrity** — `.forge/` subdirs exist | Missing | → `forge init` |
| 4 | **Branch Gate** — current vs expected branch | Not on `feature/<topic>` or `forge/<topic>` | → Auto-switch |

**Rejection Output**: `🚫 Build 前置检查未通过 — 命名：<检查> 证据：<文件状态> 建议：<路由> 重入：<条件>`. Multiple failures → list all. Autonomous → JSON.

**函数调用**: `checkBuildGate(specStatus, planStatus)` — 参数：从 `.forge/specs/<topic>/spec.md` 和 `.forge/plans/<topic>.md` frontmatter 读取 status 字段；返回 `{ allowed, reasons }`；`allowed: false` 时以本段 rejection 格式输出所有未通过项

→ Branch Gate auto-switch / unshipped-branch warning / lightweight exception 详见 references/branch-gate.md

---

## 3. Execution Paths

### 3.1 Lightweight (≤1 file, ≤20 lines)

Direct edit, no Subagent. Pause every 2 steps for confirmation. Verify, commit. No gates, no Restatement.

### 3.2 Standard (clear requirements / has Spec)

Read task list → per task: **Closure-First Probes** (→ references/closure-probes.md) → **Subagent TDD** → progress update → atomic commit → **Final Validation** (§3.5).

Mandatory Restatement Checkpoint (counter init 3) + Subagent Status handling + Invocation contract + Framework API verification + Self-check。→ 详见 references/subagent-orchestration.md

### 3.3 Full (new service/db/auth/ambiguous)

**Phase 1**: Parallel research Subagents（`Promise.allSettled`，`max_parallel_agents` default 6）。
- **函数调用**: `buildResearchSubagents(topics)` — 参数：从 Plan 研究问题提取的 `string[]`；返回 `SubagentInvocation[]`；用于构造并行研究 Subagent 配置
- **函数调用**: `mergeResearchFindings(results)` — 参数：Phase 1 所有 Subagent 返回的 `SubagentResult[]`；返回合并后的研究发现字符串；写入 `.forge/findings/<topic>.md`
→ 函数签名详见 references/function-contracts.md

**Phase 2**: Module-by-module Subagent TDD。Optional Git Worktree for file overlap。Restatement counter init at Phase 2 start。→ Final Validation。→ 详见 references/subagent-orchestration.md

## 3.4 Closure-First Probes

每任务进入 TDD 前执行探针（2 Probe + 1 Verify），确认 Plan 假设与代码库一致。→ 详见 references/closure-probes.md

**Output**: `🔍 探针（Task N） P1：✅/❌ P2：✅/❌ V1：✅/❌ → 通过/失败`

## 3.5 Final Validation

Read `ci_check_command` from `config.md` → execute as-is. Empty → `verify_commands` → AI auto-detect. Report: `[Command] → [Output] → [Claim]`.

**Three-Layer Truncation**: (1) `forge_exec` MCP (2) `run-with-trim.sh` fallback (3) AI Iron Law — failure output unchanged.

---

## 4. TDD Iron Rules

→ CLAUDE.md §2.1 (RED → GREEN → REFACTOR). In-Subagent enforced. Code before tests → delete, restart.

GREEN 阶段的代码必须是"能让测试通过的最简单实现"。REFACTOR 完成后扫描孤儿代码（未使用的 import / 未调用的函数 / 未引用的类型 / 未使用的变量），记录到 `.forge/findings/<topic>.md`，不自行删除。

→ 详见 references/tdd-rules.md（Simplicity Check 示例、Rule of Three、Dead Code Hygiene 细节）

---

## 5. Failure Handling

**5.1 Three-strike**: 3 consecutive fails → `debugger` agent (maxTurns=15): read errors → one hypothesis → minimal fix → report if 3 more. `🚫 连续失败 3 次 → debugger. 尝试 1/2/3：<原因>`
- **函数调用**: `analyzeFixAttempts(sequence)` — 参数：当前任务的修复尝试序列 `FixAttemptSequence`；返回 `{ shouldEscalate, consecutiveFailures, escalationIndex }`；`shouldEscalate: true` 时触发 three-strike 重路由到 `/forge debug`
→ 函数签名详见 references/function-contracts.md

**5.1a Failure 自动沉淀**: Three-strike 触发时同步调用 `buildThreeStrikeFailureArtifacts(topic, tier, situation, rootCause, now, seq)`（`src/build.ts`）→ 写 failure episode 到 `.forge/knowledge/sessions/<date>-<topic>.md` 并在 `.forge/progress/<topic>.md` 末尾追加 Evolution 标记 `target=forge-build#three_strike`。写入失败降级为 `console.warn`，不阻断重路由流程。

**5.2 Test Failure**: GREEN failing → test bugs? impl misses conditions? → fix + rerun.

---

## 6. Execution Discipline

**6.0 Anti-drift**: 6 prohibited behaviors (proxy metrics / absorb verification / relabel fixes / silent degrade / pseudo-success / modify frozen). → 详见 references/anti-drift.md

**6.0.1 No Mid-build Confirmation（铁律）**: Build 阶段内部，任务之间**绝对禁止**停下来询问用户。完成一个任务 → 一行摘要 → 立即下一个任务。唯一允许停下来的 3 种情况：Three-strike / 阻断性错误 / 分支保护。→ 详见 references/no-mid-build-confirmation.md

**6.1** Test First → CLAUDE.md §2.1 | **6.2** Atomic Commits (1 per task) | **6.3** Verify First → §2.3, P5 chain | **6.4** Three-strike → §2.4 | **6.5** Conciseness → §2.6 (structured outputs exempt)

### 6.6 Change Summary

每个 Subagent 在原子提交前输出三段式摘要（变更 / 未触碰 / 关注点）。属于 Structured_Output，豁免散文压缩。→ 详见 references/change-summary.md

### 6.7 Dependency Discipline

添加新依赖前 4 项确认（现有技术栈 / 大小 / 维护活跃 / 许可证）。每个依赖都是负债，不添加是默认。→ 详见 references/dependency-discipline.md

---

## 7. Status Updates

进度/临时/阶段/健康四类状态更新 + 阶段流转表 + 执行流程 + 示例：

→ 详见 references/status-updates.md

## 8-10. Execution Flow · Edge Cases · Example

→ 详见 references/status-updates.md §8-§10

Spec/Plan not ready → §2 rejection. Subagent timeout → block → `/forge resume`. Worktree conflict → pause → manual resolve. No `.forge/` → `forge init`.

---

## Known AI Failure Patterns · Reflection Triggers · Common Rationalizations

→ 详见 references/failure-patterns.md

---

## Context Budget Management

Mandatory token limits, structured outputs exempt. → 详见 references/context-budget.md

**Trimmer 函数映射**（概念名 → 实际函数调用）：

| 概念名 | 函数调用 | 参数来源 | 返回值用途 |
|--------|---------|---------|-----------|
| Explore_Summarizer | `serializeExploreResult(exploreOutput)` | Explore Agent 原始返回值 | 替换 context 中的原始 Explore 输出为结构化摘要（≤300 tokens） |
| Subagent_Summary_Protocol | `serializeSubagentSummary(subagentOutput)` | Subagent 原始返回值 | 替换 context 中的执行日志为提取摘要（≤200 tokens） |
| Test_Output_Trimmer | `serializeTestOutput(testOutput)` | 测试运行原始输出（先解析为 `TestOutputSummary`） | all-pass 时替换为单行；failures 时保留仅失败项（≤300 tokens） |
| Git_Output_Limiter | `serializeGitDiff(diffSummary, lineCount)` / `serializeGitStatus(statusSummary, fileCount)` | git 命令输出（先解析为 `GitDiffSummary` / `GitStatusSummary`） | diff >50 行或 status >30 文件时替换为文件级摘要（≤200 tokens） |

Trimmer 函数签名详见 references/function-contracts.md

## 11. Context Exhaustion Protocol

> 当所有 Trimmer 仍不足以维持上下文时的应急协议。这不是失败——这是长时间 build 会话的正常边界条件。

### 11.1 Detection Signals

观察到以下**任一**信号时，立即触发耗尽协议：

1. Auto-compact 触发且丢失已完成的任务跟踪
2. 无法在不重读 progress 文件的情况下回忆当前任务编号
3. Restatement Checkpoint 摘要超过 800 tokens（正常预算的两倍）
4. 推理质量退化——重复提问、丢失 TDD 阶段跟踪
5. 上下文利用率超过 80%

### 11.2 Mandatory Exhaustion Sequence

检测到耗尽时，**替代**输出手动续接提示，执行以下序列：

**Step 1: 写入 Interim 状态**（必须成功后再做其他操作）

写入 `.forge/knowledge/sessions/<date>-<topic>-interim.md`：

```yaml
---
date: "<ISO timestamp>"
task: "<status.md 中的 current_task>"
phase: "build-exhaustion"
exhaustion_signal: "<触发了哪个检测信号>"
next_task_number: "<N>"
total_tasks: "<M>"
completed_tasks: "<K>"
---

## Progress Snapshot
<已完成的任务名称，每行一个>

## Key Findings
<从 .forge/findings/<topic>.md 复制>

## Active Constraints
<剩余任务的阻塞项或特殊注意事项>

## Anomalies
<本会话中发生的意外情况>
```

**Step 2: 更新 Status 文件**

更新 `.forge/status.md`：`phase` 保持 `"build"` 不变，添加字段 `exhaustion_pending: "true"`，更新 `updated` 时间戳。

**Step 3: 输出 Handoff 并自动恢复**

输出**仅此消息**：

```
⚠️ Context exhaustion detected. Interim state saved.
→ Continuing with /forge resume
```

然后立即调用：`Skill(skill="forge", args="resume")`

### 11.3 What NOT to Do

- **禁止**输出长段"剩余任务"清单让用户手动复制
- **禁止**输出"请在新会话中运行 /forge resume"
- **禁止**在写入 interim 文件之前停止
- **禁止**因为"progress 文件已经跟踪了"而跳过 interim 写入

### 11.4 Safety Limits

- 单次 build 会话最多 **5 次**耗尽轮转。达到 5 次后停止并报告。
- Interim 文件写入连续失败 2 次时，输出最小化 JSON handoff 到 stdout 作为 fallback。
- Three-strike 触发期间**不执行**耗尽协议——让 Three-strike 先自行处理。
- `next_task_number` 必须为正整数。解析失败时默认为 1，并记录 anomaly。

## Gotchas
- **Skipping RED phase**: Write implementation first, then backfill tests → tests verify implementation not behavior → must write failing test first
- **Subagent context leak**: Subagent returns full raw output → main context polluted with 50 lines of grep results → subagent must return conclusion summary only
- **Atomic commit omission**: Change 3 files, commit only 1 → inconsistent state → commit all files for each subtask immediately
- **Three-strike ignored**: Same fix attempted 4th time → wasted context → stop at 3, enter debug
- **Plan drift**: Build deviates from approved plan → scope creep → re-read plan after every 3 tasks
