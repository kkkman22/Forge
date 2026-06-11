---
description: "Use when running `/forge build`, an approved plan exists, or the implementation phase of a standard or full tier task begins"
updated: 2026-06-05

dispatch_mode: fork
allowed_tools:
  - Read
  - Edit
  - Write
  - Bash
  - Agent
  - Glob
  - Grep
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

### §1.5 Pre-flight: Branch Gate

调用 `runBranchGate({ skill: "build", mode, currentBranch, currentTask, pendingDeliveries, alreadyCheckedThisPhase, isCleanTree })`：
- `passed` / `skipped` → 继续后续 §
- `auto_fixed` → 输出 `✅ 已自动切换到 <newBranch>` 后继续
- `blocked` → 中止 skill，按 mode 输出对应提示
- `warned` → 输出警告但继续

### §1.5a Mid-session Worktree Isolation

当 build 检测到需要 worktree 隔离（如多 agent 并行修改同一文件），可通过 `EnterWorktree` 工具在已有会话中切换到隔离 worktree，无需重启会话：

1. 使用 `EnterWorktree` 工具（参数 `{ name: "<task-slug>" }`）→ 创建隔离分支 + 目录
2. 在 worktree 中执行 build 任务
3. 完成后使用 `ExitWorktree` 工具（参数 `{ action: "keep" }`）→ 保留变更回主目录

**适用场景**：Full tier Phase 2 多模块并行开发、需要隔离试验性变更时。

**注意**：worktree 中 `.forge/` 目录为符号链接或共享，进度文件写入仍然可见。

### §1.6 Pre-flight: Spec Health Check

Same as forge-plan §1.6. Verify locked spec is still healthy before build starts.

默认严重度：block。可通过 `severityOverride` 覆盖。

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

### §1b. Git Operations Conflict Hook

Build 阶段中途执行 `git rebase` / `git pull` / `git merge` 同步 main 时，如果产生 `.forge/` 目录下的冲突：

1. 解析冲突路径：`parseConflictedPaths(stderr)`
2. 调用 `resolveConflicts(paths, mode, context)`（`src/conflict-resolver.ts`）
3. 按三区分类自动处理：
   - **frozen 区**：autonomous → 暂停 build + advisory；interactive → 3 选项
   - **guarded 区**：自动语义合并（progress: completed > pending；reviews: append + sort）
   - **open 区**：accept ours
   - **source 区**：留给用户手动解决
4. 全部解决 → `git add` + 继续 rebase/merge → build 继续
5. 部分解决 / frozen 拒绝 → 暂停 build，提示用户手动处理或运行 `/forge fix-conflicts`
6. Three-Strike：`validateConflictResolution` 连续 3 次失败 → 触发 `/forge debug`

**不适用场景**：非 `.forge/` 目录的源码冲突不由此 hook 处理，留给用户手动解决。

→ 函数签名详见 references/function-contracts.md

## 2. Pre-build Checks

标准/全量路径下，build 前必须逐条通过。任一不满足，不得继续。

| # | Check | Block Condition | Route |
|---|-------|---------|-------|
| 1 | **Spec Gate** — scan `.forge/specs/` status | Not `"locked"` (no-Spec Plan exempt) | → `/forge spec` |
| 2 | **Plan Gate** — scan `.forge/plans/` status | Not `"approved"` | → `/forge plan` |
| 3 | **Dir Integrity** — `.forge/` subdirs exist | Missing | → `/forge init` |
| 4 | **Branch Gate** — `runBranchGate` 统一 hook | Not on `feature/<topic>` or `forge/<topic>` | → Auto-switch / Block |

**Rejection Output**: `🚫 Build 前置检查未通过 — 命名：<检查> 证据：<文件状态> 建议：<路由> 重入：<条件>`. Multiple failures → list all. Autonomous → JSON.

**函数调用**: `runBranchGate({ skill: "build", ... })` — 调用 `src/branch-gate.ts` 统一调度层；参数从 `.forge/status.md` 和 git state 读取；返回 `BranchGateResult`；按 result.kind 处理（详见 §1.5）

