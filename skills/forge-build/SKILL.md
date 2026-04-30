---
name: forge-build
description: "执行引擎。按计划以 TDD 方式逐任务实现代码，通过 Subagent 隔离和原子提交保证质量。"
disable-model-invocation: true
---

# /forge build — 执行引擎

> **触发方式**：标准路径的第二步，全量路径的第四步，轻量路径的第一步，或用户直接输入 `/forge build`
> **职责**：按计划以 TDD 方式逐任务实现代码，通过 Subagent 隔离和原子提交保证实现质量
> **输出路径**：`.forge/progress/<topic>.md`（实时进度）+ 项目代码变更

---

## 1. Overview

`/forge build` is the core execution phase of the Forge workflow — turning plans into code. It selects one of three execution paths based on the routing tier, enforces TDD iron rules for each task, and guarantees every step is traceable through atomic commits.

**核心原则**：测试先于代码，验证先于声明。没有运行过的测试 = 不存在的测试。说"应该可以了"等于说"我没验证"。

---

## 2. Pre-build Checks

在标准路径和全量路径下，build 启动前**必须逐条通过以下前置检查**。任一条件不满足时，不得继续 build。

### Checklist

| # | Check Item | Method | Block Condition | Route on Failure |
|---|---------|---------|---------|--------------|
| 1 | **Spec Gate** | Scan `status` field in all `spec.md` under `.forge/specs/` | `status` is not `"locked"` (exempt for standard path without Spec) | → `/forge spec` |
| 2 | **Plan Gate** | Scan `status` field in all `.md` under `.forge/plans/` | `status` is not `"approved"` | → `/forge plan` |
| 3 | **`.forge/` Directory Integrity** | Check `.forge/` and its `specs/`, `plans/`, `progress/` subdirectories | Missing directory | → `forge init` |
| 4 | **Branch Gate** | Compare `git branch --show-current` with expected topic branch | Not on `feature/<topic>` or `forge/<topic>` | → Auto-switch (see §2.1) |

**Spec Gate Exemption**: When Plan specifies `spec_ref: "none（基于用户需求描述）"`, only check Plan Gate and directory integrity.

**Rejection Output Format** (Canonical Example — Spec Not Locked):

```
🚫 Build 前置检查未通过

命中检查：Spec 门禁
证据：.forge/specs/user-notification/spec.md 的 status 为 "draft"
建议路由：/forge spec — 先完成规格的 Review 和 Lock 流程
重入条件：spec.md 的 status 变为 "locked" 后，重新运行 /forge build
```

Other scenario substitutions: Plan not approved → change evidence to plan status; directory incomplete → change evidence to missing directory; multiple failures → list all failed checks.

**Autonomous mode** returns JSON: `{"success":false,"summary":"Build 前置检查未通过：<检查>","evidence":"<证据>","suggested_route":"<路由>","reentry_condition":"<重入条件>"}`

**Function Call**: `checkBuildGate(specStatus, planStatus)`
- Parameters: `specStatus` — read from `status` field in `.forge/specs/<topic>/spec.md` YAML frontmatter; `planStatus` — read from `status` field in `.forge/plans/<topic>.md` YAML frontmatter
- Returns: `{ allowed: boolean, reasons: string[] }`; when `allowed: false`, `reasons` lists all failed gates
- Purpose: Programmatically verify Spec locked and Plan approved status, replacing manual per-item checks. When `allowed: false`, use §2 rejection output format

### §2.1 Branch Gate (Check #4)

**Purpose**: Prevent multi-feature commits to wrong branches, including topic-level matching and lifecycle detection.

**Check Flow**:

1. Get current branch: `git branch --show-current`
2. Determine expected branch: `feature/<topic>` or `forge/<topic>` (both accepted)
3. Extract task topic: read `current_task` field from `.forge/status.md`
4. **Topic Match Check**: call `checkBranchTopicGate(currentBranch, taskTopic)`
   - `branchName` source: `git branch --show-current` output
   - `taskTopic` source: `current_task` field in `.forge/status.md`
   - Returns `allowed: false` → 🚫 Block build, output topic mismatch reason
   - Returns `allowed: true` → ✅ Continue
5. Compare and decide:

