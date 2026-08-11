---
feature: review-model-tier
date: 2026-06-21
layout: design
created: 2026-06-21
tier: standard
workflow_variant: requirements-first
kind: feature
brownfield: true
---

# Design Document: Review Model Tier

## Overview

为 review subagent 引入 model_tier frontmatter 字段(cheap/standard/capable/inherit),config 配置 tier → 实际 model 映射。dispatch 时强制读取 tier、解析为 model、fail-open 回退 inherit。改动 = 4 个 agent frontmatter 各加 1 行 + config 加 1 段 + review instructions 加 dispatch 规则 + 轻量 TS 解析函数。

## Architecture

```
.claude/agents/<agent>.md
  frontmatter:
    model_tier: cheap|standard|capable|inherit   ← 新增
                │
                ▼
.tinkerman/config.md
  review_model_tier_map:                          ← 新增
    cheap: "haiku"; standard: "sonnet"; capable: "opus"; inherit: "inherit"
                │
                ▼
src/review/model-tier.ts
  resolveModelTier(tier, config, harnessSupportFn): ModelResult
                │
                ▼
review/instructions.md §2 dispatch 步骤
  读取 agent.model_tier → resolveModelTier → 传入 dispatch
  + 主 agent 输出 `spec-check: cheap → haiku`(可观测)
```

## Component Interfaces

```typescript
export type ModelTier = "cheap" | "standard" | "capable" | "inherit";

export type ModelResult =
  | { kind: "resolved"; tier: ModelTier; model: string; fell_back: false }
  | { kind: "fallback"; tier: ModelTier; requested: string; model: "inherit"; fell_back: true; reason: string };

export function resolveModelTier(args: {
  tier: ModelTier | undefined;       // 来自 agent frontmatter,undefined = inherit
  config: ForgeConfig;
  harnessSupports: (model: string) => boolean;
}): ModelResult;
```

**优先级**:model_tier 存在时覆盖 model 字段;model_tier: inherit 等同旧 model: inherit;缺省 model_tier 时回退 model 字段(向后兼容)。

**fail-open 契约**:任何解析失败/不支持都回退 inherit,不阻断 review。成本优化是 best-effort,可用性优先。

## Data Model

无持久化数据。config 的 `review_model_tier_map` 是唯一配置源,缺省时内置默认 `{cheap: "haiku", standard: "sonnet", capable: "inherit", inherit: "inherit"}`。

## Error Handling

| 情况 | 处理 |
|------|------|
| config 缺 review_model_tier_map | 用内置默认 + 首次 review 提示可配置 |
| tier 映射的 model 名 harness 不支持 | fail-open 回退 inherit + 告警,不阻断 |
| agent frontmatter 缺 model_tier 字段 | 视为 inherit + 告警提示,不阻断 |
| config 映射格式错误 | 用内置默认 + 告警 |

## Testing Strategy

- **单元测试**(`test/review/model-tier.test.ts`):parseModelTierMap 读 config + 缺省默认;resolveModelTier 各 tier 正常解析;不支持 fail-open;缺字段告警。
- **集成测试**:mock harnessSupports,验证 dispatch 流程读取 tier 并输出可观测行。
- **回归**:`npm run check` 全量通过;现有 validation-pass 降级行为不变。

## Current State

现有实现引用(file:line 准确性以 build 时复核为准):

| 现有产物 | 位置 | 现有行为 |
|---------|------|---------|
| review agent frontmatter | `.claude/agents/spec-check.md` 等头部 | `model: inherit`,无 model_tier 字段 |
| validation-pass 模型选择 | `skills/forge/lib/review/instructions.md:483` | 硬编码 `model sonnet/inherit by severity` |
| config 文件 | `.tinkerman/config.md` | 无 review_model_tier_map 段 |
| compact-safe 模式 | `skills/forge/lib/review/instructions.md:481` | 按 context budget 跳过 layer(quality/adversarial) |
| 并发降级 | `skills/forge/lib/review/instructions.md:146` | HTTP 429 三级降级,与模型选择是独立维度 |

## Proposed Change

### 要改变的
- 四个 agent frontmatter 加 model_tier(spec-check=cheap/quality-check=standard/security-check=capable/validation-pass=standard)。
- `.tinkerman/config.md` 加 review_model_tier_map 段。
- `skills/forge/lib/review/instructions.md` §2 dispatch 步骤加分级解析规则(5 步)+ compact-safe 交互说明。
- `skills/forge/lib/review/instructions.md:483` validation-pass 描述从硬编码改为按分级解析。
- 新增 `src/review/model-tier.ts`。

### 明确不改变的
- review 三层并行架构不变。
- fallback ladder 不变。
- compact-safe 的 layer 过滤逻辑不变(仅澄清不降级模型)。
- validation-pass 的 severity 降级逻辑(R5.5/R5.6)不变。
- 现有 model: inherit 字段保留(向后兼容)。

## Reversibility

### Rollback Checklist
1. 还原四个 agent frontmatter(删除 model_tier 行,保留 model: inherit)。
2. 还原 `.tinkerman/config.md`(删除 review_model_tier_map 段)。
3. 还原 `skills/forge/lib/review/instructions.md` §2 dispatch 步骤(删除分级解析规则)+ :483(恢复硬编码描述)。
4. 删除 `src/review/model-tier.ts` 及测试 `test/review/model-tier.test.ts`。
5. 跑 `npm run check` 确认无回归。

### Mount Points
- 四个 agent frontmatter。
- `.tinkerman/config.md`(新增配置段)。
- review/instructions.md §2 dispatch 步骤 + validation-pass 描述行。
- src/review/model-tier.ts(新增)。

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| cheap 模型对 spec-check 机械对照也力不从心(漏报需求) | model_tier 是 agent 级默认,用户可在 frontmatter 覆盖;adversarial stance + Independent Verification 兜底漏报 |
| config 里 model 名写错导致全 fallback | fail-open 回退 inherit(等同当前),不比现状差;告警可观测 |
| 不同 harness 支持的 model 名不同 | harnessSupports 按当前 harness 查询;config 可按项目调整 |
| 与 compact-safe 降级语义混淆 | R3.AC4 明确:compact-safe 降 layer 不降模型;分级是独立维度 |

## Rollout

- 纯文档 + 轻量 TS,无数据迁移。
- 一次性 ship,config 默认内置映射。
- 向后兼容:历史 agent(无 model_tier)视为 inherit,行为不变。

## Open Questions

- harnessSupports 函数如何查询当前 harness 支持的 model?需在 plan 阶段确认 harness API。
- 内置默认映射的 cheap/standard 模型名(haiku/sonnet)是否适配所有目标 harness?可能需按 harness 分支默认。
