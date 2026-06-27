---
description: "Use when running `/forge ship`, all review and test gates have passed, or a branch or pull request is ready to push"

dispatch_mode: fork
allowed_tools:
  - Read
  - Bash
  - Write
---

## Current Context

Branch: !`git branch --show-current`
Review status: !`head -3 .forge/reviews/*.md 2>/dev/null || echo "no review"`
Test status: !`echo "run: npm run check"`
Uncommitted: !`git status --short 2>/dev/null | head -10 || echo "clean"`

# /forge ship — 交付引擎

**Use when** all gates have passed (review, test, optionally acceptance) and you are ready to merge/release. This is the *final delivery step* — enforcing compliance checks, executing merge, tagging release. Do not confuse with `/forge accept` (running acceptance scenarios) or `/forge verify` (producing evidence verdicts).

> **触发方式**：标准路径第五步 / 全量路径第七步 / 用户输入 `/forge ship`
> **职责**：有门禁检查的交付流程，确保只有通过评审和测试的代码才能交付
> **输出路径**：交付产物（merge/PR/branch）+ 提示 `/forge learn`

---

## 0. 从 PR 恢复

当用户以 `/forge ship <pr-url-or-number>` 或 `/forge ship --from-pr <value>` 调用时：

1. 运行 `node scripts/resume-from-pr.mjs <value>` 恢复上下文
2. 成功 → 基于 PR context 执行后续 ship 门禁和交付流程
3. 失败 → 输出错误诊断 + 建议手动恢复步骤，中止 ship

**复用现有实现**：`scripts/resume-from-pr.mjs` 不需要修改。

## 1. Overview

`/forge ship` 是 Forge 工作流的最后一道关卡——在代码离开开发环境之前，确认所有质量门禁都已通过。它检查三个前置条件（评审通过、测试通过、任务完成），加上可选的第四道门禁（Acceptance Scenario Eval），然后提供四种交付选项供开发者选择。

**核心原则**：交付是一个有意识的决定，不是流程的自动终点。每一次 ship 都需要开发者明确选择交付方式，丢弃操作需要二次确认。

**伪成功禁令**：Ship 阶段绝不允许：门禁失败时吞掉错误继续交付、用模板化"通过"替代实际检查、测试未运行时声称"测试通过"、Review 报告不存在时声称"评审通过"。

**Not For**：review 或 test 未执行 / 存在未解决的 P0/P1 问题

### §1.5 Pre-flight: Branch Gate

调用 `runBranchGate({ skill: "ship", mode, currentBranch, currentTask, pendingDeliveries, alreadyCheckedThisPhase, isCleanTree })`：
- `passed` / `skipped` → 继续后续 §
- `auto_fixed` → 输出 `✅ 已自动切换到 <newBranch>` 后继续
- `blocked` → 中止 skill，按 mode 输出对应提示
- `warned` → 输出警告但继续

默认严重度：block。可通过 `severityOverride` 覆盖。

## 2. Gate Checks

<HARD-GATE name="ship-gate-sequence">

`/forge ship` 启动前**必须通过三道门禁**（Review / Test / Progress），每道门禁的结果必须以 P5 证据链格式呈现（`[Command] → [Output] → [Claim]`）。

**Optional Gate 4 — Acceptance Scenario Eval**：当 spec frontmatter 含 `acceptance_eval: true` 或 CLI 带 `--with-acceptance` 参数时，在三道门禁后执行 `/forge accept`。`acceptance_blocks_ship: true` 时 FAIL 场景阻断 ship；默认为警告级。`--promote-derived` 允许 derived scenario 参与阻断判定。

→ 详见 references/gate-checks.md（门禁表、证据格式、Review Freshness Check 完整流程）

**函数调用**：`runAllGates(input)`
- 参数：`RunAllGatesInput`（含 `reviewDir`、`testResultsDir`、`progressDir`、`featureName`、`latestCommitHash`、可选 `methodology`、`configCICheck`、`gitLogFn`、`skipOptions`）
- 返回：`ShipGateReport`（含 `gates`、`allPassed`、`skipGate`、`runId`），按 Review → Test → Progress 顺序执行
- 用途：从 `.forge/` 文件系统自动读取门禁数据，执行三道门禁检查。任一阻断门禁失败 → `allPassed=false`，输出 `reason` 并退出；全部通过 → `allPassed=true`，继续交付流程。这是 ship 流程的**首选门禁入口**，内部调用 `checkReviewGate`、`checkTestGate`、`checkProgressGate`