| Current Branch | Expected Branch State | Action |
|---------|------------|------|
| Already on `feature/<topic>` with matching topic | — | ✅ Pass |
| On other branch | Exists | `git checkout <branch>` |
| On other branch | Does not exist | `git checkout -b feature/<topic>` |
| Already on `feature/<topic>` but topic mismatch | — | 🚫 Block, prompt to switch or create correct branch |

**Auto-switch Prerequisite**: Working tree must be clean. When dirty, block and prompt `git stash` or `git commit`.

**Unshipped Branch Warning** (at build start):

After branch gate passes, before task execution, check for unfinished branch delivery records:

1. Read pending-delivery records (stored in `.forge/status.md` or configured persistence location)
2. Call `detectUnshippedBranches(pendingDeliveries, currentTopic)`
   - `pendingDeliveries` source: `PendingDeliveryRecord[]` read from persistence location
   - `currentTopic` source: current task topic
   - Returns non-empty → ⚠️ Show warning with three options:
     1. Ship immediately (switch to that branch and run `/forge ship`)
     2. Continue on current branch (confirm to proceed with build)
     3. Switch to new branch (stop build, switch branch)
3. Call `detectStaleBranches(pendingDeliveries, currentTopic, currentTime)`
   - `currentTime` source: `Date.now()`
   - `thresholdMs` configurable in `.forge/config.md` (default 0: any pending delivery with different topic is marked stale)
   - Returns non-empty → ⚠️ Show stale branch warning

**Pre-commit Topic Check**:

Before each atomic commit, call `checkCommitTopicMatch(currentBranch, commitTopic)`:
- `branchName` source: `git branch --show-current`
- `commitTopic` source: current task topic
- Returns `allowed: false` → 🚫 Block commit, output cross-topic contamination warning
- Returns `allowed: true` → ✅ Allow commit

**Output Format** (Canonical Example — Branch Switch):

```
🔀 分支切换
当前分支：main
期望分支：feature/ship-delivery-unification
操作：已自动切换到 feature/ship-delivery-unification
继续 build...
```

**Output Format** (Canonical Example — Topic Mismatch):

```
🚫 分支 topic 不匹配
当前分支：feature/skill-document-optimization
任务 topic：branch-lifecycle-enforcement
操作：请切换到正确的分支或创建新分支
  git checkout feature/branch-lifecycle-enforcement
  或: git checkout -b feature/branch-lifecycle-enforcement
```

Other scenarios: branch does not exist → output "branch creation" and `checkout -b`; cross-feature branch → output ⚠️ warning; dirty working tree → 🚫 block and suggest stash/commit.

**Lightweight Path Exception**: Skip checks #1 and #2, but still require #3 and #4 (including topic matching).

---

## 3. Three Execution Paths

### 3.1 Lightweight Path (Light)

Applicable to small tasks affecting ≤ 1 file with ≤ 20 lines of change.

1. Modify code directly, no Subagent launched.
2. **Pause every two steps** — after modifying two locations, pause, show changes, and wait for confirmation.
3. After modifications complete, run verification commands.
4. Commit changes.

**No Gate Requirements**: Skip Spec and Plan gates. **No Restatement**: Changes are small enough that attention decay is not a concern.

### 3.2 Standard Path (Standard)

Applicable to medium tasks with clear requirements or existing Spec.

**Flow**:

1. Read task list from `.forge/plans/<topic>.md`, detect `format` field.
2. For each atomic task, execute **Closure-First Probes** (§3.4), then launch **Subagent** to run TDD cycle (RED → GREEN → REFACTOR).
3. After each task completes: update progress, execute atomic commit (using Plan-defined commit message).
4. After all tasks complete, execute **Final Validation** (§3.5).

**Restatement Checkpoint (Context Refresh)**:

Restatement is a **mandatory step** in the orchestration loop, not an optional optimization. Skipping Restatement equals allowing attention decay to erode execution quality.

- **Counter Initialization**: At build start, initialize to N (N = config.md `restatement_interval`, default 3, range 2–10. Use default if missing, do not block).
- **Counter Check**: Before dispatching next Subagent, when counter reaches zero, execute Checkpoint, then proceed to probes.
- **Counter Decrement**: After each task completes (after progress update + atomic commit), decrement by 1.

