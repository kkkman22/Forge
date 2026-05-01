---
name: forge-build
description: "执行引擎。按计划以 TDD 方式逐任务实现代码，通过 Subagent 隔离和原子提交保证质量。"
disable-model-invocation: true
---

# /forge build — 执行引擎

> **触发方式**：标准路径第二步 / 全量路径第四步 / 轻量路径第一步 / 直接输入 `/forge build`
> **职责**：按计划以 TDD 方式逐任务实现代码，Subagent 隔离 + 原子提交
> **输出路径**：`.forge/progress/<topic>.md`（实时进度）+ 项目代码变更

---

## 1. Overview

`/forge build` turns plans into code. Three execution paths based on routing tier, TDD iron rules per task, atomic commits for traceability.

**核心原则**：测试先于代码，验证先于声明。没运行过的测试 = 不存在的测试。

**Not For**：纯文档更新 / 纯配置变更（无行为影响）/ 需求不明时（先 spec）

→ 函数签名详见 references/function-contracts.md

## 2. Pre-build Checks

标准/全量路径下，build 前必须逐条通过。任一不满足，不得继续。

| # | Check | Block Condition | Route |
|---|-------|---------|-------|
| 1 | **Spec Gate** — scan `.forge/specs/` status | Not `"locked"` (no-Spec Plan exempt) | → `/forge spec` |
| 2 | **Plan Gate** — scan `.forge/plans/` status | Not `"approved"` | → `/forge plan` |
| 3 | **Dir Integrity** — `.forge/` subdirs exist | Missing | → `forge init` |
| 4 | **Branch Gate** — current vs expected branch | Not on `feature/<topic>` or `forge/<topic>` | → Auto-switch (§2.1) |

**Rejection Output**: `🚫 Build 前置检查未通过 — 命名：<检查> 证据：<文件状态> 建议：<路由> 重入：<条件>`. Multiple failures → list all. Autonomous → JSON.

### §2.1 Branch Gate

`git branch --show-current` → read `current_task` from `.forge/status.md` → `checkBranchTopicGate`. Auto-switch requires clean working tree.

| Branch State | Action |
|---|---|
| On matching `feature/<topic>` | ✅ Pass |
| Other, branch exists | `git checkout` |
| Other, branch missing | `git checkout -b` |
| `feature/<topic>` mismatch | 🚫 Block |

**Unshipped Branch Warning**: `detectUnshippedBranches` + `detectStaleBranches`. Non-empty → warn (ship now / continue / switch). **Pre-commit**: `checkCommitTopicMatch` per commit. **Lightweight**: skip #1–#2, require #3–#4.

---

## 3. Execution Paths

### 3.1 Lightweight (≤1 file, ≤20 lines)

Direct edit, no Subagent. Pause every 2 steps for confirmation. Verify, commit. No gates, no Restatement.

### 3.2 Standard (clear requirements / has Spec)

Read task list → per task: **Closure-First Probes** (→ 详见 references/closure-probes.md) → **Subagent TDD** → progress update → atomic commit → **Final Validation** (§3.5).

**Restatement Checkpoint** (mandatory): Counter init N (default 3), decrement per task, at zero → Checkpoint (re-read progress/status/instincts → 3-block summary → interim log → reset). Exception-triggered on BLOCKED/NEEDS_CONTEXT/DONE_WITH_CONCERNS (no counter reset). ≤800 tokens.

**Subagent Status**:

| Status | Action |
|---|---|
| DONE | Review, complete |
| DONE_WITH_CONCERNS | Correctness → resolve. Observability → record, continue |
| NEEDS_CONTEXT | Supplement, re-dispatch |
| BLOCKED | Context → supplement / large → split / Plan → report |
| 429_THROTTLED | `git diff --stat` → assess. No Three-strike. Degrade, continue |

**Invocation**: `Agent(prompt, skills=["forge-test"], permissionMode="acceptEdits", maxTurns=20)`. Include: probe results, task desc, file context, knowledge, TDD reqs, verify commands, self-check, prohibitions, **framework API verification**.