**函数调用**：`persistGateResults(report, shipDir)`
- 参数：`report` — `runAllGates` 返回的 `ShipGateReport`；`shipDir` — `.forge/ship/` 目录路径
- 用途：将门禁结果持久化到 `.forge/ship/<run-id>-gates.json`，含每道门禁的 passed/reason/details 和 allPassed 汇总

**函数调用**：`checkShipGate(review, test, progress)`
- 参数：`review` — 从 `.forge/reviews/<topic>.md` frontmatter 解析的 `ReviewResult`（含 `result`、`p0_count`、`p1_count`）；`test` — 从 Layer 1 + Layer 3 验证结果构造的 `TestResult`（含 `passed`、`failedCount`）；`progress` — 从 `.forge/progress/<topic>.md` 解析的 `ProgressResult`（含 `totalTasks`、`completedTasks`）
- 返回：`{ allowed: boolean, reasons: string[] }`，`allowed: false` 时 `reasons` 列出所有未通过的门禁
- 用途：程序化执行三道门禁检查（已有预解析数据时使用），替代 `runAllGates` 的文件系统读取

**函数调用**：`validateSkipGateOptions(options)`
- 参数：`SkipGateOptions`（含 `skipGates`、`skipAll`、`force`、`isInteractive`）
- 返回：`string | null`，验证失败返回错误信息，通过返回 `null`
- 用途：验证 `--skip-gate` 参数合法性。`--skip-gate=all` 在交互模式禁止、非交互模式需要 `--force`

**函数调用**：`buildSkipGateAnnotation(options)`
- 参数：`SkipGateOptions`
- 返回：`string`，格式 `[skip-gate: <gate-name> reason=<reason>]`
- 用途：构建跳过门禁的 commit message 标注

**函数调用**：`checkShipGateWithChecklist(review, test, progress, checklist)`
- 参数：同 `checkShipGate` 的三个参数 + `checklist` — P1 Fix Checklist 条目（`ChecklistEntry[]`，含修复项和验证状态）
- 返回：`{ allowed: boolean, reasons: string[] }`，额外检查 P1 修复条目是否全部验证通过
- 用途：当存在 P1 Fix Checklist 时使用此扩展门禁，确保所有 P1 修复已验证

**三道门禁必须同时通过**。任一不通过，阻断 ship。

**Gate 4 — Pending Findings Check**：检查 `.forge/progress/<task>-pending-findings.md` 是否存在且含未关闭 P0/P1：
- 文件不存在 → 跳过检查（首次运行兼容）
- 文件存在 + 含 P0/P1 行 → 阻断 ship，提示修复后重新 review
- 文件存在 + 无 P0/P1 → 通过
- 通过后删除 pending-findings 文件（已消费）

**Gate 4b — Backlog Capture（forge-review-fix-optimization R6.1/R6.2/R6.4/R6.6）**：Gate 4 通过后，把 review 报告里**未修复的 P2/P3** finding 追加到 `.forge/backlog.md`（不阻断 ship——P2/P3 允许延后）。
- **实现**：`appendToBacklog(parseBacklog(read(".forge/backlog.md") ?? generateBacklogHeader()), newEntries)`（`src/backlog.ts`）。`appendToBacklog` 自动去重（R6.2，按 finding fingerprint id），文件不存在时先写 `generateBacklogHeader()`（R6.6）。
- **newEntries 构造**：每条含 `{id, severity: "P2"|"P3", filePath, lineNumber, description, sourceReview: ".forge/reviews/<topic>.md", originTask: <current task>, capturedDate: <ISO today>, resolved: false}`（R6.4 打日期 + originTask 标签）。
- 仅取 review 报告中**状态非 fixed/verified** 的 P2/P3；P0/P1 已被 Gate 4 阻断，不会进 backlog。

