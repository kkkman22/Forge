---
feature: review-model-tier
date: 2026-06-21
layout: tasks
created: 2026-06-21
spec_ref: ".forge/specs/review-model-tier/requirements.md"
---

# Tasks

## Overview

为本 spec 执行 TDD:先产出 model-tier 解析函数(RED→GREEN),再追加 agent frontmatter 与 review instructions 的文档约束,最后一致化 validation-pass。

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["T-01", "T-02"] },
    { "wave": 2, "tasks": ["T-03", "T-04"] },
    { "wave": 3, "tasks": ["T-05"] },
    { "wave": 4, "tasks": ["T-06"] }
  ]
}
```

## Task Definitions

### T-01 model-tier 解析函数骨架

- **Goal**: 产出 parseModelTierMap + resolveModelTier,支持正常解析与缺省默认
- **Depends On**: 无
- **TDD Steps**:
  - RED — `test/review/model-tier.test.ts` 写 parseModelTierMap 读 config + 缺省默认测试;resolveModelTier 各 tier 正常解析测试
  - GREEN — 实现 parseModelTierMap + DEFAULT_TIER_MAP;实现 resolveModelTier resolved 分支
  - REFACTOR — 提取 ModelTier / ModelResult 类型
- **Verify Command**: `npx vitest run test/review/model-tier.test.ts`
- **Definition of Done**: parse + resolve 正常路径测试通过

### T-02 fail-open 与缺字段处理

- **Goal**: resolveModelTier 在不支持/缺字段时 fail-open 回退 inherit
- **Depends On**: T-01
- **TDD Steps**:
  - RED — 写测试:不支持 model fail-open;缺 model_tier 字段视为 inherit + 告警;config 格式错误用默认
  - GREEN — 实现 fallback 分支 + undefined→inherit + 告警输出
  - REFACTOR — 无
- **Verify Command**: `npx vitest run test/review/model-tier.test.ts`
- **Definition of Done**: fail-open 测试通过;告警可观测

### T-03 四 agent frontmatter 加 model_tier

- **Goal**: 文档侧落地四个 agent 的分级标注
- **Depends On**: 无(可与 T-01/T-02 并行)
- **TDD Steps**:
  - RED — bash 契约测试:四个 agent frontmatter 含 model_tier(当前失败)
  - GREEN — spec-check 加 cheap;quality-check 加 standard;security-check 加 capable;validation-pass 加 standard。保留现有 model: inherit 行
  - REFACTOR — 无
- **Verify Command**: `bash -c "grep -q 'model_tier: cheap' .claude/agents/spec-check.md && grep -q 'model_tier: standard' .claude/agents/quality-check.md && grep -q 'model_tier: capable' .claude/agents/security-check.md && grep -q 'model_tier: standard' .claude/agents/validation-pass.md"`
- **Definition of Done**: 四个 grep 命中;现有 frontmatter 字段未破坏

### T-04 config 加 review_model_tier_map + review instructions dispatch 规则

- **Goal**: 配置侧与 dispatch 规则落地
- **Depends On**: 无(可与 T-03 并行)
- **TDD Steps**:
  - RED — bash 契约测试:`grep 'review_model_tier_map' .forge/config.md` 非空;`grep 'model_tier' skills/forge/lib/review/instructions.md` 非空
  - GREEN — config 加 review_model_tier_map 段(4 tier 默认映射 + 注释);review instructions §2 dispatch 步骤加分级解析 5 步规则 + compact-safe 交互说明
  - REFACTOR — 无
- **Verify Command**: `bash -c "grep -q 'review_model_tier_map' .forge/config.md && grep -q 'model_tier' skills/forge/lib/review/instructions.md"`
- **Definition of Done**: config 段存在;dispatch 规则含 5 步 + compact-safe 交互

### T-05 validation-pass 一致化

- **Goal**: validation-pass 模型选择从硬编码改为按分级
- **Depends On**: T-03, T-04
- **TDD Steps**:
  - RED — bash 契约测试:review/instructions.md:483 不再含 `sonnet/inherit by severity` 硬编码
  - GREEN — 修改 :483 描述为"按 model_tier: standard 解析",severity 仅影响 confidence 降级
  - REFACTOR — 无
- **Verify Command**: `bash -c "! grep -q 'sonnet/inherit by severity' skills/forge/lib/review/instructions.md"`
- **Definition of Done**: 硬编码描述移除;现有 validation-pass 降级测试回归通过

### T-06 全量验证

- **Goal**: 全套测试 + 契约校验通过
- **Depends On**: T-05
- **TDD Steps**: 无(验证任务)
- **Verify Command**: `npm run check`
- **Definition of Done**: `npm run check` 全量通过;`bash scripts/check-spec-contract.sh .forge/specs/review-model-tier/requirements.md` 通过;现有 validation-pass 降级行为回归通过
