---
feature: review-model-tier
status: locked
date: 2026-06-21
layout: requirements
created: 2026-06-21
tier: standard
workflow_variant: requirements-first
kind: feature
brownfield: true
---

# Requirements Document

## Purpose

obra/superpowers v6.0.0 发现一个成本陷阱:dispatch subagent 时不显式声明 model,reviewer 会默认继承会话最贵模型,导致多个 reviewer 全开顶级模型、token 成本爆炸。v6 修复是每次 dispatch 必须声明 model,模板带"能便宜就便宜"指导。

当前 Forge 的 review subagent(`.claude/agents/spec-check.md` 等)frontmatter 统一是 `model: inherit`,全部继承主 agent 模型。spec-check 大量工作是机械的逐条对照需求,security-check 才需要深度推理,却都跑同一档模型,成本未优化。本 spec 给 review subagent 引入显式 model 分级标注 + dispatch 时强制读取分级,让机械对照类工作跑便宜模型。与现有并发降级、compact-safe 共同构成成本意识链路。

## Glossary

| Term | Definition |
|------|-----------|
| model tier | review subagent 按职责划分的模型分级,枚举 cheap/standard/capable/inherit |
| model_tier_map | config 中 tier → 实际 model 名的映射 |
| fail-open | 解析失败/不支持时回退到 inherit(不阻断 review) |

## Requirements

### Requirement 1: agent frontmatter 新增 model 分级字段

每个 review subagent 的 frontmatter 显式声明它的模型分级,dispatch 时按分级选模型而非无脑继承。

#### Acceptance Criteria

- 当 review subagent 的 frontmatter 被读取时 系统应当 识别新增的模型分级字段,枚举值为 cheap/standard/capable/inherit。
- 当三个 review subagent 的分级被设置时 系统应当 按职责设定默认值:spec-check 为 cheap(机械对照需求)、quality-check 为 standard(六维质量判断)、security-check 为 capable(深度安全推理)。
- 当某 agent 显式声明分级为 inherit 时 系统应当 视为等同当前 model: inherit 行为(向后兼容 opt-out)。

### Requirement 2: 模型分级到实际模型映射可配置

模型分级到实际模型名的映射可在 config 配置,不同 harness/不同项目预算下可调整。

#### Acceptance Criteria

- 当配置文件被读取时 系统应当 识别新增的模型分级映射段,格式为分级 → 实际模型名。
- 当配置文件缺省该映射段时 系统应当 使用内置默认映射并在首次 review 时提示用户可配置。
- 当某分级映射的模型名当前 harness 不支持时 系统应当 回退到 inherit 并在主 agent 输出告警,不阻断 review(成本优化不应破坏可用性)。

### Requirement 3: review dispatch 强制读取分级

dispatch subagent 时被强制读取其分级并解析为实际模型,不出现"忘了声明导致全继承最贵模型"的陷阱。

#### Acceptance Criteria

- 当 review controller dispatch subagent 时 系统应当 在 dispatch 前读取目标 agent 的分级,经映射解析为实际模型名,传入 dispatch 调用。
- 当 dispatch 解析完成时 系统应当 在主 agent 输出显示每个 subagent 的解析结果(如 spec-check: cheap → haiku),便于成本审计。
- 当 agent frontmatter 无分级字段(历史或用户自定义 agent)时 系统应当 视为 inherit 并显示提示(提示但不阻断)。
- 当 Compact-Safe 模式激活时 系统应当 不覆盖分级:即 compact-safe 跳过的是 layer,不是降级模型;被保留的 subagent 仍按各自分级选模型。

### Requirement 4: validation-pass agent 分级一致化

validation-pass agent 的模型选择纳入分级体系,而非当前的按 severity 硬编码。

#### Acceptance Criteria

- 当 validation-pass agent 的 frontmatter 被设置时 系统应当 新增分级字段,默认 standard(确认类工作足够)。
- 当 review 文档描述 validation-pass 的模型选择时 系统应当 从按 severity 硬编码改为按分级解析,severity 仅影响 confidence 降级逻辑不影响模型选择。
- 当本改动落地时 系统应当 保持 validation-pass 现有的 P0/P1 降级行为不变,仅统一模型选择入口。

## Non-Functional Requirements

- **成本优化**:机械对照类工作(spec-check)跑便宜模型,实测应降低 review 阶段 token 成本,具体降幅依赖 harness 与模型价差。
- **可用性优先**:任何解析失败/不支持都 fail-open 回退 inherit,绝不阻断 review。
- **向后兼容**:缺省分级字段的历史 agent 视为 inherit,行为与现状一致。
- **可观测**:每次 dispatch 输出解析结果与告警,便于成本审计与配置调优。