**Gate 拦截自动沉淀**：门禁拦截时调用 `buildShipGateBlockArtifacts(topic, tier, reason, situation, now, seq)`（`src/ship.ts`）生成 episode + Evolution 标记（target=`forge-ship#ship_gate_blocked`）。`reason` 推导：未提交工作树 → `uncommitted` → outcome=`partial`；checklist 未验证 → `checklist_failed` → outcome=`failure`。写入失败降级为 `console.warn`。

**函数调用**：`checkShipGateWithFreshness(review, test, progress, reviewedCommit, currentHead, changedFiles)` — 扩展 `checkShipGate` 的门禁检查，集成 `checkReviewFreshness` 逻辑，一步完成门禁 + 新鲜度校验。返回 `{ allowed, reasons, freshnessWarning }`

**函数调用**：`checkReviewFreshness(reviewedCommit, currentHead, changedFiles)`
- 参数：`reviewedCommit` — 从 review 报告 frontmatter 的 `reviewed_at_commit` 字段读取（`string | undefined`）；`currentHead` — `git rev-parse HEAD` 输出；`changedFiles` — `git diff --name-only` 输出
- 返回：`{ fresh: boolean, reason: string, changedFiles?: string[] }`
- 用途：检测 review 后是否有项目代码变更，输出警告但不阻断 ship

**全部通过**后进入交付选项选择。

**Escape Hatch — `--force-skip-review`**：在极端紧急场景（CI 系统也下线、所有 fallback 不可用、但必须紧急 ship）时，提供 `--force-skip-review --reason="<non-empty>"` CLI 选项。此可逆逃生阀：

- 绕过 methodology 字段检查和所有门禁
- 在 commit message 中添加 `Reviewed-by: SKIPPED-BY-FORCE (reason: <user input>)`
- 写入审计记录到 `.forge/findings/force-skip-review-<date>.md`，含 commit hash、reason、timestamp 和 user identity

此逃生阀**可逆**：移除 flag 即可重新启用正常门禁。滥用可通过 findings 文件追溯。

**函数调用**：`checkShipGateWithForceSkip(review, test, progress, options)`
- 参数：`review` — `ReviewResult`；`test` — `TestResult`；`progress` — `ProgressResult`；`options` — `ShipOptions`（含 `forceSkipReview?: boolean`、`forceSkipReason?: string`）
- 返回：`{ allowed: boolean, reasons: string[], forceSkipped?: boolean }`
- 用途：当 `forceSkipReview=true` 且 `forceSkipReason` 非空时，绕过所有门禁并返回 `allowed=true`

**函数调用**：`recordForceSkip(commitHash, reason, user)`
- 参数：`commitHash` — commit hash；`reason` — force-skip 原因；`user` — 用户标识
- 用途：记录 force-skip 事件到 findings 文件以供审计

</HARD-GATE>

---

## 3. Four Delivery Options

门禁检查全部通过后，使用 AskUserQuestion 询问用户选择：**Merge to main** / **Create PR** / **Keep branch** / **Discard**（需二次确认）。

### §3.1 Sandbox Advisory Checkpoint

Phase 1 advisory: **does not block**, only warns.

**Before executing any shell command** (git merge, git push, gh pr create, etc.), call `checkCommandPolicy(command, sandboxConfig)`:

```
import { loadSandboxConfig, checkCommandPolicy } from "./sandbox-policy.js";
const sandboxConfig = loadSandboxConfig();
const result = checkCommandPolicy(command, sandboxConfig);
if (!result.allowed) {
  // Output warning, do NOT block the command
  console.warn(`⚠️ 沙箱策略建议阻止此操作：${result.reason}（Phase 1 advisory，不阻断）`);
}
```

**Trigger**: Any `Bash` tool call executing git, gh, or other commands during delivery.

→ 详见 references/delivery-options.md（AskUserQuestion 格式、四选项执行细节、Pending-Delivery 记录、Autonomous Mode 配置）

---

### 3.5 Compaction Recovery Check

IF 本次执行是从 conversation summary 恢复（上下文压缩后继续），THEN：
1. 重新读取本 SKILL.md 完整内容（你正在读的就是）
2. 确认三道门禁的检查结果在 summary 中有 P5 证据链记录
3. 确认未跳过 §3 Four Delivery Options 中的任何步骤（特别是 AskUserQuestion 合并选项）
4. 从中断点继续执行

