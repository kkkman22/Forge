# Spec 4: 判别联合结果类型 — Command Routing Hub + No-Throw 契约

> 来源：open-gsd/gsd-core v1.4.4 `src/command-routing-hub.cts`（ADR-0174）
> 优先级：P2 | 影响范围：forge dispatcher + 所有子命令的返回类型
> 预估工作量：3-4h
> Forge 现状：✅ 已通过现有实现满足 — `src/branch-gate.ts:77-82` 已有完整 discriminated union

---

## 评估结论（2026-06-12）

**✅ 已通过现有实现满足，无需开发。**

- **判别联合已存在**：`src/branch-gate.ts` lines 77-82 的 `BranchGateResult` 已是完整的 discriminated union：
  ```typescript
  BranchGateResult = { kind: "passed" }
    | { kind: "skipped"; reason }
    | { kind: "blocked"; reasons; suggestedBranch }
    | { kind: "warned"; reasons; suggestedBranch }
    | { kind: "auto_fixed"; previousBranch; newBranch }
  ```
  这等价于 Spec 4 的 `Result<T> = { ok: true, data } | { ok: false, kind, ...payload }`，只是用 `kind` 代替 `ok`。

- **`createHub()` 不适用**：Forge 通过 SKILL markdown 路由命令，不是代码 dispatch。gsd-core 有 67 个 code-routed 命令需要 hub；Forge 不需要。

- **No-throw 契约已满足**：`src/forge-*.ts` 中零 `throw new Error/TypeError/RangeError`。
- **No-exit 契约已满足**：`process.exit()` 仅出现在 CLI entry points（check-frozen.ts, check-sandbox.ts, cli-error.ts），handler 层无 exit。

## 问题

当前 Forge 的子命令返回类型不统一：

| 命令 | 返回类型 | 问题 |
|------|---------|------|
| `/forge build` | void + 异常 | 调用方无法程序化判断成功/失败 |
| `/forge review` | ReviewResult 对象 | 与 build 返回类型不兼容 |
| `/forge plan` | Plan 对象或 throw | 异常路径与正常路径类型不一致 |

GSD Core v1.4.4 通过 **ADR-0174** 确立了统一的 `Result` 判别联合类型作为所有命令的单一返回模型。

### v1.4.4 新增 vs v1.3.0

| 特性 | v1.3.0 | v1.4.4 |
|------|--------|--------|
| 返回类型 | 各命令自定义 | **统一 `Result<T>` 判别联合** |
| 错误处理 | throw exception | **No-throw 契约** |
| 输出 | console.log | **No-print 契约**（调用方决定输出） |
| 进程退出 | process.exit() | **No-exit 契约**（调用方决定退出） |
| 路由 | switch/case | **createHub() 单一 dispatch seam** |

## 需求

### R1: Result 判别联合类型

```typescript
type Result<T = unknown> =
  | { ok: true;  data: T }
  | { ok: false; kind: ResultErrorKind; message: string; ...payload }

type ResultErrorKind =
  | 'UnknownCommand'   // 未知命令
  | 'InvalidArgs'      // 参数无效
  | 'HandlerRefusal'   // 处理器拒绝（前置条件不满足）
  | 'HandlerFailure'   // 处理器失败（运行时错误）
```

**关键设计点**：
- `ok` 是 **discriminant field**（判别字段），TypeScript narrowing 自动推导
- 成功路径 `{ ok: true, data }` 不包含错误字段
- 失败路径 `{ ok: false, kind, ... }` 不包含 data 字段
- `kind` 是 **machine-readable** 的错误分类，不是 human-readable message
- `message` 是 **human-readable** 的错误描述
- `payload` 携带错误特定的附加信息（如 `expected`/`actual`/`suggestions`）

### R2: No-Throw / No-Print / No-Exit 契约

所有命令处理器必须遵守三不契约：

