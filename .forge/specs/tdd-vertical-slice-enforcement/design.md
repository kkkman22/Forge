---
feature: tdd-vertical-slice-enforcement
layout: design
created: 2026-06-03
---

# Design Document: TDD Vertical Slice 强制执行 + 好/坏测试参考

## Overview

本功能通过在 3 个文档文件中追加 TDD Vertical Slice 约束和好/坏测试参考，补齐 Forge TDD 铁律中最常见的反模式防护。这是一个纯文档修改功能，不涉及任何代码逻辑变更。

**灵感来源**：Matt Pocock `skills` 仓库的 `/tdd` skill + `tests.md` 参考文件。

**修改范围**：
1. `CLAUDE.md` — 追加 §2.1.1 Vertical Slice Only 铁律声明
2. `skills/forge/lib/build/references/tdd-rules.md` — 追加 §5 Horizontal Slicing 反模式 + §6 好/坏测试对比
3. `skills/forge/lib/plan/references/atomic-task-format.md` — 追加 Vertical Slice Constraint 声明

**设计原则**：
- Forge 的 `atomic-task-format.md` 已经让每个 Task 有独立的 RED/GREEN/REFACTOR 步骤——这本身就是 vertical slice 的形态。本功能只是**显式声明这个约束**并补充反模式警告
- 不改变 build agent 的 TDD 循环执行逻辑
- 不改变 RED Verification Gate 的三字段证据要求

## Architecture

本功能无架构变更。所有修改都是对现有 markdown 文档的内容追加，不改变文件结构、不新增文件、不修改任何代码。

### 现有实现分析

| 文件 | 当前状态 | Gap |
|------|---------|-----|
| `CLAUDE.md` §2.1 | 只说 "RED → GREEN → REFACTOR"，铁律是"代码先于测试→删除重来" | 未禁止先写所有测试再写所有实现（Horizontal Slicing） |
| `tdd-rules.md` | 有 RED Verification Gate、Rationalization Catalog（5 类借口）、Simplicity Check | 无 Horizontal Slicing 反模式警告、无好/坏测试对比参考 |
| `atomic-task-format.md` | 每个 Task 有独立的 RED/GREEN/REFACTOR 步骤和 Expected 字段 | 未显式声明"一个 Task = 一个 Tracer Bullet" |
| `.forge/glossary.md` | 已定义 `Vertical Slice`（"垂直切片：可独立交付的最小功能单元"） | 定义存在但未在 TDD 上下文中引用 |

### 修改拓扑

```
CLAUDE.md
  └── §2.1 TDD Enforcement（现有）
        └── §2.1.1 Vertical Slice Only（新增）

skills/forge/lib/build/references/tdd-rules.md
  ├── §4 Simplicity Check（现有）
  ├── §5 Anti-Pattern: Horizontal Slicing（新增）
  └── §6 Good vs Bad Tests（新增）

skills/forge/lib/plan/references/atomic-task-format.md
  └── TDD Step Format 开头追加 Vertical Slice Constraint（新增）
```

## Components and Interfaces

### Component 1: CLAUDE.md §2.1.1 Vertical Slice Only

在现有 §2.1 TDD Enforcement 的 `<important>` 块之后追加铁律声明。

**内容**：

```markdown
### 2.1.1 Vertical Slice Only（铁律）

每个 TDD 周期（RED → GREEN → REFACTOR）必须是一个 **Vertical Slice**：
一条测试 → 一段实现 → 重复。禁止 Horizontal Slicing。

WRONG (horizontal):
  RED: test1, test2, test3, test4, test5
  GREEN: impl1, impl2, impl3, impl4, impl5

RIGHT (vertical):
  RED→GREEN: test1→impl1
  RED→GREEN: test2→impl2
  RED→GREEN: test3→impl3

为什么：批量测试验证想象中的行为，产生与实现耦合的测试。
垂直切片让每个测试响应上一轮的实际实现，测试描述的是
"代码做了什么" 而非 "我想让它做什么"。
```

**插入位置**：`CLAUDE.md` §2.1 的 `<IRON-LAW name="tdd-delete-and-restart">` 段落之后。

### Component 2: tdd-rules.md §5 Anti-Pattern: Horizontal Slicing

在现有 Rationalization Catalog 之后追加。

**内容**：