正常流程（无 compaction）忽略此段落。

---

## 3.5 Spec Status Update

Ship 成功交付后，**主动将匹配 spec 的 status 更新为 `completed`**：

1. 从当前 feature branch 名称提取 spec slug（匹配 `forge/|feature/|spec/` 前缀后的部分）
2. 读取 `.forge/specs/<slug>/requirements.md` 的 frontmatter
3. 如果 status ∈ {`locked`, `in_progress`, `approved`}，**先运行覆盖门禁**：
   `node scripts/check-spec-close-coverage.mjs <slug>`
   - **exit 0** → 通过（含"产出可能在别处"的软警告），继续步骤 4
   - **exit 1** → requirements.md 是空壳（无 SHALL/REQ），**不得**标 completed。补齐需求声明后再 ship，或用 `FORGE_SKIP_SPEC_COMPLETION_COVERAGE=1` 紧急跳过（需 PR 说明理由）
4. 通过门禁后，更新 `.forge/specs/<slug>/requirements.md` 的 status → `completed`
5. 如果 status ∈ {`completed`, `archived`, `draft`, `deferred`} → 保持不变
6. 运行 `node scripts/rebuild-spec-index.mjs --incremental` 同步 INDEX.md

> **双保险说明**：本步骤是 agent 软约束；即使漏跑，merge 进 main 后 CI 的 `mark-specs-completed.mjs` 会用同一门禁兜底校验（硬阻断）。门禁只防增量——历史已 completed 的 spec 不会被回溯校验。

输出格式：
```
📋 Spec Status:
  <spec-name>: locked → completed ✅
```

无匹配 spec 时输出 `(no spec reference)` 并跳过。

---

## 4. Cleanup

### 4.1 Worktree Cleanup

如果全量路径使用了 Git Worktree，在交付完成后清理：`git worktree prune`

### 4.2 Prompt `/forge learn`

交付完成后（丢弃除外），**必须立即自动调用下一阶段**，不输出确认提示（→ 详见 shared/next-step-protocol.md）：

- **全量路径**：输出 `✅ ship 完成 → 自动进入 learn`，然后**立即调用** `Skill(skill="forge", args="learn")`
- **标准路径**：输出 `✅ ship 完成 → 任务交付完毕`，标记任务完成

**禁止**：
- 输出"是否需要运行 /forge learn？"
- 输出"交付完成，建议运行 /forge learn 沉淀经验"
- 静默 idle（无输出、等待用户输入）— 与显式询问同罪

**Mode 判断**：如果 `mode` 为 `autonomous`，learn 由 Skill Scheduler 按 tier=full 自动调度。

> 全量路径下自动调用 learn；标准路径下标记完成，不调用 learn。

---

## 5. Autonomous Mode Configuration

Autonomous 模式通过 `.forge/config.md` 的 `ship_default_method` 字段控制交付行为（`merge` / `push-pr` / `keep-branch` / `prompt`）。无效值安全回退到 `keep-branch` 并输出警告。

→ 详见 references/delivery-options.md §Autonomous Mode Configuration

---

## 6. Execution Flow

1. Gate checks: call `runAllGates(input)` → Review → Test → Progress (in sequence)
2. Persist results: call `persistGateResults(report, ".forge/ship")`
3. Not passed (`allPassed=false`) → 🚫 Block, list failed items from `report.gates`
4. Passed → Show four delivery options
5. Execute chosen delivery method (Merge to main 时含 conflict-resolver 自动处理，详见 references/delivery-options.md §Option 1)
6. Cleanup Worktree + prompt `/forge learn`
7. Post-Push Verify (see §9)

## 9. Post_Push_Verify [R8.1-R8.6]

After push/PR: run `npm run check` (fallback: `ci_check_command` from config) with 600s timeout.

- **Passed**: single stdout line, no artifact [R8.5]
- **Failed**: write `.forge/ship/<topic>-post-push-verify.md` [R8.2]
- **Bitbucket MCP + PR created**: add comment via `postPRComment` [R8.3]
- Function body <= 50 lines [R8.6]

## Common Rationalizations

