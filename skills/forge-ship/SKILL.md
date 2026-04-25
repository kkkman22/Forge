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

`/forge ship` 是 Forge 工作流的最后一道关卡——在代码离开开发环境之前，确认所有质量门禁都已通过。它检查三个前置条件（评审通过、测试通过、任务完成），然后提供四种交付选项供开发者选择。

**核心原则**：交付是一个有意识的决定，不是流程的自动终点。每一次 ship 都需要开发者明确选择交付方式，丢弃操作需要二次确认。

**伪成功禁令**：Ship 阶段绝不允许以下行为：
- 门禁检查失败时吞掉错误继续交付
- 用模板化的"通过"结果替代实际检查
- 在测试未运行时声称"测试通过"
- 在 Review 报告不存在时声称"评审通过"

---

## 2. 门禁检查

`/forge ship` 启动前**必须通过三道门禁**，每道门禁的结果必须以 P5 证据链格式呈现（`[Command] → [Output] → [Claim]`）：

| 门禁 | 检查内容 | 数据来源 | 阻断条件 |
|------|---------|---------|---------|
| **Review 门禁** | 评审是否通过（无 P0/P1） | `.forge/reviews/<topic>.md` | `result` 不是 `"pass"` 或 `p0_count > 0` 或 `p1_count > 0` |
| **Test 门禁** | 测试是否通过 | Layer 1 + Layer 3 验证结果 | 测试未运行或有失败项 |
| **Progress 门禁** | 所有任务是否完成 | `.forge/progress/<topic>.md` | 存在未标记完成的任务 |

**三道门禁必须同时通过**。任一不通过，阻断 ship 并输出具体原因。

**门禁证据格式**：

每道门禁的检查结果必须附带实际证据，不接受"看起来通过了"的声明：

```
🔍 门禁检查（P5 证据链）

[Check]  Review 门禁 — 读取 .forge/reviews/order-batch-export.md
[Evidence] result: "pass", p0_count: 0, p1_count: 0, p2_count: 1
[Claim]  ✅ Review 通过（0 P0, 0 P1, 1 P2, 0 P3）

[Check]  Test 门禁 — 运行 npx vitest run
[Evidence] Test Files: 8 passed, Tests: 42 passed
[Claim]  ✅ Test 通过（42/42 测试通过）

[Check]  Progress 门禁 — 读取 .forge/progress/order-batch-export.md
[Evidence] 5/5 tasks marked [x]
[Claim]  ✅ Progress 完成（5/5 任务完成）
```

```
🚫 Ship 阻断

❌ Review 未通过：发现 1 个 P0 和 2 个 P1 问题，需要修复后重新评审
❌ Test 未通过：类型检查有 3 个错误
✅ Progress 已完成：5/5 任务完成

请按提示修复问题后重新运行 /forge ship。
```

**全部通过**：

```
✅ 门禁检查通过

✅ Review：通过（0 P0, 0 P1, 1 P2, 0 P3）
✅ Test：通过（42/42 测试通过，清单 7/7）
✅ Progress：5/5 任务完成

请选择交付方式：
```

---

## 3. 四选项交付

门禁检查全部通过后，提供四种交付选项：

### 选项 1：合并到主分支

**操作**：本地 merge 当前分支到主分支，然后删除开发分支。

```bash
git checkout main
git merge <feature-branch> --no-ff
git branch -d <feature-branch>
```

**适用场景**：个人项目、小团队直接合并。

**输出**：

```
✅ 已合并到 main 分支
  合并提交：abc1234
  已删除分支：feature/order-batch-export
```

### 选项 2：推送并创建 PR

**操作**：推送当前分支到远程仓库，然后创建 Pull Request。

```bash
git push -u origin <feature-branch>
gh pr create --title "<PR 标题>" --body "<PR 描述>"
```

**适用场景**：团队协作、需要 Code Review 的项目。

**PR 描述自动生成**：

- 标题：从 plan 的 Objective 提取
- 描述：包含变更摘要、测试结果、评审结果

**输出**：

```
✅ 已推送并创建 PR
  分支：feature/order-batch-export
  PR：#42 — 实现订单批量导出功能
  URL：https://github.com/org/repo/pull/42
```

### 选项 3：保留分支

**操作**：不做任何 Git 操作，保留当前分支状态。

**适用场景**：稍后处理、等待其他依赖、需要进一步讨论。

**输出**：

```
✅ 分支已保留：feature/order-batch-export
  当前状态：所有门禁通过，随时可以交付
  稍后可重新运行 /forge ship 选择其他交付方式
```

### 选项 4：丢弃

**操作**：丢弃当前分支的所有变更。**需要二次确认**。

**二次确认流程**：

```
⚠️ 丢弃操作将删除当前分支的所有变更，此操作不可逆。

请输入 "discard" 确认丢弃：
```

- 用户输入 `discard` → 执行丢弃
- 用户输入其他内容 → 取消丢弃

**执行丢弃**：

```bash
git checkout main
git branch -D <feature-branch>
```

**输出**：

```
✅ 已丢弃分支：feature/order-batch-export
  所有变更已删除
```

**取消丢弃**：

```
ℹ️ 丢弃已取消。分支保留：feature/order-batch-export
```

---

## 4. 交付选项展示