**Checkpoint Execution Steps**:

1. **Re-read Status**: Re-read `.forge/progress/<topic>.md` and `.forge/status.md`
2. **Refresh Knowledge**: Re-read `.forge/knowledge/instincts.md`
3. **Append Summary**: Append 5-block summary at context tail (do not modify System Prompt)
4. **Write Interim Log**: Update `.forge/knowledge/sessions/<date>-<topic>-interim.md`
5. **Reset Counter**: Reset to N

**Restatement Summary Format** (3 required blocks):

```
━━━ 📋 Restatement（Task N/M）━━━

📊 进度：已完成 N/M
  ✅ <已完成任务列表>
  🔜 <下一个任务>

🎯 下一步：Task X — <完整标题和文件路径>

🧠 活跃提示：
  • <从 status.md hints 提取的活跃提示>
  • <最相关的 1 个直觉模式匹配，附 confidence>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Exception-triggered Restatement**: When Subagent returns BLOCKED / NEEDS_CONTEXT / DONE_WITH_CONCERNS, execute Checkpoint **immediately** (do not reset cycle counter). Add exception block to summary:

```
🚨 异常状态：Subagent 返回 <状态>
  任务：Task N — <标题>
  原因：<报告的原因>
  处理：BLOCKED → 评估原因 | NEEDS_CONTEXT → 补充重派 | DONE_WITH_CONCERNS → 阅读判断
```

**Token Cost Constraint**: Single Checkpoint ≤800 tokens. 10 tasks (N=3) total overhead ≤ 5% of total tokens.

**Subagent Isolation**: Each Subagent has fresh context; dependencies are passed through the file system.

**Subagent Status Handling Protocol**:

| Status | Handling |
|------|---------|
| **DONE** | Enter review step, then mark complete |
| **DONE_WITH_CONCERNS** | Read concerns. Correctness/scope issues → resolve first then review. Observability suggestions → record findings, continue |
| **NEEDS_CONTEXT** | Provide missing context, re-dispatch |
| **BLOCKED** | Evaluate: 1) Insufficient context → supplement and re-dispatch; 2) Task too large → split; 3) Plan issue → report to user |

**Never** ignore Subagent escalation requests.

**Subagent Instruction Construction**: For each Subagent include: (1) Closure-First probe results (2) Task description (3) File context (4) Knowledge retrieval (instincts/known-failures matches) (5) TDD requirements (6) Verification commands (7) Pre-completion self-check (8) Prohibitions (no out-of-scope file changes, no skipping tests) (9) Failure retry Restatement.

**Lightweight Format**: When Plan specifies `format: "lightweight"`, additionally inject Design Reference context (read the section pointed to by `designReference`, extract interface definitions and correctness properties). If `propertyRef` exists, property tests must be written.

**Subagent Invocation**: `Agent(prompt="<指令>", skills=["forge-test"], permissionMode="acceptEdits", maxTurns=20)`

Pre-loading `forge-test` skill gives Subagent automatic full knowledge of the test engine.

**Subagent Pre-completion Self-check**:

| Self-check Item | Handling on Failure |
|--------|--------------|
| Spec scenario coverage | Add tests, re-run RED→GREEN |
| Security quick scan (hardcoded secrets/injection/auth) | Fix immediately |
| Scope check (only modify specified files) | Revert out-of-scope changes |

**自检输出**：`📋 任务自检 ✅/❌ Spec 场景 ✅/❌ 安全快扫 ✅/❌ 范围检查 → 状态：DONE`

### 3.3 Full Path (Full)

Applicable to complex tasks involving new services, new databases, authentication system changes, or ambiguous requirements.

**Phase 1: Parallel Research**

**Function Call**: `buildResearchSubagents(topics)`
- Parameters: `topics` — research topic list (`string[]`, extracted from Plan research questions)
- Returns: `SubagentInvocation[]` (each containing prompt, subagent_type, and other config)
- Purpose: Construct parallel research Subagent invocation config, replacing manual per-item construction

Launch multiple research Subagents in parallel via Agent tool (architecture/dependencies/risks), await with `Promise.allSettled`.

**并发控制**：并行 Subagent 数量受 `.forge/config.md` 中 `max_parallel_agents`（默认 6）限制。收到 HTTP 429 时按降级策略减少并发数。详见 CLAUDE.md §6 Session Boundaries。

**Function Call**: `mergeResearchFindings(results)`
- Parameters: `results` — `SubagentResult[]` (return results from all research Subagents)
- Returns: Merged research findings string
- Purpose: Merge multiple parallel research results into unified document, write to `.forge/findings/<topic>.md`

**Phase 1 does not use Restatement**: Executed by independent Subagents in parallel; main Agent only waits for aggregation.

**Phase 2: Module-by-module Implementation**

1. Group tasks by module based on research findings and Plan.
2. Launch Subagent for each module to run TDD cycle.
3. **Optional Git Worktree**: Use when module changes have file overlap; if no overlap, execute directly on main branch.
4. After all modules complete, execute Final Validation (§3.5).

**Restatement Checkpoint**: Phase 2 module-by-module implementation uses the **exact same** Restatement mechanism as §3.2 (counter initialization, checking, Checkpoint steps, summary format, exception trigger, lightweight path exclusion). Initialize counter at Phase 2 start.

---

## 3.4 Closure-First Probes (2 Probe + 1 Verify)

每个原子任务进入 TDD 循环前，**必须先执行 Closure-First 探针**。借鉴 Vibe-Skills 反死寂设计——避免 AI 在错误假设上浪费 token。

**Probe Execution Method**: Use `explore` agent (`Agent(prompt="<探针指令>", subagent_type="explore")`).

### Graph-Based Probe Strategy (Primary)

When `code-review-graph` is available, use graph queries for more precise results with ~80% fewer tokens (~1500 → ~300 tokens per probe set).

**Prerequisites**: Check `which code-review-graph` and verify index exists. If either fails, silently fall back to grep-based probes.

| Step | Primary Method (graph) | Fallback Method (grep) | Purpose |
|------|------|------|------|
| **Probe #1** | `code-review-graph query files <pattern>` | Glob-based file search | Confirm repo structure matches Plan assumptions |
| **Probe #2** | `code-review-graph query impact <symbol>` + `code-review-graph query callchain <function>` | Grep-based text search | Locate code entry points and dependency relationships |
| **Verify #1** | Run narrowest-scope verification command | Same | Confirm current codebase state is healthy |

### Fallback Detection

Before each probe execution:
1. Run `which code-review-graph` — if not found, use grep fallback
2. Check if graph index exists — if not built, use grep fallback
3. On timeout (>5s), fall back to grep for this probe execution only

### Probe Output Format

`🔍 Closure-First 探针（Task N） Probe #1：✅/❌ <结果> Probe #2：✅/❌ <结果> Verify #1：✅/❌ <结果> → 探针通过/失败`