| 合理化 | 反驳 |
|--------|------|
| "测试都过了直接 merge 就行" | 测试通过 ≠ 需求满足。Review Gate 检查的是 Spec 对齐，Test Gate 检查的是代码正确性，两者缺一不可 |
| "这是内部工具不需要走完整流程" | 内部工具出问题影响整个团队的生产力。流程存在是因为它能捕获问题 |
| "回滚很容易所以不用太谨慎" | 回滚容易不代表应该依赖回滚。预防成本远低于修复成本 |

---

## 7. Edge Case Handling

| Condition | Handling |
|-----------|----------|
| Review 未执行 | 🚫 Ship 阻断：评审未执行。请先运行 /forge review |
| Review 不完整 | 🚫 Ship 阻断：评审报告存在 incomplete Layer。请重新运行 /forge review |
| Test 未执行 | 🚫 Ship 阻断：测试未执行。请先运行 /forge test |
| Progress 部分完成 | 🚫 Ship 阻断：列出未完成任务 |
| Git 操作失败 | ⚠️ Merge 冲突时自动调用 `resolveConflicts`（详见 references/delivery-options.md §Option 1）；非冲突类 Git 错误列出可能原因（网络/权限），建议检查或选其他方式 |
| gh CLI 未安装 | ⚠️ 提示安装方式，建议选其他选项 |
| 无 `.forge/` 目录 | ⚠️ 请先运行 /forge init |

---

## 8. Examples

### Example: Gates Passed, Create PR

```
$ /forge ship

🔍 Gate Checks...
✅ Review: passed (0 P0, 0 P1, 1 P2, 0 P3)
✅ Test: passed (42/42 tests passed, checklist 7/7)
✅ Progress: 5/5 tasks complete

→ AskUserQuestion: 门禁已通过，请选择交付方式
→ 用户选择: Create PR

📤 Pushing branch...
📝 Creating PR...

✅ Pushed and PR created
  PR: #42 — feat: 实现订单批量导出功能
  URL: https://github.com/org/repo/pull/42

🧹 Git Worktree cleaned up
💡 本次开发有值得沉淀的经验吗？（输入 /forge learn 或跳过）
```

**Other Scenario Variants**:
- **Gates not passed**: Report specific failed items (e.g. P0 issues), prompt to fix and re-run review + ship
- **Discard operation**: Requires typing "discard" to confirm, all changes deleted after execution

## Dispatch Status Check (R6)

Before running ship gates (§2), read `.forge/status.md` frontmatter to check dispatch status:

1. Parse `.forge/status.md` YAML frontmatter
2. Extract `dispatch_chosen_level` field
3. Decision tree:
   - `dispatch_chosen_level === 'L3'` → **ABORT** ship with error:
     ```
     🚫 Ship blocked: review/decide/learn unavailable (L3 fallback).
     See .forge/runs/<dispatch_run_id>/dispatch.jsonl for details.
     ```
   - `dispatch_chosen_level === 'L2'` → **WARN** but continue:
     ```
     ⚠️ Ship proceeding with subagent-serial fallback (degraded review).
     ```
   - `dispatch_chosen_level ∈ {'L0', 'L1'}` OR field missing → **CONTINUE** normally
4. If `.forge/status.md` does not exist, treat `dispatch_chosen_level` as missing (CONTINUE, do not throw)

**Single source of truth**: Only read `.forge/status.md` three fields (`dispatch_chosen_level`, `dispatch_subcommand`, `dispatch_run_id`). Do NOT parse `dispatch.jsonl` directly.

## Gotchas
- **Review bypass**: Ship without review → undetected issues → enforce review gate, no skip
- **Dist sync missing**: Code changed but dist/ not rebuilt → hooks use stale dist → verify dist/ in sync before ship
- **Branch protection**: Ship on main → direct commit to protected branch → verify on feature branch
- **Test gate skip**: Ship passes review but tests not run → runtime failures → verify test gate passed
- **Dispatch L3**: Ship blocked when review/decide/learn all unavailable → fix subagent infrastructure first

## Package Completion Gate

When execution packages exist, `/forge ship` MUST include a package completion table. Incomplete packages block or warn according to configured severity. A full-feature ship must not treat package-scoped review/test evidence as complete feature evidence.