```markdown
## 5. Anti-Pattern: Horizontal Slicing

**定义**：先写多个/全部测试（全 RED），再写多个/全部实现（全 GREEN）。

**为什么是垃圾**：
1. 测试写在没有实现的时候，测的是**你猜的行为**不是**实际的行为**
2. 你会测数据结构和函数签名的"形状"，而不是用户可观察的行为
3. 测试与实现耦合——重构时测试会挂，但行为没变
4. 你在理解实现之前就锁定了测试结构——outrun your headlights

**正确做法**：Vertical Slice（Tracer Bullet）。一个测试 → 一个实现 → 重复。
每个测试响应上一轮你从实现中学到的东西。

**检测信号**（build agent 自检）：
- RED 阶段写了 2+ 个测试文件而 GREEN 阶段还没开始 → 🚫 Horizontal
- 测试名称描述的是实现（"calls paymentService.process"）而非行为
  （"user can checkout"）→ 🚫 Implementation-coupled
- GREEN 阶段写的代码没有被任何 RED 测试覆盖 → 🚫 Test-after
```

### Component 3: tdd-rules.md §6 Good vs Bad Tests

在 §5 之后追加。

**内容**：

```markdown
## 6. Good vs Bad Tests

### Good Tests — 集成风格

- 通过 **public interface** 测试 **observable behavior**
- 描述 WHAT 系统做什么，不描述 HOW
- 重构内部结构时测试不需要改
- 一个测试 = 一个逻辑断言
- 测试名读起来像规格："user can checkout with valid cart"

```typescript
// GOOD: 测试可观察的行为
test("user can checkout with valid cart", async () => {
  const cart = createCart();
  cart.add(product);
  const result = await checkout(cart, paymentMethod);
  expect(result.status).toBe("confirmed");
});
```

### Bad Tests — 实现细节耦合

- Mock 内部协作方
- 测试私有方法
- 断言调用次数/顺序
- 重构时测试挂但行为没变
- 测试名描述 HOW 不是 WHAT
- 绕过 interface 直接验证（如查 DB 而非用 getUser）

```typescript
// BAD: 测试实现细节
test("checkout calls paymentService.process", async () => {
  const mockPayment = jest.mock(paymentService);
  await checkout(cart, payment);
  expect(mockPayment.process).toHaveBeenCalledWith(cart.total);
});

// BAD: 绕过 interface 验证
test("createUser saves to database", async () => {
  await createUser({ name: "Alice" });
  const row = await db.query("SELECT * FROM users WHERE name = ?", ["Alice"]);
  expect(row).toBeDefined();
});

// GOOD: 通过 interface 验证
test("createUser makes user retrievable", async () => {
  const user = await createUser({ name: "Alice" });
  const retrieved = await getUser(user.id);
  expect(retrieved.name).toBe("Alice");
});
```

### 判断规则

| 信号 | 判定 |
|------|------|
| 重构后测试挂了但行为没变 | 🚫 测试耦合了实现 |
| 测试名有 "calls"、"invokes"、"mocks" | 🚫 测的是调用而非结果 |
| 测试直接查 DB/文件系统而非用 public API | 🚫 绕过 interface |
| 改了一个内部函数名测试就挂 | 🚫 测了私有实现 |
```

### Component 4: atomic-task-format.md Vertical Slice Constraint

在 TDD Step Format 章节开头追加约束声明。

**内容**：

```markdown
**Vertical Slice Constraint**: 每个 Task 就是一个 Tracer Bullet——
它包含一条测试（RED）和让那条测试通过的最小实现（GREEN）。
一个 Task 禁止包含多条独立的测试-实现对。
如果需要多对，拆成多个 Task，每个一对。
```

**插入位置**：`## TDD Step Format` 标题之后、"Each task's TDD steps must include three phases:" 之前。

## Edge Cases

| 情况 | 处理 |
|------|------|
| 旧格式 plan（无 Vertical Slice 声明） | 向后兼容，自检输出 warning 而非 error |
| build agent 在一个 Task 内写多条测试 | 由 §2.1.1 铁律约束，违反时应自我纠正 |
| 测试框架不支持集成测试风格 | 好/坏测试参考作为指导而非强制 |

## Out of Scope

- 不改变 build agent 的 TDD 循环执行逻辑
- 不改变 RED Verification Gate 的三字段证据要求
- 不新增 lint/检测脚本（靠 prompt 约束）
- 不改变 `forge-build.md` agent 定义