**Failure Handling**: Probe #1 fails → check if Plan is outdated; Probe #2 fails → broaden search or NEEDS_CONTEXT; Verify #1 fails → fix existing issues first.

**Lightweight Path Exception**: Skip probes.

---

## 3.5 Final Validation

After all tasks complete, execute full validation:

1. Read `ci_check_command` field from `.forge/config.md`.
2. **Non-empty** → Execute the command as-is (no substitution, omission, or splitting).
3. **Empty/missing** → Execute from `verify_commands` list; if also empty, fall back to AI auto-detection.
4. Report using P5 evidence chain format: `[Command] → [Output] → [Claim]`.

### Three-Layer Output Truncation Defense

When invoking `ci_check_command` during TDD GREEN or REFACTOR phases, wrap with `scripts/run-with-trim.sh`:

```bash
scripts/run-with-trim.sh npm run check
```

The three layers work together:

1. **RTK (optional, user-installed)**: If user has RTK globally installed, its hooks auto-compress Bash output (framework-aware, 90+ patterns). Forge does NOT install RTK, does NOT hardcode `rtk` prefix in `ci_check_command`.
2. **run-with-trim.sh**: Success-only truncation — any framework's success output is noise, truncation is safe and framework-agnostic. Failure output passed through unchanged.
3. **AI Trimming Iron Law** (§Context Budget Management): Failure output enters context unchanged, AI compresses on subsequent references. Framework-aware via AI semantic understanding.

Failure output compression is handled by Trimming Iron Law, NOT by the wrapper.

