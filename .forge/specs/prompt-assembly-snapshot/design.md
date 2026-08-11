## Overview

为 `forge-dispatcher` 的确定性拼装管线补充结构快照测试层。核心是**只对拼装结果的结构指纹做快照，不对 markdown 文案做快照**——这区分了"契约破坏"与"文案迭代"两类变更。

## Architecture

### 当前状态

`dispatchForgeSubcommand`（`src/forge-dispatcher.ts:40`）是一个顺序拼装管线：

```
topic
  → validateTopic           (forge-dispatcher/allowlist.ts)
  → checkCmuxGate           (forge-dispatcher/cmux-gate.ts)
  → resolveLibPath          (forge-dispatcher/path-resolve.ts)
  → checkIntegrity          (forge-dispatcher/integrity-check.ts)
  → readFileSync(lib.md)    (raw markdown — 不进快照)
  → resolveAllowedTools     (forge-dispatcher/tools-resolve.ts)
  → parse dispatch_mode     (frontmatter regex)
  → wrapWorkspaceContext    (forge-dispatcher/untrusted-fence.ts)
  → DispatchResult          { code, dispatchPath, ... }
```

已有覆盖：
- `test/router-hint-rules-externalized.test.ts` 对 `generateHints` 做 golden-snapshot（type × phase × command 全组合）
- `test/single-entry/untrusted-fence.test.ts` 对 fence 包装做单元测试

**缺口**：没有一个测试验证"完整拼装后的 `DispatchResult` 在结构上未被破坏"。fence 丢了、dispatch_mode 解析条件写反、tools 集合漏项——这些都能逃过现有测试。

### 提议的架构指纹抽取层

新增 `assemble-fingerprint.ts`，一个纯函数：

```ts
interface AssemblyFingerprint {
  subcommand: string;
  dispatchMode: string;           // "inline" | "fork" | ...
  resolvedLibPath: string;        // 相对 pluginRoot 的路径
  allowedTools: string[];         // 排序后
  hasUntrustedPreamble: boolean;  // fence 是否在结果中
  hintTags: string[];             // generateHints 的 tag 集合，排序后
}

export function extractFingerprint(
  result: DispatchResult,
  opts: { tier: string; taskType: TaskType; phase: ProjectPhase }
): AssemblyFingerprint
```

**关键设计：不序列化 markdown 正文**。`readFileSync` 读到的 lib.md 内容不进指纹，只有从它解析出的 `dispatchMode` / `allowedTools` 进。这样改 lib 文案不触发快照失败，只有解析逻辑变了才触发。

### 快照测试结构

```ts
// test/forge-dispatcher/assembly-snapshot.test.ts
const COMBOS = [
  { tier: "light",   taskType: "docs",      phase: "iteration",  command: "build" },
  { tier: "standard",taskType: "backend",   phase: "greenfield", command: "review" },
  { tier: "full",    taskType: "fullstack", phase: "greenfield", command: "build" },
  // ~12 个代表性组合，覆盖三类 tier × 两类 taskType × 关键 phase
];

for (const combo of COMBOS) {
  it(`${key(combo)} assembly fingerprint stable`, () => {
    const result = await dispatchForgeSubcommand(combo.command, {
      _mocks: { agent: noop, read: noop },  // 不真实执行，只断拼装
    });
    const fp = extractFingerprint(result, combo);
    expect(fp).toEqual(GOLDEN[key(combo)]);
  });
}
```

## Component Interfaces

```ts
// src/forge-dispatcher/assemble-fingerprint.ts (新增，纯函数)
export interface AssemblyFingerprint { ... }
export function extractFingerprint(result: DispatchResult, opts): AssemblyFingerprint;
```

依赖现有导出：`DispatchResult`（`forge-dispatcher.ts:31`）、`UNTRUSTED_PREAMBLE`（`:19`）、`generateHints`（`router.ts`）。

## Data Model

`test/__fixtures__/assembly-golden.json` 结构：

```json
{
  "light|docs|iteration|build": {
    "subcommand": "build",
    "dispatchMode": "inline",
    "resolvedLibPath": "forge/lib/build/instructions.md",
    "allowedTools": ["Read","Write","Edit","Bash"],
    "hasUntrustedPreamble": true,
    "hintTags": []
  }
}
```

## Error Handling

- mock 步骤缺关键字段 → `extractFingerprint` 抛 `FingerprintMissingField` 并附字段名
- golden 文件缺失 → 测试 skip 并提示运行生成命令
- dispatch 返回 `E_*` 错误码 → 不进指纹对比，单独测（已有覆盖）

## Testing Strategy

| 层级 | 测试 | 目标 |
|------|------|------|
| 单元 | `extractFingerprint` 纯函数 | 给定 DispatchResult，输出正确指纹 |
| 契约 | `assembly-snapshot.test.ts` | 代表性组合指纹 = golden |
| 不变量 | additive hints 断言 | 扩展命令序列 → hint 集合是超集 |

**破坏性回归注入验证**（build 阶段必做）：临时把 `wrapWorkspaceContext` 改成空函数，确认快照测试标红 `hasUntrustedPreamble: false`；临时把 hints 改成 override，确认 additive 断言失败。验证后还原。

## Rollout

1. 先落地 `extractFingerprint` + 单元测试（无 golden，纯函数正确性）
2. 选定 ~12 个代表性组合，生成首版 golden
3. 跑全量，确认绿
4. 注入破坏性回归验证拦截能力，还原
5. 作为回归测试并入 `npm test`（暂不进 `check` 硬阻断链）

## Current State (brownfield)

| Module | Path | Current Behavior |
|--------|------|------------------|
| forge-dispatcher | `src/forge-dispatcher.ts:40` | 完整拼装管线已存在，`DispatchResult` 已稳定 |
| router hints | `src/router.ts` `generateHints` | 已有 golden-snapshot，但 additive 性质未显式断言 |
| untrusted-fence | `src/forge-dispatcher/untrusted-fence.ts` | `UNTRUSTED_PREAMBLE` 已导出，有单元测试 |
| 现有 snapshot 模式 | `test/router-hint-rules-externalized.test.ts` | 可作为本特性的实现样板 |

## Proposed Change

**要改变的**：新增结构指纹抽取 + 代表性组合快照，把"fence 是否在、dispatch_mode 解析对不对、tools 集合是否完整"纳入确定性回归射程。

**明确不改变的**：
- `dispatchForgeSubcommand` 的对外签名与返回形状
- lib markdown 正文（不进快照）
- `check` 命令的硬阻断链（本特性先作为回归测试存在）

## Reversibility

**Rollback Checklist**：
- 删除 `src/forge-dispatcher/assemble-fingerprint.ts`
- 删除 `test/forge-dispatcher/assembly-snapshot.test.ts`
- 删除 `test/__fixtures__/assembly-golden.json`

**Mount Points**：纯新增文件，零 mount point 改动，删除即完全回退。

## Open Questions

1. 代表性组合数量：12 个够不够覆盖 `3 tier × 6 taskType × 4 phase`？建议先 12，覆盖率报告出来再补。
2. additive 不变量断言放在本测试还是 `router-hint-rules-externalized.test.ts`？倾向后者（同类聚合），本特性只引用其结论。