**Framework API 验证**: 当任务涉及框架特定 API（React hooks、Express middleware、Prisma query 等）时，Subagent 应先验证 API 签名与项目 package.json 中的依赖版本一致，不依赖训练数据记忆。对于非平凡 API 或不确定当前版本签名时，应查阅官方文档确认。纯逻辑和标准库调用可跳过此步骤。

**Self-check**: `📋 ✅/❌ Spec 场景 ✅/❌ 安全快扫 ✅/❌ 范围检查 → DONE`

### 3.3 Full (new service/db/auth/ambiguous)

**Phase 1**: Parallel research Subagents → 函数签名详见 references/function-contracts.md. `Promise.allSettled`, `max_parallel_agents` default 6.

**Phase 2**: Module-by-module Subagent TDD. Optional Git Worktree for file overlap. Same Restatement as §3.2, init at Phase 2 start. → Final Validation.

---

## 3.4 Closure-First Probes

每任务进入 TDD 前执行探针（2 Probe + 1 Verify），确认 Plan 假设与代码库一致。→ 详见 references/closure-probes.md

**Output**: `🔍 探针（Task N） P1：✅/❌ P2：✅/❌ V1：✅/❌ → 通过/失败`

## 3.5 Final Validation

Read `ci_check_command` from config.md → execute as-is. Empty → `verify_commands` → AI auto-detect. Report: `[Command] → [Output] → [Claim]`.

**Three-Layer Truncation**: (1) `forge_exec` MCP (2) `run-with-trim.sh` fallback (3) AI Iron Law — failure output unchanged.

---

## 4. TDD Iron Rules

→ CLAUDE.md §2.1 (RED → GREEN → REFACTOR). In-Subagent enforced. Code before tests → delete, restart. → 详见 references/tdd-rules.md

### 4.1 Simplicity Check

GREEN 阶段的代码必须是"能让测试通过的最简单实现"。如果在 GREEN 阶段引入了抽象层、工厂模式或配置驱动的设计——停下来，删掉，写更简单的版本。

REFACTOR 阶段才是引入抽象的时机，且仅当同一模式重复出现 **3 次以上**时（Rule of Three）。

三行相似的代码好过一个过早的抽象。先实现朴素的、显然正确的版本。

→ 详细示例和规则详见 references/tdd-rules.md §Simplicity Check

### 4.1.1 Dead Code Hygiene

REFACTOR 完成后，扫描是否产生了孤儿代码：未使用的 import、未调用的函数或方法、未引用的类型定义、未使用的变量。

发现孤儿代码时记录到 `.forge/findings/<topic>.md`，不自行删除——删除需要确认代码确实不再被需要。

→ 详见 references/tdd-rules.md §Dead Code Hygiene

---

## 5. Failure Handling

**5.1 Three-strike**: 3 consecutive fails → `debugger` agent (maxTurns=15): read errors → one hypothesis → minimal fix → report if 3 more. `🚫 连续失败 3 次 → debugger. 尝试 1/2/3：<原因>` → 函数签名详见 references/function-contracts.md

**5.2 Test Failure**: GREEN failing → test bugs? impl misses conditions? → fix + rerun.

---

## 6. Execution Discipline

**6.0 Anti-drift**: 6 prohibited behaviors (proxy metrics / absorb verification / relabel fixes / silent degrade / pseudo-success / modify frozen). → 详见 references/anti-drift.md

**6.0.1 No Mid-build Confirmation**: Build 阶段内部，任务之间**禁止**停下来询问用户是否继续。完成一个任务后必须立即开始下一个任务，直到所有任务完成或遇到阻断性错误。禁止输出"是否继续？"、"是否继续清理/验证/实施？"等确认提示。禁止在任务之间列出剩余工作并等待用户确认。唯一允许停下来的情况：Three-strike 触发、阻断性错误、分支保护阻断。