```
No-Throw:
  → 处理器不得 throw exception
  → 所有错误路径必须返回 { ok: false, kind, message }
  → 内部 try/catch 捕获所有异常，转换为 HandlerFailure Result

No-Print:
  → 处理器不得直接 console.log / process.stdout.write
  → 返回 Result 给调用方，由调用方决定如何输出
  → 日志信息放入 Result 的 message 或 payload 字段

No-Exit:
  → 处理器不得 process.exit()
  → 进程退出由最外层调用方决定
  → Handler 失败只返回 Result，不终止进程
```

### R3: Command Routing Hub（单一 Dispatch Seam）

```typescript
// createHub 创建唯一的命令路由入口
const hub = createHub({
  cjsRegistry,   // .cjs 命令注册表
  manifest,      // 命令 manifest（声明式元数据）
  logger,        // 可选的日志接口
});

// 所有命令调用经过单一入口
const result: Result = hub.dispatch({
  command: 'build',
  args: { tier: 'standard', task: 'implement-auth' },
});

if (result.ok) {
  // 处理成功
} else {
  // 根据 kind 分支处理
  switch (result.kind) {
    case 'UnknownCommand': // 建议相似命令
    case 'InvalidArgs':    // 显示参数错误
    case 'HandlerRefusal': // 显示前置条件不满足
    case 'HandlerFailure': // 显示运行时错误
  }
}
```

### R4: Manifest 驱动的命令注册

```typescript
// 命令 manifest（声明式）
interface CommandManifest {
  name: string;                    // 命令名
  description: string;             // 简短描述
  args: ArgSpec[];                 // 参数规格
  handler: string;                 // 处理器函数引用（字符串路径）
  preconditions?: Precondition[];  // 前置条件
}

// Hub 根据 manifest 自动处理：
// 1. 未知命令 → UnknownCommand + did-you-mean 建议
// 2. 参数验证 → InvalidArgs（基于 ArgSpec）
// 3. 前置条件检查 → HandlerRefusal
// 4. 处理器调用 → HandlerFailure（try/catch wrap）
```

### R5: Did-You-Mean 建议

当用户输入未知命令时，返回相似命令建议：

```
输入：/forge biuld
返回：{
  ok: false,
  kind: 'UnknownCommand',
  message: 'Unknown command: biuld',
  suggestions: ['build', 'bind', 'board'],  // Levenshtein 距离 ≤ 2
}
```

### R6: Forge 适配映射

Forge 当前命令到 Result 类型的映射：

| Forge 命令 | 成功返回 | 失败 kind |
|-----------|---------|-----------|
| `/forge plan` | `{ ok: true, data: Plan }` | HandlerRefusal（spec 未锁定）/ HandlerFailure |
| `/forge build` | `{ ok: true, data: BuildSummary }` | HandlerRefusal（分支不干净）/ HandlerFailure |
| `/forge review` | `{ ok: true, data: ReviewResult }` | HandlerFailure |
| `/forge test` | `{ ok: true, data: TestSummary }` | HandlerFailure（测试失败） |
| `/forge ship` | `{ ok: true, data: ShipResult }` | HandlerRefusal（P0/P1 未修复）/ HandlerFailure |

## 设计决策

| 决策 | 选项 | 选择 | 理由 |
|------|------|------|------|
| 错误传递 | throw / Result | Result（No-throw） | 可程序化处理，不中断调用链 |
| 输出方式 | 内部 print / 返回数据 | 返回数据（No-print） | 调用方决定格式（CLI vs API vs 测试） |
| 判别字段 | status / ok / type | ok（boolean） | 最简洁，TypeScript narrowing 原生支持 |
| 错误分类 | string / enum / union | union（ResultErrorKind） | 穷举检查，编译器保证完整性 |
| 路由方式 | switch/case / hub | createHub() | 单一 seam，易于测试和扩展 |

## 验收标准

- [ ] R1 `Result<T>` 判别联合类型定义
- [ ] R2 No-throw / No-print / No-exit 契约文档化
- [ ] R3 createHub() 单一 dispatch seam 设计
- [ ] R4 manifest 驱动的命令注册规格
- [ ] R5 did-you-mean 建议算法（Levenshtein ≤ 2）
- [ ] R6 Forge 命令到 Result 类型的映射表
- [ ] `npm run check` 通过
