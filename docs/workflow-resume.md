---
title: '工作流示例：会话恢复与团队协作'
category: reference
audience:
- maintainer
updated: '2026-05-12'
owner: forge-maintainers
---

[← 返回索引](./INDEX.md)

# 工作流示例：会话恢复与团队协作

**项目类型**：全栈 Web 应用
**任务描述**：从中断的会话恢复，继续完成未实现的功能
**涉及文件**：`src/cart/checkout.ts`（之前已实现 60%）

---

## 背景

开发者 Alice 昨天使用 Forge 开发购物车结算功能，完成了 plan 和部分 build，但因下班中断。今天需要恢复会话继续完成剩余任务。

---

## 场景 1：本地会话恢复

### 用户输入

```bash
/forge resume
```

### Forge 行为

**resume 阶段输出摘要**：

```
🔄 会话恢复

检测到上次会话：2026-05-11 18:30
任务：cart-checkout
阶段：build（Task 3/5 完成）

快速回顾：
  ✅ Task 1: 创建 checkout.ts 骨架
  ✅ Task 2: 实现商品列表渲染
  ✅ Task 3: 实现价格计算逻辑
  ⏳ Task 4: 实现支付接口调用（未完成）
  ⏳ Task 5: 创建 checkout.test.ts（未完成）

恢复选项：
  1. 继续 build（从 Task 4 开始）
  2. 重新审查 plan
  3. 查看上次进度详情
```

**目的**：通过五问题恢复机制，快速重建上次会话上下文。

**用户选择**：选项 1（继续 build）

**后续流程**：

```bash
# Forge 自动从 Task 4 继续
/forge build

→ Task 4/5: 实现支付接口调用 ✅
→ Task 5/5: 创建 checkout.test.ts ✅
→ build completed → 自动进入 review → test → ship
```

---

## 场景 2：跨会话恢复（--from-pr）

### 背景

开发者 Bob 需要接手 Alice 的 PR #456，该 PR 实现了购物车结算的 60%。Bob 需要在自己的环境中恢复 Alice 的工作上下文。

### 用户输入

```bash
/forge resume --from-pr 456
```

### Forge 行为

**resume --from-pr 阶段输出摘要**：

```
🔄 跨会话恢复（PR #456）

获取 PR 信息：
  作者：Alice
  分支：feature/cart-checkout
  最后提交：a1b2c3d — "feat(cart): add price calculation"
  变更文件：src/cart/checkout.ts, src/cart/types.ts

重建上下文：
  → 检出分支 feature/cart-checkout
  → 读取 .forge/plans/cart-checkout.md
  → 读取 .forge/progress/cart-checkout.md

任务状态：
  ✅ Task 1-3: 已完成（商品列表、价格计算）
  ⏳ Task 4: 支付接口调用（部分代码在 PR 中）
  ⏳ Task 5: 测试（未开始）

恢复选项：
  1. 继续 build（从 Task 4 开始）
  2. 重新审查 plan
  3. 查看 PR diff 详情
```

**目的**：让团队成员无缝接手未完成的 PR，无需手动重建上下文。

**用户选择**：选项 1（继续 build）

**后续流程**：

```bash
# Forge 自动继续 Task 4
/forge build

→ Task 4/5: 完成支付接口调用 ✅
→ Task 5/5: 创建 checkout.test.ts ✅
→ build completed → review → test → ship
```

---

## 自动推进 vs 用户介入

| 阶段 | 行为 |
|------|------|
| resume | **停止，显示恢复选项**（需要用户选择） |
| build（恢复后） | **自动推进** review → test → ship |

**关键区别**：resume 阶段本身**必须等待用户选择**，因为 Forge 不知道用户是想继续、重新审查 plan，还是只是查看状态。

---

## 最终状态

- 本地恢复：从 Task 4 继续，最终完成所有 5 个任务
- 跨会话恢复：Bob 成功接手 Alice 的 PR，完成剩余功能
- 两种情况都产生完整的 build → review → test → ship 流程
