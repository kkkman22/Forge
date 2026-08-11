---
feature: review-agent-timeout-dynamic
layout: design
created: 2026-06-17
---

# Design Document: Review Agent Timeout 动态化

## Overview

让 `agents-dispatcher.ts` 的 subagent 超时从写死的 15 分钟变为按 Tier（light/standard/full）可配。新增纯函数 `resolveAgentTimeoutMs(tier, configContent)` + 一个 config 字段，注入路径与现有 `parseDispatchMode` 完全对称。

**变更范围**：
- 修改 `src/forge/agents-dispatcher.ts`（新增 `resolveAgentTimeoutMs`，调整 `dispatch` 的默认值解析）
- 修改 `.tinkerman/config.md` + `templates/config.md`（新增字段）
- 新增测试 `test/forge/agents-dispatcher-resolve-timeout.test.ts`

**不涉及**：fallback.ts、ADR-0005 ladder、decide 阶段、模型选择。

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  调用方（外层驱动 / SKILL 指令执行）                            │
│                                                                │
│  1. 读 .tinkerman/status.md → tier (light/standard/full)          │
│  2. 读 .tinkerman/config.md → configContent                        │
│  3. resolveAgentTimeoutMs(tier, configContent) → timeoutMs     │
│  4. dispatch({ ..., timeoutMs })                               │
└────────────────────────┬─────────────────────────────────────┘
                         │
          ┌──────────────▼──────────────────────┐
          │  resolveAgentTimeoutMs(tier, cfg)    │  ← 新增纯函数
          │                                       │
          │  tier=light   → 5  min (可配)         │
          │  tier=standard→ 15 min (可配)         │
          │  tier=full    → 30 min (可配)         │
          │  缺失/非法    → 15 min (DEFAULT)      │
          └───────────────────────────────────────┘
                         │
          ┌──────────────▼──────────────────────┐
          │  dispatch(opts)                      │
          │                                       │
          │  timeoutMs = opts.timeoutMs           │
          │            ?? resolveAgentTimeoutMs() │  ← 改：从写死改为解析
          │            ?? DEFAULT_AGENT_TIMEOUT_MS │
          │  超时 → SIGTERM → fallback.ts 识别     │
          │         "timeout" → ADR-0005 ladder    │
          └───────────────────────────────────────┘
```

## Components and Interfaces

### Component 1: resolveAgentTimeoutMs 纯函数

设计完全对齐现有 `parseDispatchMode`（`agents-dispatcher.ts:88-101`）：

```ts
const TIER_DEFAULT_TIMEOUT_MS: Record<string, number> = {
  light: 5 * 60 * 1000,
  standard: 15 * 60 * 1000,
  full: 30 * 60 * 1000,
};

/**
 * Resolve per-tier agent timeout from `.tinkerman/config.md`.
 *
 * Reads `review.agent_timeout_minutes` (per-tier map) and returns the
 * millisecond timeout for the given tier. Falls back to per-tier defaults
 * (light=5, standard=15, full=30 min), and ultimately to
 * DEFAULT_AGENT_TIMEOUT_MS (15 min) when config is absent entirely
 * (backward compatibility).
 *
 * @param tier  Current routing tier from status.md.
 * @param configContent  Raw text of `.tinkerman/config.md`.
 * @returns Timeout in milliseconds.
 * @public
 */
export function resolveAgentTimeoutMs(
  tier: string | undefined,
  configContent: string,
): number {
  // 解析 review.agent_timeout_minutes.<tier>
  // 失败回退 TIER_DEFAULT_TIMEOUT_MS[tier] ?? DEFAULT_AGENT_TIMEOUT_MS
}
```

**config 格式选择**（扁平而非嵌套，对齐现有 config.md 风格——现有字段都是扁平 `review.subagent_concurrency` 形式）：

```yaml
review.agent_timeout_minutes.light: 5
review.agent_timeout_minutes.standard: 15
review.agent_timeout_minutes.full: 30
```

这种扁平点号格式与现有 `review.subagent_concurrency` 一致，正则解析简单，无需 YAML 解析器。

### Component 2: dispatch 默认值调整

当前（`agents-dispatcher.ts:182`）：
```ts
const timeoutMs = opts.timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS;
```

改为：
```ts
const tier = opts.tier ?? readTierFromStatus(); // 或由调用方传入
const timeoutMs = opts.timeoutMs
  ?? resolveAgentTimeoutMs(tier, configContent)
  ?? DEFAULT_AGENT_TIMEOUT_MS;
