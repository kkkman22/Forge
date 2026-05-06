---
name: forge-ship
description: "Delivery engine enforcing the commit gate and freshness check before publishing changes. Use when user runs `/forge ship` / all review and test gates passed / ready to push branch or create pull request."
disable-model-invocation: true
---

# /forge ship — 交付引擎

> **触发方式**：标准路径第五步 / 全量路径第七步 / 用户输入 `/forge ship`
> **职责**：有门禁检查的交付流程，确保只有通过评审和测试的代码才能交付
> **输出路径**：交付产物（merge/PR/branch）+ 提示 `/forge learn`

---

## 1. Overview

`/forge ship` 是 Forge 工作流的最后一道关卡——在代码离开开发环境之前，确认所有质量门禁都已通过。它检查三个前置条件（评审通过、测试通过、任务完成），然后提供四种交付选项供开发者选择。

**核心原则**：交付是一个有意识的决定，不是流程的自动终点。每一次 ship 都需要开发者明确选择交付方式，丢弃操作需要二次确认。

**伪成功禁令**：Ship 阶段绝不允许：门禁失败时吞掉错误继续交付、用模板化"通过"替代实际检查、测试未运行时声称"测试通过"、Review 报告不存在时声称"评审通过"。

**Not For**：review 或 test 未执行 / 存在未解决的 P0/P1 问题

## 2. Gate Checks

`/forge ship` 启动前**必须通过三道门禁**（Review / Test / Progress），每道门禁的结果必须以 P5 证据链格式呈现（`[Command] → [Output] → [Claim]`）。

→ 详见 references/gate-checks.md（门禁表、证据格式、Review Freshness Check 完整流程）

**函数调用**：`checkShipGate(review, test, progress)`
- 参数：`review` — 从 `.forge/reviews/<topic>.md` frontmatter 解析的 `ReviewResult`（含 `result`、`p0_count`、`p1_count`）；`test` — 从 Layer 1 + Layer 3 验证结果构造的 `TestResult`（含 `passed`、`failedCount`）；`progress` — 从 `.forge/progress/<topic>.md` 解析的 `ProgressResult`（含 `totalTasks`、`completedTasks`）
- 返回：`{ allowed: boolean, reasons: string[] }`，`allowed: false` 时 `reasons` 列出所有未通过的门禁
- 用途：程序化执行三道门禁检查，替代手动逐条验证

**函数调用**：`checkShipGateWithChecklist(review, test, progress, checklist)`
- 参数：同 `checkShipGate` 的三个参数 + `checklist` — P1 Fix Checklist 条目（`ChecklistEntry[]`，含修复项和验证状态）
- 返回：`{ allowed: boolean, reasons: string[] }`，额外检查 P1 修复条目是否全部验证通过
- 用途：当存在 P1 Fix Checklist 时使用此扩展门禁，确保所有 P1 修复已验证

**三道门禁必须同时通过**。任一不通过，阻断 ship。

**Gate 拦截自动沉淀**：门禁拦截时调用 `buildShipGateBlockArtifacts(topic, tier, reason, situation, now, seq)`（`src/ship.ts`）生成 episode + Evolution 标记（target=`forge-ship#ship_gate_blocked`）。`reason` 推导：未提交工作树 → `uncommitted` → outcome=`partial`；checklist 未验证 → `checklist_failed` → outcome=`failure`。写入失败降级为 `console.warn`。

**函数调用**：`checkReviewFreshness(reviewedCommit, currentHead, changedFiles)`
- 参数：`reviewedCommit` — 从 review 报告 frontmatter 的 `reviewed_at_commit` 字段读取（`string | undefined`）；`currentHead` — `git rev-parse HEAD` 输出；`changedFiles` — `git diff --name-only` 输出
- 返回：`{ fresh: boolean, reason: string, changedFiles?: string[] }`
- 用途：检测 review 后是否有项目代码变更，输出警告但不阻断 ship

**全部通过**后进入交付选项选择。

---

## 3. Four Delivery Options

门禁检查全部通过后，使用 AskUserQuestion 询问用户选择：**Merge to main** / **Create PR** / **Keep branch** / **Discard**（需二次确认）。

→ 详见 references/delivery-options.md（AskUserQuestion 格式、四选项执行细节、Pending-Delivery 记录、Autonomous Mode 配置）

---

## 4. Cleanup

### 4.1 Worktree Cleanup

如果全量路径使用了 Git Worktree，在交付完成后清理：`git worktree prune`

### 4.2 Prompt `/forge learn`

交付完成后（丢弃除外），自动调用 /forge learn 执行知识沉淀（→ 详见 shared/next-step-protocol.md）

**Mode 判断**：如果 `mode` 为 `autonomous`，learn 由 Skill Scheduler 按 tier=full 自动调度。

> 全量路径下自动调用 learn；标准路径下标记完成，不调用 learn。

---

## 5. Autonomous Mode Configuration

Autonomous 模式通过 `.forge/config.md` 的 `ship_default_method` 字段控制交付行为（`merge` / `push-pr` / `keep-branch` / `prompt`）。无效值安全回退到 `keep-branch` 并输出警告。

→ 详见 references/delivery-options.md §Autonomous Mode Configuration

---

## 6. Execution Flow

1. Gate checks (three gates): Review passed? Test passed? Progress complete?
2. Not passed → 🚫 Block, list failed items
3. Passed → Show four delivery options
4. Execute chosen delivery method
5. Cleanup Worktree + prompt `/forge learn`

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
| Git 操作失败 | ⚠️ 列出可能原因（网络/权限/冲突），建议检查或选其他方式 |
| gh CLI 未安装 | ⚠️ 提示安装方式，建议选其他选项 |
| 无 `.forge/` 目录 | ⚠️ 请先运行 forge init |

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
