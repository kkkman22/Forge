---
title: "Subagent 并行执行迁移与属性测试陷阱"
tags: ["subagent", "parallel-execution", "promise-allsettled", "property-test", "fast-check", "type-guard", "agent-migration"]
date: "2026-04-29"
confidence: 0.7
---

## 问题模式

### 1. ESM 项目中 require() 直接报错

在 decide 属性测试中使用 `require("../src/decide.js")` 动态导入，但项目为 ESM-only（`"type": "module"`），`require()` 不可用。

**触发条件**：ESM 项目中使用 CommonJS `require()`
**表现**：`ReferenceError: require is not defined`

### 2. fc.property 不支持异步回调

`fast-check` 的 `fc.property()` 不接受 async 回调函数。Property 2 测试需要异步 executor（`runSubagentsInParallel` 是 async），必须使用 `fc.asyncProperty()`。

**触发条件**：`fc.property()` + async callback
**表现**：TypeScript 类型错误或测试不等待 Promise

### 3. fc.constantFrom 生成重复值导致测试碰撞

`fc.constantFrom(...VALID_AGENT_TYPES)` 在多次生成中会产生相同的 agentType 值。如果 executor 用 `results.find(r => r.agentType === inv.agentType)` 匹配，会返回第一个匹配项而非正确的那个，导致计数错误。

**触发条件**：`fc.constantFrom()` + 基于 agentType 的 `Array.find()` 匹配
**表现**：测试间歇性失败（succeeded count 不等于 expected count）

### 4. 并行 Agent 可能静默恢复源文件

多个并行 Agent 完成后，源文件（build.ts、decide.ts、review.ts）被恢复到迁移前状态，所有新增函数丢失。

**触发条件**：多个 Agent 同时修改同一文件的场景
**表现**：后续编译或测试失败，函数未定义

### 5. Cleanup Agent 遗留孤立 it() 块

清理 Agent 删除了 `describe()` 块但保留了内部的 `it()` 块，导致语法错误。

**触发条件**：Agent 删除 describe 块时未检查内部内容
**表现**：`SyntaxError` 在 import 阶段

## 解决方案

### SubagentInvocation 协议

统一接口封装 subagent 调用参数：

```typescript
interface SubagentInvocation {
  agentType: string;
  prompt: string;
  permissionMode: "default" | "acceptEdits";
  maxTurns: number;
}
```

每个 agent 类型通过 `VALID_AGENT_TYPES` 白名单校验，`maxTurns` 上限 30。

### Promise.allSettled 并行容错

`runSubagentsInParallel()` 使用 `Promise.allSettled` 而非 `Promise.all`，确保部分失败不阻塞成功结果。结果分为 `succeeded[]` 和 `failed[]` 两类。

### 运行时类型守卫

Subagent 输出为非信任字符串（通过 Agent tool 返回）。`mergeReviewResults()` 对 JSON.parse 后的数据使用 `isValidReviewFinding()` 类型守卫校验结构完整性。

### 索引式 Executor 设计

属性测试中使用索引匹配而非值匹配，避免 `fc.constantFrom()` 重复值问题：

```typescript
let callIdx = 0;
const executor = async (): Promise<SubagentResult> => {
  const result = results[callIdx % results.length];
  callIdx++;
  return { ...result, agentType: `${result.agentType}-${callIdx - 1}` };
};
```

## 踩坑记录

1. **ESM 项目永远用 import 不用 require**：即使需要动态加载也用 `import()` 或直接静态 import。require() 在 ESM 项目中不可用。

2. **异步属性测试必须用 fc.asyncProperty**：`fc.property()` 是同步 API，不接受 Promise 返回值。涉及 async/await 的属性测试一律使用 `fc.asyncProperty()`。

3. **fc.constantFrom 的重复值陷阱**：当 generator 的值域小于生成次数时，必然产生重复。基于值匹配的测试逻辑会出错。改用索引匹配或为每个结果附加唯一后缀。

4. **并行 Agent 修改同一文件时需要锁定**：多个 Agent 同时修改同一源文件可能导致竞态。应该在 Plan 阶段规划好文件所有权，避免并行修改。

5. **删除代码块时检查内部内容**：删除 `describe()` 或其他容器时，必须检查内部是否还有 `it()`、`test()` 等子项。

## 决策理由

- **Promise.allSettled 而非 Promise.all**：并行容错——一个 subagent 超时不应阻止其他 subagent 的结果收集。
- **运行时类型守卫而非类型断言**：Subagent 输出来自 Claude Code Agent tool，是未经验证的字符串。`as ReviewFinding` 类型断言不安全，`isValidReviewFinding()` 类型守卫在运行时校验结构。
- **白名单而非黑名单验证 agentType**：白名单（`VALID_AGENT_TYPES`）只允许已知安全值，黑名单可能遗漏未知攻击向量。
- **maxTurns 上限 30**：防止失控的 subagent 无限循环，30 轮足以覆盖大多数分析任务。
- **直接 import 而非 require()**：项目为 ESM-only，所有导入必须使用 ES module 语法。

## 可复用模式

### Promise.allSettled 结果分区模式

```typescript
const outcomes = await Promise.allSettled(invocations.map(fn));
const succeeded = [], failed = [];
for (let i = 0; i < outcomes.length; i++) {
  if (outcomes[i].status === "fulfilled") {
    const r = outcomes[i].value;
    r.status === "success" ? succeeded.push(r) : failed.push(r);
  } else {
    failed.push({ error: outcomes[i].reason?.message });
  }
}
return { succeeded, failed };
```

### 运行时类型守卫 + JSON.parse 模式

对外部来源的字符串输出（Agent、API、文件）：

```typescript
function isValid<T>(value: unknown): value is T {
  return typeof value === "object" && value !== null
    && "requiredField" in value && typeof value.requiredField === "string";
}
const parsed = JSON.parse(raw);
if (!isValid(parsed)) throw new Error("Invalid structure");
```

### 属性测试索引式 Executor

当 generator 可能产生重复键时：

```typescript
let idx = 0;
const executor = () => {
  const result = results[idx % results.length];
  idx++;
  return { ...result, id: `${result.id}-${idx}` };
};
```
