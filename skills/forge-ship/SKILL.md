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

## 1. 概述

`/forge ship` 是最后一道关卡——代码离开开发环境前，确认所有质量门禁已通过。检查三个前置条件，然后提供四种交付选项。

**核心原则**：交付是有意识的决定，不是流程的自动终点。丢弃操作需二次确认。

**伪成功禁令**：门禁失败时不可吞错继续；不可用模板化"通过"替代实际检查；测试未运行不可声称通过。

---

## 2. 门禁检查

**三道门禁必须同时通过**，每道以 P5 证据链呈现（`[Command] → [Output] → [Claim]`）：

| 门禁 | 数据来源 | 阻断条件 |
|------|---------|---------|
| **Review** | `.forge/reviews/<topic>.md` | `result` ≠ `"pass"` 或 p0/p1 > 0 |
| **Test** | Layer 1 + Layer 3 结果 | 测试未运行或有失败 |
| **Progress** | `.forge/progress/<topic>.md` | 存在未完成任务 |

**函数调用**：`checkShipGate(review, test, progress)` → `{ allowed: boolean, reasons: string[] }`。扩展版 `checkShipGateWithChecklist` 额外检查 P1 Fix Checklist 条目。

**门禁证据格式**：

```
🔍 门禁检查
[Check] Review — 读取 .forge/reviews/<topic>.md
[Evidence] result: "pass", p0_count: 0, p1_count: 0
[Claim] ✅ Review 通过（0 P0, 0 P1）
...（Test、Progress 同理）
```

**CI 命令一致性**：若 `ci_check_command` 已配置但 test 阶段未运行完整 CI，输出警告（不阻断但建议重跑）。

---

## 3. 四选项交付

门禁通过后展示：

```
请选择交付方式：
  1. 合并到主分支（本地 merge + 删除分支）
  2. 推送并创建 PR（git push -u + gh pr create）
  3. 保留分支（稍后处理）
  4. 丢弃（需输入 "discard" 确认）
```

**选项 1（merge）**：checkout main → merge → delete branch。Merge 失败自动 `merge --abort`。

**选项 2（push-pr）**：push origin → gh pr create。PR 描述从 plan Objective 提取。

**选项 3（keep-branch）**：保留当前分支。必须调用 `recordPendingDelivery(branchName, topic, timestamp)` 记录交付状态，供 `detectUnshippedBranches`/`detectStaleBranches` 后续检查。

**选项 4（discard）**：需输入 `discard` 二次确认。checkout main → delete branch。

---

## 4. 收尾

交付完成后（丢弃除外）：Worktree 清理（`git worktree prune`）+ 提示 `💡 本次开发有值得沉淀的经验吗？（/forge learn 或跳过）`。`mode: autonomous` 时跳过提示（learn 由 Skill Scheduler 调度）。

---

## 5. Autonomous 模式配置

`.forge/config.md` 的 `ship_default_method`：

| 值 | 行为 |
|----|------|
| `merge` | 自动合并 |
| `push-pr` | 自动推送+PR |
| `keep-branch` | 保留分支（**默认**） |
| `prompt` | 强制等用户选择 |

无效值回退 `keep-branch` + 警告。

---

## 6. 执行流程

1. 门禁检查（三道）：Review + Test + Progress
2. 未通过 → 🚫 阻断，列未通过项
3. 通过 → 展示四选项
4. 执行选定方式
5. 清理 + 提示 `/forge learn`

---

## 7. 边界情况处理

| 条件 | 处理 |
|------|------|
| Review 未执行 | 🚫 先运行 /forge review |
| Test 未执行 | 🚫 先运行 /forge test |
| Progress 部分完成 | 🚫 列出未完成任务 |
| Git 操作失败 | ⚠️ 建议检查网络/权限/冲突，或选其他方式 |
| gh CLI 未安装 | ⚠️ 建议安装，或选其他选项 |
| 无 `.forge/` 目录 | ⚠️ 请先运行 forge init |

---

## 8. 示例

### Canonical：门禁通过，创建 PR

```
$ /forge ship
🔍 门禁检查... ✅ Review | ✅ Test 42/42 | ✅ Progress 5/5
请选择交付方式：> 2
📤 推送 + 📝 创建 PR → ✅ PR #42: feat: 实现订单批量导出
🧹 Worktree 已清理 | 💡 /forge learn 或跳过
```

**变体**：门禁未通过 → 报告未通过项（如 P0 问题）→ 修复后重跑 review + ship。丢弃 → 需输入 `discard` 确认。