**函数调用**: `checkBuildGate(config)` — 检查 build 前置门禁（Spec 锁定、Plan 批准、目录完整性）；`checkBranchTopicGate(branch, featureBranch)` — 验证分支命名是否符合 `feature/<topic>` 或 `forge/<topic>` 模式；`detectUnshippedBranches(gitLogFn)` — 扫描本地未合并的 feature 分支并输出警告

→ Branch Gate auto-switch / unshipped-branch warning / lightweight exception 详见 references/branch-gate.md

---

## 3. Execution Paths

### 3.1 Lightweight (≤1 file, ≤20 lines)

Direct edit, no Subagent. Pause every 2 steps for confirmation. Verify, commit. No gates, no Restatement.

### 3.2 Standard (clear requirements / has Spec)

Read `build.use_goal` from `.forge/config.md` (default `true`) → route to §3.2a (/goal mode) or legacy §3.2b.

任务按 Plan 中 `dependsOn` 拓扑顺序执行。依赖图由 Plan Step 3.5 生成，build 遵循拓扑排序确保依赖在依赖者之前完成。

#### §3.2a /goal Mode (`build.use_goal: true`)

When `build.use_goal` is `true` (default), use Claude Code's `/goal` command to drive the TDD loop natively.

**启动 /goal**：
1. 读取 `.forge/plans/<slug>.md` 或 `.kiro/specs/<spec>/tasks.md` 获取所有 task
2. 读取 `.forge/config.md` 获取 `ci_check_command`
3. 启动 `/goal`，目标条件：**"所有 task 标记 completed AND `ci_check_command` 通过"**

**每次迭代（/goal 自动循环）**：
1. 读取下一个未完成 task（TaskGet）
2. 标记为 `in_progress`（TaskUpdate）
3. **RED** → 写失败测试
4. **GREEN** → 最小实现通过测试
5. **REFACTOR** → 清理代码
6. 运行相关测试验证
7. 标记为 `completed`（TaskUpdate）
8. 原子 commit

**Three-Strike 检测**：
- 同一 task 连续失败 3 次 → 停止 /goal → 进入 `/forge debug`

**/goal 进度追踪**（内置）：
- Live 显示：elapsed time、turns、tokens consumed

**遵守 §2.7**：/goal 循环中不暂停等待用户确认。

**/goal 完成后**：
- 运行 `ci_check_command` 全量验证（§3.5 Final Validation）
- 输出 `✅ build 完成`

#### §3.2b Legacy Mode (`build.use_goal: false`)

Read task list → per task: **Closure-First Probes** (→ references/closure-probes.md) → **Subagent TDD** → progress update → atomic commit → **Final Validation** (§3.5).

**Wave Orchestration (Requirement 4)**：当 `tasks.md` 含 JSON wave 块时，使用 `parseWaves(jsonBlock, tasks)` 从 `src/spec-wave.ts` 解析 wave 分组。然后逐 wave 调用 `scheduleWave(wave, { maxConcurrency, executor, onHttp429 })`（`src/build.ts`）执行：
- Wave 内任务可并行（`max_parallel_agents` 默认 6）
- Wave 间串行（前 wave 全部完成才进入下一 wave）
- **Wave 间持久化**：每个 wave 完成后持久化 P0/P1 findings。若 context 较高且还有后续 wave，建议用户执行 `/compact`。详见 `skills/shared/next-step-protocol.md` §Context Compact 策略
- HTTP 429 降级阶梯：第 1 次并发减半 → 第 2 次降至 2 → 第 3 次串行（1 agent）
- 不含 wave 块时退化为单任务串行模式

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

## 3.6 Handoff Block（R2 — 原子任务交接）

每完成一个原子任务并准备 commit 前，build agent 必须在 `.forge/progress/<topic>.md` 对应任务条目下追加 5 字段 handoff block（`task_id` / `completed` / `not_completed` / `commands_executed` / `issues_found` / `procedure_compliance`）。下一任务启动前必须读取上一任务的 handoff 作为接续输入。

**Carry-Over Discipline（R2.AC6）**：上一任务 `not_completed` 非空时，下一任务 plan 阶段必须显式选择 (a) 纳入当前任务、(b) 写入 Out of Scope、(c) 升级为新原子任务之一。**静默忽略 = P1**。

