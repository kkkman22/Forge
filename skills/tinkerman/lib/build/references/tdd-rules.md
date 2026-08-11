---
updated: 2026-08-11
---
# TDD Iron Rules (Detailed)

## 4. TDD Iron Rules

→ Follow CLAUDE.md §2.1 TDD Enforcement (RED → GREEN → REFACTOR cannot be skipped)

**Build Phase Additions**:

- **In-Subagent TDD**: Each Subagent independently executes the full TDD cycle. Code written before tests → delete code, restart from tests. Do not retain, reference, or read deleted code.
- **Run at every step**: RED confirms failure, GREEN confirms pass, REFACTOR confirms no regression. Test passing at RED stage = test was written wrong.
- **Tests accommodating code ≠ code satisfying requirements**. Writing code first then adding tests is the former.
- **Dead Code Hygiene**: REFACTOR 完成后，扫描是否产生了孤儿代码（未使用的 import、未调用的函数或方法、未引用的类型定义、未使用的变量）。发现孤儿代码时记录到 `.forge/findings/<topic>.md`，不自行删除——删除需要确认代码确实不再被需要。

## Simplicity Check

GREEN 阶段的代码必须是"能让测试通过的最简单实现"。如果你在 GREEN 阶段引入了抽象层、工厂模式或配置驱动的设计——停下来，删掉，写更简单的版本。

REFACTOR 阶段才是引入抽象的时机，且仅当同一模式重复出现 3 次以上时。

**简洁性检查**：
- ✗ 为一个通知场景构建通用 EventBus + 中间件管线 → ✓ 直接函数调用
- ✗ 为两个相似组件构建抽象工厂 → ✓ 两个直接的组件 + 共享工具函数
- ✗ 为三个表单构建配置驱动的表单生成器 → ✓ 三个表单组件

三行相似的代码好过一个过早的抽象。先实现朴素的、显然正确的版本。

## RED Verification Gate

After writing a failing test in the RED phase, the subagent MUST emit three evidence fields before proceeding to GREEN:

1. **`command`**: The exact command run (e.g., `npx vitest run test/pack/loader.test.ts`)
2. **`actual_output`**: First 10 lines of the real failure output
3. **`expected_failure_reason`**: Why the test should fail (e.g., "function not defined", "assertion failed")

### Rules

- If `actual_output` shows the test **PASSED**: HALT. The test does not assert missing behavior. Rewrite the test.
- If `actual_output` shows **ERROR** (syntax/import, not assertion failure): Fix the test itself, re-run, re-capture evidence.
- If any evidence field is **missing**: Transition to GREEN is **blocked**.
- This gate does **NOT** apply to REFACTOR phase (refactoring keeps tests green by definition).

### Example 1: TypeScript / Vitest

```
RED Evidence:
  command: npx vitest run test/pack/loader.test.ts
  actual_output: |
    ❯ loadPackRegistry > returns empty registry for empty packs directory
    AssertionError: expected undefined to be defined
  expected_failure_reason: "loadPackRegistry is not yet exported from src/pack/loader.ts"
```

### Example 2: Shell / Bash

```
RED Evidence:
  command: bash scripts/check-readme-metrics.sh
  actual_output: |
    Error: metrics section not found in README.md
    exit code: 1
  expected_failure_reason: "README does not yet contain metrics section header"
```

## Rationalization Catalog

### 1. Test-after Excuses（先写代码的借口）

| 借口 | 反驳 |
|------|------|
| "先写代码再补测试更快" | 事后补写的测试只验证你写的代码做了什么，不验证它应该做什么——前者是确认偏差，后者才是规格 |
| "我不知道测试该写什么，先写代码才有方向" | 不知道测试写什么 = 不知道需求是什么。回去读 spec，需求清楚了测试自然清楚了 |
| "这个逻辑很简单，测试是多余的开销" | 简单逻辑的测试写起来更快，而且"简单"的判断本身就是假设——假设由测试验证才可靠 |
| "重构时再补测试就行" | 重构的前提是有测试保护。没有测试的重构叫重写，你无法确认行为未变 |

### 2. Reference-keeping Excuses（保留旧代码的借口）

| 借口 | 反驳 |
|------|------|
| "删掉的代码我可能还要参考，先注释掉" | 注释掉的代码是噪声，git 历史就是你的参考。保留它只会让后续阅读者困惑这段代码是否还有效 |
| "我先复制一份旧实现再做新实现，万一对比需要" | git diff 就是对比工具。代码库里保留两份实现违反单一真相源原则 |
| "旧代码先留着，等新代码验证通过再删" | 这恰恰是 TDD 要防止的模式：旧代码和新代码共存期间，你会不知不觉依赖旧实现，导致新实现永远无法独立验证 |

### 3. Sunk-cost Excuses（沉没成本的借口）

| 借口 | 反驳 |
|------|------|
| "这段代码我已经写了很久了，删掉太浪费" | 沉没成本谬误。留着你已经知道有问题的代码，未来浪费的时间远超现在删掉它的成本 |
| "重写太费时间了，打补丁就行" | 打补丁的时间累加起来通常超过重写——而且每个补丁都在增加理解和维护的认知负担 |
| "我已经花了一半时间了，现在换方向前面的白费了" | 继续错误方向只会让白费的时间更多。止损是理性的工程决策，不是对前功的否定 |

### 4. Pragmatism Excuses（实用主义的借口）

| 借口 | 反驳 |
|------|------|
| "TDD 是理想主义，真实项目哪有时间" | TDD 的全称不是"理想驱动开发"。每个跳过测试的项目最终花在调试上的时间都远超写测试的时间 |
| "这个 bug 修一下就行，不用写测试" | 没有测试的 bug 修复只是临时止血。回归测试确保这个 bug 永远不会再次出现 |
| "这是第三方库的问题，测试也测不到" | 你无法测试第三方库的内部实现，但你可以用集成测试验证你与它的交互契约 |

### 5. Scope Excuses（范围相关的借口）

| 借口 | 反驳 |
|------|------|
| "这个功能后续会大改，现在写测试以后也要改" | 测试是规格不是实现。好的测试描述行为，实现变更时测试不应大改——如果你的测试和实现耦合太紧，说明测试写错了层面 |
| "这只是临时方案，不值得写测试" | 临时方案有三个问题：它不会临时、它会变成基础、后来者不知道它是临时的。测试至少能让"临时"的行为显式化 |

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