## Out of Scope

- 不改 review 三层架构。
- 不改 fallback ladder。
- 不引入新的 model provider 配置(沿用 harness 已支持的 model)。
- 不自动切换 harness 不支持的 model(fail-open 回退 inherit)。
- 不改 compact-safe 的 layer 过滤逻辑(仅澄清与分级的交互)。

## Delta

### Added
- agent frontmatter 的 model 分级字段(cheap/standard/capable/inherit)。
- config 的模型分级映射段。
- review dispatch 的分级解析步骤与可观测输出。
- 模型分级解析函数。

### Modified
- 四个 agent(spec-check/quality-check/security-check/validation-pass)frontmatter 加分级字段。
- review/instructions.md §2 dispatch 步骤加分级解析规则。
- review/instructions.md:483 的 validation-pass 模型描述从硬编码改为按分级解析。

### Unchanged
- review 三层并行架构不变。
- fallback ladder 不变。
- compact-safe 的 layer 过滤逻辑不变(仅澄清不降级模型)。
- validation-pass 的 severity 降级逻辑(R5.5/R5.6)不变。
- 现有 model: inherit 字段保留(向后兼容,分级优先级更高)。

## 反漂移声明

- **主目标**:让 review dispatch 显式声明并解析模型分级,避免机械对照类工作跑最贵模型。
- **非目标代理信号**:不为省钱降低 security-check 的模型档(它本就该用 capable);不引入多 provider 路由(沿用 harness 支持);不改 fallback ladder(那是可用性问题,本 spec 是成本问题);不把分级硬编码进 TS(必须 config 可配)。
- **验证材料角色**:需求满足的证据是——dispatch 时读取分级并解析为实际模型;不支持时 fail-open;解析结果可观测;config 可调整映射。

## Validation Contract

### VAL-R1-001: 三 agent frontmatter 含分级字段

**Verify-By**: `bash:contract`
**Evidence**: `grep 'model_tier:' .claude/agents/spec-check.md .claude/agents/quality-check.md .claude/agents/security-check.md` 各命中 1 行,值分别为 cheap/standard/capable
**Covers**: R1.AC1, R1.AC2

### VAL-R1-002: inherit opt-out

**Verify-By**: `bash:contract`
**Evidence**: agent frontmatter 或其 schema 文档声明分级枚举含 inherit
**Covers**: R1.AC3

### VAL-R2-001: config 映射可配置

**Verify-By**: `vitest:unit`
**Evidence**: `test/review/model-tier.test.ts` 测试 `parseModelTierMap reads review_model_tier_map from config` 通过;缺省返回内置默认
**Covers**: R2.AC1, R2.AC2

### VAL-R2-002: 不支持模型 fail-open

**Verify-By**: `vitest:unit`
**Evidence**: `test/review/model-tier.test.ts` 测试 `unsupported model name falls back to inherit without blocking` 通过
**Covers**: R2.AC3

### VAL-R3-001: dispatch 读取分级

**Verify-By**: `bash:contract`
**Evidence**: `grep 'model_tier' skills/forge/lib/review/instructions.md` 非空且命中"dispatch 前必须读取"
**Covers**: R3.AC1

### VAL-R3-002: 解析结果可观测

**Verify-By**: `vitest:unit`
**Evidence**: `test/review/model-tier.test.ts` 测试 `resolveModelTier produces observable output spec-check: cheap → haiku` 通过
**Covers**: R3.AC2

### VAL-R3-003: 缺字段提示

**Verify-By**: `vitest:unit`
**Evidence**: `test/review/model-tier.test.ts` 测试 `agent without model_tier warns and uses inherit` 通过
**Covers**: R3.AC3

### VAL-R3-004: compact-safe 不降级模型

**Verify-By**: `bash:contract`
**Evidence**: review/instructions.md 命中"compact-safe 跳过的是 layer,不降级模型"
**Covers**: R3.AC4

### VAL-R4-001: validation-pass 分级一致化

**Verify-By**: `bash:contract`
**Evidence**: `grep 'model_tier:' .claude/agents/validation-pass.md` 命中 standard;review/instructions.md 不再含按 severity 硬编码的模型选择
**Covers**: R4.AC1, R4.AC2

### VAL-R4-002: validation 降级行为不变

**Verify-By**: `vitest:unit`
**Evidence**: `test/review/validation-pass.test.ts`(现有)回归测试通过,P0 未确认→P1 行为不变
**Covers**: R4.AC3