§3.5 Final Validation 运行时校验每个 commit 都有 handoff、含全部字段、`commands_executed` 非空、`procedure_compliance` 含 TDD 阶段标记。缺失输出 P1，build 不结束。

→ 详见 references/handoff-block.md（字段定义、light tier 降级、Self-Check 完整清单）

---

## 4. TDD Iron Rules

→ CLAUDE.md §2.1 (RED → GREEN → REFACTOR). In-Subagent enforced. Code before tests → delete, restart.

### §4.1 Sandbox Advisory Checkpoint

Phase 1 advisory: **does not block**, only warns.

**Before writing any source file** in GREEN/REFACTOR phase, call `checkFilesystemPolicy(targetPath, 'write', sandboxConfig)`:

```
import { loadSandboxConfig, checkFilesystemPolicy } from "./sandbox-policy.js";
const sandboxConfig = loadSandboxConfig();
const result = checkFilesystemPolicy(targetPath, "write", sandboxConfig);
if (!result.allowed) {
  // Output warning, do NOT block the write
  console.warn(`⚠️ 沙箱策略建议阻止此操作：${result.reason}（Phase 1 advisory，不阻断）`);
}
```

**Trigger**: Any `Write` or `Edit` tool call targeting `src/`, `test/`, `config/`, or other project files.
**Skip**: `.forge/` directory writes (progress, reviews) are exempt from sandbox checks.

GREEN 阶段的代码必须是"能让测试通过的最简单实现"。REFACTOR 完成后扫描孤儿代码（未使用的 import / 未调用的函数 / 未引用的类型 / 未使用的变量），记录到 `.forge/findings/<topic>.md`，不自行删除。

→ 详见 references/tdd-rules.md（Simplicity Check 示例、Rule of Three、Dead Code Hygiene 细节）

---

## 5. Failure Handling

**5.1 Three-strike**: 3 consecutive fails → `debugger` agent (maxTurns=15): read errors → one hypothesis → minimal fix → report if 3 more. `🚫 连续失败 3 次 → debugger. 尝试 1/2/3：<原因>`
- **函数调用**: `analyzeFixAttempts(sequence)` — 参数：当前任务的修复尝试序列 `FixAttemptSequence`；返回 `{ shouldEscalate, consecutiveFailures, escalationIndex }`；`shouldEscalate: true` 时触发 three-strike 重路由到 `/forge debug`
- **§2.4 联动 (Requirement 15)**：Three-strike 触发时同步调用 `triggerThreeStrikeReroute(history, currentFailure)`（`src/spec-pbt-derivation.ts`）→ 计算 `fail_signature = computeFailSignature(failures)` → 如果 `result.reroute === true` → 调用 `buildThreeStrikeDebugReroute(history, currentFailure, debugDir, topic)`（`src/build.ts`）→ 自动进入 `/forge debug` → 写诊断模板到 `.forge/debug/<topic>.md`
→ 函数签名详见 references/function-contracts.md

**5.1a Failure 自动沉淀**: Three-strike 触发时同步调用 `buildThreeStrikeFailureArtifacts(topic, tier, situation, rootCause, now, seq)`（`src/build.ts`）→ 写 failure episode 到 `.forge/knowledge/sessions/<date>-<topic>.md` 并在 `.forge/progress/<topic>.md` 末尾追加 Evolution 标记 `target=forge-build#three_strike`。写入失败降级为 `console.warn`，不阻断重路由流程。

**5.2 Test Failure**: GREEN failing → test bugs? impl misses conditions? → fix + rerun.

---

## 5a. Deviation Tier Rules

When executing plan tasks and encountering situations that deviate from the plan, follow this 4-tier system:

### Rule 1: Auto-Fix Bugs
**Trigger**: Obvious logic errors, typos, missing null checks
**Condition**: Fix doesn't change overall architecture or affect other tasks
**Action**: Auto-fix, annotate commit with [deviation]
**Example**: Plan requires input validation, existing code lacks null check → add it

