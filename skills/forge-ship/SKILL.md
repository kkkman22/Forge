---
name: forge-ship
description: "交付引擎。门禁检查（Review + Test + Progress）后提供四选项交付。"
disable-model-invocation: true
---

# /forge ship — 交付引擎

> **触发方式**：标准路径的第五步，全量路径的第七步，或用户直接输入 `/forge ship`
> **职责**：有门禁检查的交付流程，确保只有通过评审和测试的代码才能交付
> **输出路径**：交付产物（merge/PR/branch）+ 提示 `/forge learn`

---

## 1. Overview

`/forge ship` 是 Forge 工作流的最后一道关卡——在代码离开开发环境之前，确认所有质量门禁都已通过。它检查三个前置条件（评审通过、测试通过、任务完成），然后提供四种交付选项供开发者选择。

**核心原则**：交付是一个有意识的决定，不是流程的自动终点。每一次 ship 都需要开发者明确选择交付方式，丢弃操作需要二次确认。

**伪成功禁令**：Ship 阶段绝不允许：门禁失败时吞掉错误继续交付、用模板化"通过"替代实际检查、测试未运行时声称"测试通过"、Review 报告不存在时声称"评审通过"。

---

**Not For**：
- review 或 test 未执行
- 存在未解决的 P0/P1 问题

## 2. Gate Checks

`/forge ship` 启动前**必须通过三道门禁**，每道门禁的结果必须以 P5 证据链格式呈现（`[Command] → [Output] → [Claim]`）：

| Gate | Check | Data Source | Block Condition |
|------|-------|-------------|-----------------|
| **Review Gate** | 评审是否通过（无 P0/P1 且无 incomplete Layer） | `.forge/reviews/<topic>.md` | `result` 不是 `"pass"` 或 `p0_count > 0` 或 `p1_count > 0` 或任一 Layer 为 `incomplete` |
| **Test Gate** | 测试是否通过 | Layer 1 + Layer 3 验证结果；若 `ci_check_command` 已配置，验证 CI 命令已执行并通过 | 测试未运行或有失败项 |
| **Progress Gate** | 所有任务是否完成 | `.forge/progress/<topic>.md` | 存在未标记完成的任务 |

**函数调用**：`checkShipGate(review, test, progress)`
- 参数：`review` — 从 `.forge/reviews/<topic>.md` frontmatter 解析的 `ReviewResult`（含 `result`、`p0_count`、`p1_count`）；`test` — 从 Layer 1 + Layer 3 验证结果构造的 `TestResult`（含 `passed`、`failedCount`）；`progress` — 从 `.forge/progress/<topic>.md` 解析的 `ProgressResult`（含 `totalTasks`、`completedTasks`）
- 返回：`{ allowed: boolean, reasons: string[] }`，`allowed: false` 时 `reasons` 列出所有未通过的门禁
- 用途：程序化执行三道门禁检查，替代手动逐条验证

**函数调用**：`checkShipGateWithChecklist(review, test, progress, checklist)`
- 参数：同 `checkShipGate` 的三个参数 + `checklist` — P1 Fix Checklist 条目（`ChecklistEntry[]`，含修复项和验证状态）
- 返回：`{ allowed: boolean, reasons: string[] }`，额外检查 P1 修复条目是否全部验证通过
- 用途：当存在 P1 Fix Checklist 时使用此扩展门禁，确保所有 P1 修复已验证

**三道门禁必须同时通过**。任一不通过，阻断 ship。

**门禁证据格式**：

```
🔍 Gate Checks (P5 Evidence Chain)

[Check]  Review Gate — read .forge/reviews/order-batch-export.md
[Evidence] result: "pass", p0_count: 0, p1_count: 0
[Claim]  ✅ Review passed (0 P0, 0 P1, 1 P2, 0 P3)

[Check]  Test Gate — run npx vitest run
[Evidence] Test Files: 8 passed, Tests: 42 passed
[Claim]  ✅ Test passed (42/42 tests passed)

[Check]  Progress Gate — read .forge/progress/order-batch-export.md
[Evidence] 5/5 tasks marked [x]
[Claim]  ✅ Progress complete (5/5 tasks complete)
```

**CI 命令一致性检查**：如果 `ci_check_command` 已配置但 test 阶段只运行了单独命令（未运行完整 CI 命令），输出警告。不阻断 ship 但强烈建议重新运行。

**全部通过**后进入交付选项选择。

---

## 3. Four Delivery Options

门禁检查全部通过后，提供四种交付选项：

```
请选择交付方式：

  1. Merge to main branch (local merge + delete branch)
  2. Push and create PR (git push -u + gh pr create)
  3. Keep branch (process later)
  4. Discard (requires typing "discard" to confirm)

请输入选项编号（1-4）：
```

### Option 1: Merge to Main Branch

通过 `ship_merge` 效果执行：checkout main → merge branch → delete branch。Merge 失败时自动执行 `merge --abort` 恢复。适用场景：个人项目、小团队直接合并。

### Option 2: Push and Create PR

通过 `ship_push_pr` 效果执行：push origin → gh pr create。Push 失败时不创建 PR。适用场景：团队协作。PR 描述自动从 plan Objective 提取。

### Option 3: Keep Branch

不做任何 Git 操作，保留当前分支状态。适用场景：稍后处理、等待依赖。可随时重新运行 `/forge ship` 选择其他方式。

**Pending-Delivery 记录**：选择保留分支时，必须调用 `recordPendingDelivery(branchName, topic, timestamp)` 记录交付状态：

- `branchName` 来源：`git branch --show-current` 输出
- `topic` 来源：`.forge/status.md` 的 `current_task` 字段
- `timestamp` 来源：`Date.now()`

返回的 `PendingDeliveryRecord` 追加到 `.forge/status.md` 或配置指定的持久化位置。下次 `/forge build` 启动时，`detectUnshippedBranches` 和 `detectStaleBranches` 将读取这些记录并展示警告。

### Option 4: Discard

丢弃当前分支的所有变更。**需要二次确认**：用户输入 `discard` 才执行，输入其他内容则取消。通过 `ship_discard` 效果执行：checkout main → delete branch。

---

## 4. Cleanup

### 4.1 Worktree Cleanup

如果全量路径使用了 Git Worktree，在交付完成后清理：`git worktree prune`

### 4.2 Prompt `/forge learn`

交付完成后（丢弃除外），提示执行知识沉淀：`💡 本次开发有值得沉淀的经验吗？（输入 /forge learn 或跳过）`

**Mode 判断**：如果 `mode` 为 `autonomous`，跳过此提示（autonomous 模式下 learn 由 Skill Scheduler 按 tier=full 自动调度）。

> 此提示不阻塞工作流完成——用户说"不用"或不响应时立即跳过。

---

## 5. Autonomous Mode Configuration

在 `.forge/config.md` frontmatter 中可配置 `ship_default_method` 控制自主模式的交付行为：

| Value | Behavior |
|-------|----------|
| `merge` | 自动合并到主分支 |
| `push-pr` | 自动推送并创建 PR |
| `keep-branch` | 保留分支（默认值） |
| `prompt` | 覆盖 autonomous 行为，强制等待用户选择 |

无效值安全回退到 `keep-branch` 并输出警告。

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

请选择交付方式：
> 2

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