---

## 4. TDD Iron Rules

→ Follow CLAUDE.md §2.1 TDD Enforcement (RED → GREEN → REFACTOR cannot be skipped)

**Build Phase Additions**:

- **In-Subagent TDD**: Each Subagent independently executes the full TDD cycle. Code written before tests → delete code, restart from tests. Do not retain, reference, or read deleted code.
- **Run at every step**: RED confirms failure, GREEN confirms pass, REFACTOR confirms no regression. Test passing at RED stage = test was written wrong.
- **Tests accommodating code ≠ code satisfying requirements**. Writing code first then adding tests is the former.

---

## 5. Failure Handling

### 5.1 Consecutive Failure Escalation

→ Follow CLAUDE.md §2.4 Three-strike Reroute

**Function Call**: `analyzeFixAttempts(sequence)`
- Parameters: `sequence` — fix attempt sequence for current task (type `FixAttemptSequence`, containing each attempt's result and reason)
- Returns: `{ shouldEscalate: boolean, consecutiveFailures: number, escalationIndex: number }`; `shouldEscalate: true` triggers three-strike reroute
- Purpose: Programmatically determine consecutive failure count, decide whether to escalate to `/forge debug`

**Escalation Behavior**: After 3 consecutive failures, switch to `debugger` agent for root cause analysis (`Agent(prompt="<失败上下文>", subagent_type="general-purpose", permissionMode="acceptEdits", maxTurns=15)`). Debugger focuses on: (1) fully reading error messages (2) one hypothesis at a time (3) minimal change fix (4) report to user if 3 more failures.

**Escalation Output**: `🚫 连续失败 3 次 → 切换 debugger agent。尝试 1/2/3：<原因>`

### 5.2 Test Failure Handling

GREEN phase test still failing: (1) Check if test itself has bugs (2) Check if implementation misses conditions (3) Test issue → fix and re-run RED→GREEN (4) Implementation issue → fix and re-run.

---

## 6. Execution Discipline

The following disciplines are hard constraints during the build phase:

### 6.0 Anti-drift Execution Guardrails

| Prohibited Behavior | Description |
|---------|------|
| Optimizing proxy metrics while abandoning frozen targets | Must not write meaningless tests for coverage numbers while ignoring Spec core scenarios |
| Absorbing verification material as product truth | Must not hardcode test example data as product logic |
| Relabeling limited fixes as universal completion | Must not fix one edge case and claim "all done" |
| Silent degradation | Must not silently switch to degraded approach when main path fails without informing user |
| Pseudo-success | Must not swallow errors, output templated pass results, or pretend success |
| Modifying frozen files | Must not modify locked Spec or approved Plan during build phase |

If Spec has anti-drift declarations (primary target / non-target proxy metrics / verification material role), use primary target as the sole judgment criterion.

**Status File Protection**: Observe `.forge/config.md` protection zones — 🔒 Frozen zone immutable, 🛡️ Protected zone append-only, 🟢 Open zone freely modifiable. Violation causes immediate block and report.

### 6.1 Test First, Then Code

→ Follow CLAUDE.md §2.1 TDD Enforcement

### 6.2 Atomic Commits

One commit per task, using Plan-defined commit message. Do not mix multi-task changes.

### 6.3 Verify Before Declaring Complete

→ Follow CLAUDE.md §2.3 Verification Iron Rules

**P5 Evidence Chain**: `[Command] → [Output] → [Claim]`. Skipping any link is prohibited.

**Verification Gate Function**: Identify → Run → Read → Verify → Then mark complete. Skipping any step = lying.

**Only Accepted Completion Evidence**: Actual output from verification commands. "Should work", "looks fine", "Subagent said done" are not accepted.

### 6.4 Three-strike Reroute

→ Follow CLAUDE.md §2.4 Three-strike Reroute

### 6.5 Output Conciseness

→ Follow CLAUDE.md §2.6 Output Conciseness

All structured outputs defined in this SKILL (TDD markers, probe results, Restatement summaries, P5 evidence chains, progress updates) are not subject to conciseness constraints.

---

## 7. Status Updates

### 7.1 Progress Update

After each task completes, update `.forge/progress/<topic>.md`, marking completed/in-progress/blocked tasks.

### 7.2 Interim Session Log

At each Restatement Checkpoint, synchronously update `.forge/knowledge/sessions/<date>-<topic>-interim.md` (≤15 lines, containing progress snapshot, key findings, active constraints, exception records). Overwrite the same file each time (no accumulation). Delete after `/forge learn` or build fully completes. `/forge resume` prioritizes reading this file to restore context.

### 7.3 Phase Update

After each command completes, update the `phase` field in `.forge/status.md` to the next command in sequence.

### 7.4 Verification Command Health Tracking

During build phase, record each verification command's execution result to `.forge/knowledge/tool-health.md`.

**Health Determination**: ≥80% → 🟢 Healthy; 50%-79% → 🟡 Degraded (inject warning in next plan knowledge retrieval); <50% → 🔴 Unhealthy (suggest alternative commands or fix environment first).

**Anti-loop Protection**: Same failure reason for the same command is recorded only once.

### Phase Transition Table

| Current Command Completed | phase Updated To |
|-------------|-------------|
| `/forge plan` | `build` |
| `/forge build` | `review` |
| `/forge review` | `test` (standard/full) or `completed` (lightweight) |
| `/forge test` | `ship` |
| `/forge ship` | `learn` (full) or `completed` (standard) |
| `/forge learn` | `completed` |

---

## 8. Execution Flow

1. **Path Determination**: Lightweight (≤1 file, ≤20 lines) / Standard (has Spec) / Full (new service/database/authentication/ambiguous requirements)
2. **Pre-build Gate Checks** (standard/full): Spec locked + Plan approved + Directory integrity + Branch correct
3. **Initialize Restatement Counter** (standard/full): Set to N (default 3)
4. **Loop**: Closure-First Probes → Subagent TDD → Check status → Update progress → Atomic commit → Counter -1
5. **Full Path Extra**: Phase 1 parallel research → Phase 2 module-by-module implementation
6. **Final Validation**: ci_check_command or verify_commands
7. **Delete interim logs**
8. → `/forge review`

**Failure Escalation**: Same fix fails 3 consecutive times → Counter +1 → Reaches 3 → Stop → Enter `/forge debug`

---

## 9. Edge Case Handling

| Scenario | Handling |
|------|---------|
| Spec not locked | Use §2 rejection output format, route to `/forge spec` |
| Plan not approved | Use §2 rejection output format, route to `/forge plan` |
| Both Spec + Plan not ready | §2 multiple check failure format, list each item |
| Subagent execution timeout | Terminate Subagent → mark progress as blocked → prompt `/forge resume` |
| Git Worktree merge conflict | Pause merge → list conflicting files → wait for manual resolution |
| No `.forge/` directory | §2 rejection output format, route to `forge init` |

---

## 10. Examples

**Standard Path Execution**:

```
$ /forge build

🔍 前置检查...
✅ Spec 已锁定 / Plan 已批准

📋 开始执行计划（5 个任务）

━━━ Task 1/5：创建通知服务核心接口 ━━━
🔴 RED — 写失败的测试 → FAIL ✓（预期失败）
🟢 GREEN — 写最少代码让测试通过 → PASS ✓
🔵 REFACTOR — 重构 → PASS ✓（无回归）
✅ Task 1 完成 → 提交 → 进度：1/5
```

---

## Known AI Failure Patterns

| # | Failure Pattern | Wrong Behavior | Correct Approach |
|---|---------|---------|---------|
| 1 | Writing implementation during TDD RED | "Conveniently" writing implementation too | RED only writes tests; if implementation already written, delete and restart |
| 2 | Skipping tests and marking complete | Saying "task done" without running tests | Execute verification gate function, declare complete with P5 evidence chain |
| 3 | Mixing multiple tasks in one commit | Combining two or three task changes into one commit | One task one commit, using Plan-defined message |
| 4 | Coding without reading plan | Starting to code from memory | Fully read Plan at build start, re-read description before each task |
| 5 | Casually modifying out-of-scope code | Changing "not great" code seen along the way | Only modify Plan-specified scope, record out-of-scope issues to findings |
| 6 | Narrating code edits step by step | Outputting preview and explanation before each operation | Execute silently, only output brief notes at Decision_Point |
| 7 | Self-assembling verification commands | Building partial commands instead of using ci_check_command | Execute config.md's ci_check_command as-is, no substitution or omission |

---

## Context Budget Management

### Hard Token Limits (Iron Law)

The following limits are **mandatory constraints**, enforced at every tool output boundary. Use imperative language: MUST truncate, MUST replace, MUST NOT exceed.

| Source | Trigger | Max Tokens | Mandatory Action |
|--------|---------|-----------|-----------------|
| Explore Agent results | Always | 300 | MUST truncate to structured summary: entry points + dependency chain + tests + interfaces |
| Subagent execution results | Always | 200 | MUST replace full transcript with extract: status / task / changes / test result / commit hash / self-check |
| Test output (all pass) | All tests pass | 50 | MUST replace with single line: `✅ <pass>/<total> tests passed (<duration>)` |
| Test output (failures) | Any test fails | 300 | MUST keep only failure names + error messages. MUST discard all passing test details |
| Git diff | >50 lines | 200 | MUST replace with file-level summary: filename + change type (added/modified/deleted) |
| Git status | >30 files | 200 | MUST replace with categorized summary |
| Command output | >100 lines | 200 | MUST keep last 20 lines + error/warning pattern matches |

### Structured Output Exemption

All Structured_Output formats are **exempt** from truncation regardless of token limits:
- TDD phase markers (🔴 RED / 🟢 GREEN / 🔵 REFACTOR)
- P5 evidence chains (`[Command] → [Output] → [Claim]`)
- Restatement summaries
- Closure-First Probe results
- Review reports

### Lifecycle Classification

| Information Source | Lifecycle | Handling |
|--------|---------|---------|
| Plan task list | Persistent | Retain in context, refresh at Restatement |
| Current task description | Persistent | Retain in context, refresh at Restatement |
| TDD cycle output | Phase-scoped | Retain for current phase, replace with summary at Restatement |
| Progress updates | Write-and-discard | After writing, only retain confirmation info |

### Trimming Execution Timing

1. After Explore Agent returns → MUST truncate to ≤300 tokens structured summary
2. After Subagent returns → MUST replace with ≤200 tokens extract
3. After test run → all pass: MUST replace with ≤50 tokens single line; failures: MUST keep only failures ≤300 tokens
4. After Git operation → diff >50 lines: MUST replace with file-level summary ≤200 tokens; status >30 files: MUST replace with categorized summary ≤200 tokens
5. After write-and-discard → replace full content with confirmation info

---

## Reflection Triggers

The following scenarios are **reasoning triggers** — when encountered, pause and ask yourself a question, then decide next steps based on the answer. Do not mechanically execute threshold judgments; combine with context for judgment.

| Trigger Scenario | Ask Yourself | Interactive Handling | Autonomous Handling |
|---------|--------|-----------------|----------------|
| Appending code to an already long file | Is the file taking on too many responsibilities? Does the new code align with core responsibilities? | Explain file responsibility scope to user, ask whether to split | Record to findings (path + responsibilities + split suggestion), continue execution |
| Adding method to a class with many methods | Is this class becoming a god class? Does the new method align with core abstraction? | Show method list and new method purpose, ask whether to extract | Record to findings (class name + method summary + extraction suggestion), continue |
| Adding `if (special case)` branch | Is this handling a legitimate business rule, or patching a design flaw? | Explain branch reason, ask whether to use strategy/polymorphism replacement | Record to findings (location + situation + alternative), continue |
| Copy-pasting code | Is there a common abstraction behind this? How many places need change if modified? | Show duplicated code, ask whether to extract shared function | Record to findings (location + content + extraction suggestion), continue |
| Adding 4+ parameters to a function | Can parameters be grouped? Is the function taking on too many responsibilities? | Show signature and new parameter, ask whether to introduce parameter object | Record to findings (signature + purpose + grouping suggestion), continue |
| Creating a new utility class | Do the functions have cohesion? Should they be distributed to domain modules? | Explain function list, ask whether to distribute by domain | Record to findings (class name + functions + attribution suggestion), continue |

**关键原则**：反射触发器触发**思考**，不触发**行动**。autonomous 模式下不自行拆分——记录观察，继续执行。