### Rule 2: Auto-Add Missing Critical Functionality
**Trigger**: Missing critical dependency or call needed for task success
**Condition**: Addition is necessary for task to work, doesn't affect architecture
**Action**: Auto-add, record in SUMMARY deviations section
**Example**: Plan says "add user registration API", implementation needs password hashing → add it

### Rule 3: Auto-Fix Blocking Issues
**Trigger**: Compilation errors, test failures blocking progress
**Condition**: Fix doesn't exceed task scope
**Action**: Auto-fix, record in SUMMARY deviations section
**Example**: Missing import causing compile error → add import

### Rule 4: STOP for Architectural Changes
**Trigger**: Any change to architecture, new dependencies, or beyond task scope
**Condition**: NONE — always stop
**Action**: STOP + output structured checkpoint with:
- What was encountered
- Why it exceeds scope
- Suggested resolution
**Example**: Implementation needs new state management library → stop and report

### Package Install Safety Gate
**NEVER auto-install new packages.** Return checkpoint with:
- Package name + version
- Install rationale
- Alternative approaches
- npm download count + maintenance status

Purpose: prevent slopsquatting attacks.

### Deviation Recording
All deviations must be recorded in commit messages or SUMMARY:
```
## Deviations

### Auto-Fixed (Rule N)
- [description of what was fixed and why]
- Impact: [scope of change]

### Stopped (Rule 4)
- [what was encountered and why it exceeds scope]
- Suggestion: [recommended resolution]
```

### Deviation Decision Tree
1. New package needed? → Package Safety Gate (stop)
2. Changes architecture/data model? → Rule 4 (stop)
3. Exceeds current task scope? → Rule 4 (stop)
4. Obvious bug/error? → Rule 1 (auto-fix)
5. Necessary for task success? → Rule 2 (auto-add)
6. Blocking issue (compile/test fail)? → Rule 3 (auto-fix)
7. Anything else? → Rule 4 (stop, conservative)