```

**关键约束**：`dispatch` 当前是纯函数风格的 IO 边界（不读文件）。为保持可测性，tier 和 configContent 应由**调用方传入 opts**，而非 dispatch 内部读文件。因此 `DispatchOptions` 新增两个字段：

```ts
export interface DispatchOptions {
  // ...现有字段
  tier?: string;            // 新增：当前路由 tier
  configContent?: string;   // 新增：config.md 内容（可选）
}
```

调用方（外层驱动）负责读取并传入；dispatch 内部仅在 opts.timeoutMs 未显式指定时才解析。

## Key Design Decisions

| Decision | Chosen Path | Rejected Path | Reason |
|----------|-------------|---------------|--------|
| 默认值策略 | 按 Tier 差异化（5/15/30） | 全局统一值 | 核心问题就是固定值误伤大任务；Tier 是现成的规模分级，零成本复用 |
| config 格式 | 扁平点号 `review.agent_timeout_minutes.full` | 嵌套 YAML 对象 | 对齐现有 config.md 扁平风格（`review.subagent_concurrency`）；正则解析即可，无 YAML 依赖 |
| 解析时机 | 调用方传 tier + configContent 给 dispatch | dispatch 内部读文件 | 保持 dispatch 的纯函数 IO 边界，对齐 parseDispatchMode 的设计；dispatch 读文件会破坏可测性 |
| 向后兼容 | config 缺失 → 全 Tier 15 分钟 | config 缺失 → 新默认值 | 严格向后兼容；现有用户升级零行为变化，需 opt-in 才启用动态值 |
| Tier 来源 | status.md 的 tier 字段 | 从 plan/spec 推断 | doctor.ts:464 已验证该字段可靠存在；避免新增推断逻辑 |
| 是否按 task 数动态 | 否，仅按 Tier | `baseline × taskCount/10` | Tier 已是规模分级；task 数动态化是过度优化，留待 metrics 驱动 |

## Error Handling

| 场景 | 行为 |
|------|------|
| config 无 review.agent_timeout_minutes 字段 | 全 Tier 用 DEFAULT_AGENT_TIMEOUT_MS（15 min，向后兼容） |
| 某 Tier 值缺失 | 回退该 Tier 的默认（light=5/standard=15/full=30） |
| 某 Tier 值非正整数 | 回退该 Tier 的默认 + 可选 stderr warning |
| tier 字段未知（非 light/standard/full） | 回退 standard 默认（15 min） |
| opts.timeoutMs 显式传入 | 优先使用，跳过 config 解析（override 语义不变） |
| 超时触发 | SIGTERM → fallback.ts 识别 "timeout" → ADR-0005 ladder（行为不变） |

## Testing Strategy

1. **纯函数单测**（核心）：`resolveAgentTimeoutMs` 覆盖——
   - 3 个 Tier 各自的 config 值解析
   - 单个 Tier 缺失回退
   - 全字段缺失回退 15 min（向后兼容）
   - 非法值（负数、非数字）回退
   - tier 未知回退 standard
2. **dispatch 集成测试**：opts 传 tier + configContent，验证 timeoutMs 正确传入 execFile。
3. **override 测试**：opts.timeoutMs 显式传入时，config 解析被跳过。
4. **回归**：现有 dispatch 测试（无 config 字段）仍用 15 min。
5. **`npm run check`** 全绿。