**6.1** Test First → CLAUDE.md §2.1 | **6.2** Atomic Commits (1 per task) | **6.3** Verify First → §2.3, P5 chain | **6.4** Three-strike → §2.4 | **6.5** Conciseness → §2.6 (structured outputs exempt)

### 6.6 Change Summary

每个 Subagent 在原子提交前，必须输出三段式变更摘要：

```
📝 Task N 变更摘要
  变更：<文件列表 + 每个文件的变更描述>
  未触碰（有意）：<注意到但不在范围内的问题>
  关注点：<需要用户确认的决策>
```

**"未触碰"部分证明范围纪律**——表明 Agent 注意到了相邻问题但选择不修复。
**"关注点"部分**在 autonomous 模式下记录到 findings，interactive 模式下等待用户确认。

此摘要属于 Structured_Output，豁免于散文压缩规则（→ CLAUDE.md §2.6）。

### 6.7 Dependency Discipline

添加新依赖前必须确认以下 4 项：

1. **现有技术栈是否已能解决**：优先使用标准库和项目已有工具
2. **依赖大小**：检查 bundle 影响（`npm pack --dry-run` 或等效命令）
3. **是否活跃维护**：检查最近 commit 时间、open issues 数量
4. **许可证兼容性**：必须与项目许可证兼容

**规则**：每个依赖都是负债。不添加依赖是默认选择，添加依赖需要理由。

---

## 7. Status Updates

**7.1** Progress → `.forge/progress/<topic>.md` per task. **7.2** Interim → `.forge/knowledge/sessions/<date>-<topic>-interim.md` (≤15 lines, overwrite, delete after learn/done, resume reads first). **7.3** Phase → `.forge/status.md`. **7.4** Health → `.forge/knowledge/tool-health.md`: ≥80% 🟢 / 50-79% 🟡 / <50% 🔴.

| Done | phase → |
|---|---|
| plan | build |
| build | review |
| review | test / completed (light) |
| test | ship |
| ship | learn / completed |
| learn | completed |

---

## 8. Execution Flow

1. Path: Light / Standard / Full
2. Gates (standard/full): Spec + Plan + Dir + Branch
3. Init Counter N=3
4. Loop: Probes → TDD → status → progress → commit → counter-1
5. Full: Phase 1 research → Phase 2 modules
6. Final Validation
7. Delete interim → 自动调用 /forge review（→ 详见 shared/next-step-protocol.md）

3 consecutive same-fix → `/forge debug`

---

## 9. Edge Cases

Spec/Plan not ready → §2 rejection. Subagent timeout → block → `/forge resume`. Worktree conflict → pause → manual resolve. No `.forge/` → `forge init`.

---

## 10. Example

```
$ /forge build
🔍 前置检查... ✅ Spec 已锁定 / Plan 已批准
📋 执行计划（5 任务）
🔴 RED → FAIL ✓  🟢 GREEN → PASS ✓  🔵 REFACTOR → PASS ✓
✅ Task 1 → 提交 → 1/5
```

---

## Known AI Failure Patterns

| # | Wrong | Correct |
|---|-------|---------|
| 1 | Impl during RED | Tests only; delete impl, restart |
| 2 | Skip tests, mark done | Verify gate + P5 chain |
| 3 | Multi-task commit | 1 task 1 commit |
| 4 | Code without plan | Read Plan fully first |
| 5 | Out-of-scope edits | Plan scope only, record issues |
| 6 | Narrating edits | Silent, brief at Decision_Point |
| 7 | Self-assemble commands | ci_check_command as-is |

## Common Rationalizations

| 合理化 | 反驳 |
|---|---|
| "几行不值得写测试" | 小 bug 最难发现 |
| "先实现再补测试" | 只证明代码做了什么，不证明需求满足 |
| "太简单不会出错" | 简单函数没人检查 |

---

## Context Budget Management

Mandatory token limits, structured outputs exempt. → 详见 references/context-budget.md