### Interaction with Three-Strike
- Rule 1-3 auto-fixes do NOT count toward Three-Strike
- Rule 4 stops do NOT count toward Three-Strike
- Only actual failures (fix didn't work) count toward Three-Strike
- 3 failures → /forge debug

### Compatibility with No-Confirmation Iron Law
Deviation stops do NOT violate the No-Confirmation iron law (§2.7 / §6.0.1). No-Confirmation prohibits *phase-between* confirmations. Deviation checks are *within-phase* safety valves.

---

## 6. Execution Discipline

**6.0 Anti-drift**: 6 prohibited behaviors (proxy metrics / absorb verification / relabel fixes / silent degrade / pseudo-success / modify frozen). → 详见 references/anti-drift.md

**6.0.1 No Mid-build Confirmation（铁律）**: Build 阶段内部，任务之间**绝对禁止**停下来询问用户。完成一个任务 → 一行摘要 → 立即下一个任务。唯一允许停下来的 3 种情况：Three-strike / 阻断性错误 / 分支保护。→ 详见 references/no-mid-build-confirmation.md

**6.1** Test First → CLAUDE.md §2.1 | **6.2** Atomic Commits (1 per task; 可选：config `glossary_check_on_commit: true` 启用 `runGlossaryCheck({ phase: 'build' })` commit message 术语检查) | **6.3** Verify First → §2.3, P5 chain | **6.4** Three-strike → §2.4 | **6.5** Conciseness → §2.6 (structured outputs exempt)

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

Spec/Plan not ready → §2 rejection. Subagent timeout → block → `/forge resume`. Worktree conflict → pause → manual resolve. No `.forge/` → `/forge init`.

---

## Known AI Failure Patterns · Reflection Triggers · Common Rationalizations

→ 详见 references/failure-patterns.md

---

## Context Budget Management

Mandatory token limits, structured outputs exempt. → 详见 references/context-budget.md

### Phase Boundary Gate

每个 task 或 phase 完成后，检查 Read 预算（`${TMPDIR}/forge-read-budget-<session>.json`）：

| 累积 Read | 行为 |
|-----------|------|
| < 100 KB | 继续下一 task |
| 100–150 KB | 输出 `⚠️ Context usage >60%. Execute /clear then /forge resume to continue.` 继续，但强烈建议隔离 |
| > 150 KB | 输出 `⛔ Context usage >80%. MUST /clear + /forge resume. Continuing will cause truncation.` 并停止执行 |

Phase 完成后**必须**评估 budget，即使 task 级未触发。

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

**触发信号（任一）**：auto-compact 触发并丢失任务跟踪 / 无法不重读 progress 即回忆任务编号 / Restatement 摘要 >800 tokens / 推理质量退化 / 上下文利用率 >80%。

**强制序列**：(1) 写 `.forge/knowledge/sessions/<date>-<topic>-interim.md`（含 progress snapshot / key findings / active constraints / anomalies）→ (2) 更新 `.forge/status.md` 添加 `exhaustion_pending: "true"`，phase 仍为 `"build"` → (3) 输出 `⚠️ Context exhaustion detected. Interim state saved. → Continuing with /forge resume`，然后立即调用：`Skill(skill="forge", args="resume")`。

**安全限制**：单次会话 ≤5 次耗尽轮转；interim 写入失败 2 次降级为 JSON handoff；Three-strike 触发期间不执行此协议。

→ 详见 references/context-exhaustion.md（完整 interim 模板、Step-by-step 流程、What NOT to Do 清单）

## 12. 自动推进（铁律）

<IRON-LAW name="build-auto-advance">

Build 全部任务完成且 Final Validation 通过后，**必须立即自动调用下一阶段**，不得停下来等待用户确认。

**成功时**：输出一行摘要，然后**立即调用** `Skill(skill="forge", args="review")`。

```
✅ build 完成 → 自动进入 review
```

**禁止**：
- 输出"是否继续进入 review？"
- 输出"build 完成，接下来可以运行 /forge review"
- 静默 idle（无输出、等待用户输入）— 与显式询问同罪

**失败/阻断时**：输出问题清单，停止等待用户决定。

→ 详见 shared/next-step-protocol.md

## 13. Spec Status Auto-Update

Build 全部任务完成且 Final Validation 通过后，自动检查并更新对应 spec 的生命周期状态。

### 13.1 Trigger

仅当 Build 引用了 `.kiro/specs/<spec-name>/tasks.md` 时触发。

### 13.2 Status Check

1. 读取 `.kiro/specs/<spec-name>/requirements.md` 的 frontmatter
2. 解析 `status` 字段（使用 `parseSpecFrontmatter` from `src/spec-lifecycle.ts`）
3. 检查 `tasks.md` 中所有任务的 checkbox 状态
4. **全部 `[x]`** → 更新 `status: completed`，更新 `updated: <today>`
5. **部分完成** → 仅更新 `updated: <today>`（status 不变）

### 13.3 Index Rebuild

状态更新后，运行 `node scripts/rebuild-spec-index.mjs --incremental` 同步 INDEX.md。

### 13.4 Skip Conditions

- 无对应 spec 目录 → 跳过
- Spec 无 frontmatter → 跳过
- Spec status 已是 `completed` → 跳过
- Spec status 是 `archived` → 跳过

</IRON-LAW>

---

## Read Dedup Iron Law

<IRON-LAW name="read-dedup">

在同一个 session 中对同一文件的 Read 调用**不得超过 2 次**。

- **第 2 次起**：必须使用 `forge_read_cached`（MCP tool）或 `Grep`（定向搜索）替代完整 Read。
- **回顾已读文件**：使用 Grep 搜索特定片段而非全量重读。
- **适用范围**：`/forge build`、`/forge review`、`/forge test`。

当 `forge_read_cached` MCP tool 不可用时，仍须手动控制同一文件 Read ≤2 次。

</IRON-LAW>

## Subagent Status Handling

### STATUS: DONE → 正常进入下一 task 或触发 review

### STATUS: DONE_WITH_CONCERNS
1. 读取 concerns 列表
2. 正确性/范围疑虑 → 先修复再 review；观察性疑虑 → 记录，继续 review
3. 判断结果写入 `.forge/status.md`

### STATUS: BLOCKED
1. 评估：上下文不足 → 补充重派 / 需更强推理 → 升级模型 / 任务过大 → 拆分 / 计划有问题 → 升级用户
2. 同一任务连续 BLOCKED 3 次 → 触发 Three-Strike Reroute（CLAUDE.md §2.4）

### STATUS: NEEDS_CONTEXT
1. 从 plan/spec/codebase 中获取缺失信息
2. 附加到 prompt 重新派发
3. 同一任务连续 NEEDS_CONTEXT 2 次 → 升级为 BLOCKED 处理

## TDD Red Flags — 出现以下想法时 STOP

- 代码先于测试编写
- "我先探索实现，测试后面补"
- 测试立刻通过（没有先看到失败）
- 无法解释为什么测试失败
- 测试是"后来加的"
- "这次例外"
- "我已经手动测过了"
- "保留代码当参考"
- "花了好几个小时，删掉太浪费"
- "TDD 太教条了"
- "这个不一样因为..."

**以上任何一条 = 删除代码，从测试开始。**

## Gotchas
- **Skipping RED phase**: Write implementation first, then backfill tests → tests verify implementation not behavior → must write failing test first
- **Subagent context leak**: Subagent returns full raw output → main context polluted with 50 lines of grep results → subagent must return conclusion summary only
- **Atomic commit omission**: Change 3 files, commit only 1 → inconsistent state → commit all files for each subtask immediately
- **Three-strike ignored**: Same fix attempted 4th time → wasted context → stop at 3, enter debug
- **Plan drift**: Build deviates from approved plan → scope creep → re-read plan after every 3 tasks

## Context State Classification (Layered Trimming)

### Context State Classification
When preparing context for this phase, classify the current context state:
- PEAK (ratio < 0.30): Best state, no restrictions
- GOOD (0.30 ≤ ratio < 0.50): Normal, all operations allowed
- WARNING (0.50 ≤ ratio < 0.70): Begin trimming low-priority content
- CRITICAL (ratio ≥ 0.70): Aggressive trimming + suggest checkpoint

Important: Use the raw ratio (tokensUsed / contextWindow), NOT the rounded percentage. 59.999% is still WARNING, not CRITICAL.

### Trimming Priority Chain
When context enters WARNING or CRITICAL state, trim content in this priority order (drop lowest first):

1. **Drop First**: Context files (code file contents, explore results)
2. **Drop Second**: Research findings (external docs, web search results)
3. **Keep High**: Project context (CLAUDE.md, config.md) — trim from tail
4. **Keep Highest**: Spec locked requirements, system instructions — never trim
5. **Proportional Keep**: Plan files — each plan gets proportional share, minimum 1024 bytes, truncate from tail
6. **Last to Drop**: Requirements and acceptance criteria

### Token Estimation
Use chars ÷ 4 (ceiling) for token estimation. Consistency > precision.

### Trim Transparency
After any trimming, inject:
```
<note type="context-trim">
Budget: {budget} tokens | Omitted: {omittedList} | Plan truncation: {pct}%
Full content available in .forge/ directory.
</note>
```

### Pressure-Aware Note Reserve
Only reserve 80 tokens for the trim note when in WARNING or CRITICAL state. Do not reserve in PEAK/GOOD.

## Package-Aware Build Execution

When the approved plan/tasks document contains `execution_packages`, `/forge build` MUST execute one package at a time. If `--package <id>` is omitted, infer the next incomplete package from `.forge/status.md` and `.forge/progress/`.

Package build loads only the current package, direct dependency summaries, status/config, and required task details. It MUST NOT load full completed task history unless failure diagnosis requires it. After package success: write the package summary, run package `verify_command`, update `current_package` / `completed_packages` / `next_package`, and create an atomic commit or record why commit was intentionally skipped.

`build.use_goal: true` MUST NOT hand all tasks to one `/goal` run when execution packages exist. Use one package as the goal boundary.

Package boundary decisions that are not automatic MUST use Claude Code `AskUserQuestion`
(package boundary prompt discipline).
Use it for package-boundary resume choices, unresolved dependency boundary conflicts, and any
HITL package gate. Normal package-to-package advancement in `/forge loop` remains automatic and
must not ask "是否继续".
