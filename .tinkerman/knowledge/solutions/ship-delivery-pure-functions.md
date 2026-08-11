---
title: "Ship 交付引擎纯函数模式与陷阱"
tags: ["git-transaction", "pure-function", "regex", "type-safety", "shell-injection", "effect-executor", "property-test"]
date: "2026-04-29"
confidence: 0.75
---

## 问题模式

### 1. 全局正则 lastIndex 陷阱

在 `validateBranchName()` 中使用 `/g` flag 正则的 `.test()` 方法，导致 `lastIndex` 在多次调用间残留，产生间歇性测试失败（fast-check 属性测试中暴露）。

**触发条件**：全局正则 + `.test()` 方法 + 跨多次调用
**表现**：同一个字符串第一次 `.test()` 返回 `true`，第二次返回 `false`

### 2. 字符白名单无法拦截 `..` 序列

`validateBranchName()` 使用字符白名单（`[a-zA-Z0-9\-_./]`）验证分支名。`.` 是合法 Git ref 字符，但 `..` 序列在 Git 中有特殊含义（范围遍历）。字符级检查无法检测多字符序列。

**触发条件**：分支名包含 `..` 序列，如 `feature..traversal`
**表现**：攻击向量通过验证，可能导致 Git 命令注入

### 3. abstract class 不能实例化

项目错误体系有多层：`ForgeError`（abstract 基类）→ `UnexpectedEffectError`（具体类）。在 effect-executor 中尝试 `new ForgeError(...)` 导致运行时错误。

**触发条件**：需要构造错误实例但引用了 abstract 基类
**表现**：TypeError at runtime

### 4. 跨模块类型不一致

`worktree-manager.ts` 使用 inline type 定义 `shipOption` 参数（含 `discard`），而 `execution-mode.ts` 的 `DeliveryMethod` 类型使用 `prompt`。两个类型代表不同域（交付选项 vs 配置方法），但边界模糊。

**触发条件**：两个模块需要共享"交付方式"概念但使用不同类型
**表现**：P1 review finding — 类型系统不一致

## 解决方案

### 纯函数命令构建器模式

所有 Git 命令通过纯函数构建，返回 `GitCommand` 描述符（`{ executable, args }`），由 `execFileSync` 执行：

```typescript
type GitCommand = { executable: string; args: string[] };

function buildCheckoutCommand(branch: string): GitCommand {
  validateBranchName(branch);
  return { executable: "git", args: ["checkout", branch] };
}
```

**核心原则**：
- 构建器不执行 I/O，只返回描述符
- `validateBranchName()` 在每个构建器入口调用
- `execFileSync` 使用 args 数组（非字符串拼接），杜绝 shell 注入

### validateBranchName 多层防御

```typescript
function validateBranchName(branch: string): void {
  // Layer 1: 非空检查
  // Layer 2: Shell 元字符检测（containsShellMetacharacters）
  // Layer 3: Git 非法字符检测（不用 /g flag，用内联正则）
  // Layer 4: 多字符序列检测（.. , @{, .lock）
  // Layer 5: 首尾字符检查（不能以 ./- 开头或结尾）
}
```

### 分离类型域

创建两个独立类型：
- `DeliveryMethod`（配置域）: merge/push-pr/keep-branch/prompt
- `ShipDeliveryOption`（执行域）: merge/push-pr/keep-branch/discard

## 踩坑记录

1. **全局正则 → 永远用内联正则做 `.test()`**：`/[pattern]/.test(str)` 每次创建新正则对象，不存在 lastIndex 问题。全局正则只用于 `.match()` 或 `.replace()` 等需要多次匹配的场景。

2. **字符白名单不够 → 需要序列级检查**：安全性验证不能只看单个字符，必须检查多字符序列（`..`、`@{`、`.lock`）。

3. **错误类层级需提前确认**：使用错误类前先检查是否 abstract，项目中优先使用具体子类。

4. **文件丢失后用 `git show` 恢复**：`git show <commit>:<path> > <path>` 可以从特定 commit 恢复单个文件。

5. **Biome 的 `noNonNullAssertion` 规则**：TypeScript 的 `!` 非空断言被 Biome 禁止。改用类型守卫或 `as const` 风格的类型收窄。

## 决策理由

- **选择 reject 而非 sanitize**：Git 分支名输入拒绝非法字符比尝试清理更安全。sanitize 可能引入新的攻击面。
- **选择纯函数而非 class**：命令构建器不需要状态，纯函数更易测试（属性测试）。
- **选择 `execFileSync` 而非 `exec`**：`execFileSync` 直接传递 args 数组给系统调用，不经 shell 解释。
- **选择 `UnexpectedEffectError` 而非 `ForgeError`**：effect-executor 中的错误是"意外效果执行失败"，语义更匹配具体子类。

## 可复用模式

### 纯函数命令构建器

任何需要构造外部命令的场景都应使用此模式：

```typescript
type Command = { executable: string; args: readonly string[] };
function buildXxxCommand(param: string): Command {
  validate(param);
  return { executable: "tool", args: ["flag", param] };
}
// 执行: execFileSync(cmd.executable, cmd.args)
```

**适用场景**：Git 操作、CLI 工具调用、Docker 命令构造、SSH 命令构造

### 输入验证 reject 模式

对安全敏感的输入（分支名、文件名、命令参数），使用 reject 而非 sanitize：

```typescript
function validate(input: string): void {
  if (containsDangerous(input)) throw new ValidationError(input);
  // 不返回清理后的值 — 要么接受要么拒绝
}
```

### 属性测试 + Shell 注入

用 fast-check 的 `shellMetacharStringArb` 生成器验证所有命令构建器：

```typescript
fc.assert(fc.property(shellMetacharStringArb, (dangerous) => {
  expect(() => buildCommand(dangerous)).toThrow();
}), { numRuns: 200 });
```