门禁通过后，向用户展示四个选项：

```
请选择交付方式：

  1. 合并到主分支（本地 merge + 删除分支）
  2. 推送并创建 PR（git push -u + gh pr create）
  3. 保留分支（稍后处理）
  4. 丢弃（需输入 "discard" 确认）

请输入选项编号（1-4）：
```

---

## 5. 收尾

### 5.1 Worktree 清理

如果全量路径使用了 Git Worktree，在交付完成后清理：

```bash
git worktree prune
```

**输出**：

```
🧹 已清理 Git Worktree
```

### 5.2 提示 `/forge learn`

交付完成后（无论选择哪个选项，丢弃除外），提示执行知识沉淀：

```
💡 交付完成。建议运行 /forge learn 沉淀本次开发经验。
```

---

## 6. 执行流程

### 完整流程图

```
用户输入 /forge ship
        │
        ▼
  ┌─────────────────────┐
  │  门禁检查（三道）   │
  │                     │
  │  Review 通过？      │
  │  Test 通过？        │
  │  Progress 完成？    │
  └──────────┬──────────┘
        通过 │     │ 未通过
             │     ▼
             │   🚫 阻断，列出未通过项
             ▼
  ┌─────────────────────┐
  │  展示四个交付选项   │
  └──────────┬──────────┘
             │
    ┌────────┼────────┬────────┐
    │        │        │        │
    ▼        ▼        ▼        ▼
  合并     推送+PR   保留     丢弃
  到 main            分支     ↓
    │        │        │     二次确认？
    │        │        │     ┌──┴──┐
    │        │        │   是│     │否
    │        │        │     ▼    ▼
    │        │        │   删除  取消
    │        │        │   分支
    ▼        ▼        ▼     ▼
  ┌─────────────────────┐
  │  清理 Worktree      │
  │  提示 /forge learn  │
  └─────────────────────┘
```

---

## 7. 边界情况处理

### 7.1 Review 未执行

如果 `.forge/reviews/<topic>.md` 不存在，说明 review 未执行：

```
🚫 Ship 阻断：评审未执行

未找到评审报告。请先运行 /forge review 完成评审。
```

### 7.2 Test 未执行

如果测试未在本次会话中运行过：

```
🚫 Ship 阻断：测试未执行

测试未在本次会话中运行。请先运行 /forge test 完成验证。
```

### 7.3 Progress 部分完成

如果有未完成的任务：

```
🚫 Ship 阻断：任务未全部完成

以下任务尚未完成：
  - [ ] Task 4：添加导出 API 路由
  - [ ] Task 5：实现下载链接过期逻辑

请完成所有任务后重新运行 /forge ship。
```

### 7.4 Git 操作失败

如果 Git 操作（push、merge、PR 创建）失败：

```
⚠️ Git 操作失败：<错误信息>

可能原因：
1. 远程仓库不可达（网络问题）
2. 权限不足
3. 分支冲突

请检查 Git 配置后重试，或选择其他交付方式。
```

### 7.5 gh CLI 未安装

如果选择"推送并创建 PR"但 `gh` CLI 未安装：

```
⚠️ 未检测到 gh CLI。创建 PR 需要 GitHub CLI。

安装方式：
  macOS: brew install gh
  Linux: sudo apt install gh
  Windows: winget install GitHub.cli

或者选择选项 1（本地合并）或选项 3（保留分支后手动创建 PR）。
```

### 7.6 无 `.forge/` 目录

提示先运行初始化：

```
⚠️ 未检测到 .forge/ 目录。请先运行 forge init 初始化项目。
```

---

## 8. 示例

### 示例 1：门禁通过，选择创建 PR

```
$ /forge ship

🔍 门禁检查...
✅ Review：通过（0 P0, 0 P1, 1 P2, 0 P3）
✅ Test：通过（42/42 测试通过，清单 7/7）
✅ Progress：5/5 任务完成

请选择交付方式：
  1. 合并到主分支
  2. 推送并创建 PR
  3. 保留分支
  4. 丢弃

> 2

📤 推送分支...
  git push -u origin feature/order-batch-export

📝 创建 PR...
  gh pr create --title "feat: 实现订单批量导出功能" --body "..."

✅ 已推送并创建 PR
  PR：#42 — feat: 实现订单批量导出功能
  URL：https://github.com/org/repo/pull/42

🧹 已清理 Git Worktree
💡 交付完成。建议运行 /forge learn 沉淀本次开发经验。
```

### 示例 2：门禁未通过

```
$ /forge ship

🔍 门禁检查...
❌ Review：未通过（1 P0, 0 P1）
✅ Test：通过
✅ Progress：5/5 任务完成

🚫 Ship 阻断

Review 中存在 P0 问题：
  1. [security-check] src/config/db.ts：硬编码数据库密码

请修复后运行 /forge review 重新评审，然后重新运行 /forge ship。
```

### 示例 3：丢弃操作

```
$ /forge ship

🔍 门禁检查...
✅ 全部通过

请选择交付方式：
> 4

⚠️ 丢弃操作将删除当前分支的所有变更，此操作不可逆。
请输入 "discard" 确认丢弃：

> discard

✅ 已丢弃分支：feature/order-batch-export
  所有变更已删除
```
