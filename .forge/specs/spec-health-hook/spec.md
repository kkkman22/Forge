---
status: locked
contract_legacy: true
created: "2026-05-14"
topic: spec-health-hook
---

# Spec: Spec-health Hook（统一 spec 健康度评估）

## 概述

将散落在 spec/review/accept 中的 spec 健康度检测（spec-leak / scenario-lint / glossary-miss）收口到 `src/spec-health.ts`，提供统一的 `checkSpecHealth(specContent, banned, glossary)` 入口和明确的 `ambiguity_score` 计算。这个 score 是 grill-auto-trigger-and-inline spec 的关键触发信号，本 spec 把"已有逻辑"显式化为可测试的纯函数。

下游 plan / build / debug 启动时调用 hook 自动评估，确保 spec 在生命周期中始终新鲜。

## 动机

`grill-auto-trigger-and-inline` spec 描述："spec self-check 输出 `ambiguity_score >= threshold` → 自动触发 inline grill"——但 `ambiguity_score` 实际**未集中计算**。三个相关纯函数库散落如下：

| 库 | 职责 | 当前调用方 |
|----|------|-----------|
| `src/spec-leak-detector.ts:32` (`detectSpecLeak`) + `:123` (`loadBannedPatterns`) | 检测 spec 中实现细节泄漏（类名/库名/函数名） | forge-spec Step 2 / forge-review Layer 1 |
| `src/scenario-linter.ts:63` (`lintScenarios`) | Gherkin 场景的 SCN001-SCN004 规则检查 | forge-spec Step 2 / forge-accept Step 1 |
| `src/glossary.ts:81` (`Glossary` type) + glossary-consistency-hook spec | 术语漂移检测 | forge-spec Step 7 / 各 phase |

后果：
- 三个独立维度（leak / scenario / glossary）对应三个独立分数，没有统一的"spec 健康度"度量
- grill-auto-trigger 和 forge-debug 都需要"spec 是否仍 healthy"信号，但缺乏统一来源
- forge-plan 启动时不会重新评估 locked spec 的健康度——如果 spec 锁定后实际有问题，plan 阶段才发现已成本高
- forge-build 中途 spec 被修改（解锁 / brownfield delta 调整）时，build 不知道是否需要重新校验

## 核心设计原则

- **零修改三个底层库**：`spec-leak-detector.ts` / `scenario-linter.ts` / `glossary.ts` 接口不动
- **明确量化的 ambiguity_score**：从三维度组合产出 [0, 1] 区间分数，阈值由 config 控制
- **Health Report 是纯函数产物**：`checkSpecHealth` 输入 spec content + 配置 → 输出 SpecHealthReport，无 IO
- **下游 skill 自动消费**：plan/build/debug 启动时调用，根据 score 决定是否阻塞或 advisory
- **不替代 spec self-check**：spec Step 2 仍跑完整 9 项自检，hook 只是把其中三维度的纯函数化输出整合
- **autonomous 模式默认 advisory**：autonomous 不阻塞下游 skill，仅写 advisory；interactive 模式 score 过低时询问用户是否回 spec / grill

## 统一契约

```ts
// src/spec-health.ts （新增）

export type SpecHealthDimension = "leak" | "scenario" | "glossary"

export interface DimensionScore {
  dimension: SpecHealthDimension
  passed: boolean
  errorCount: number
  details: string[]
}

export interface SpecHealthReport {
  /** [0, 1] 综合分数。1 = 完全健康，0 = 多维度严重问题 */
  ambiguityScore: number
  /** 各维度子分数 */
  dimensions: Record<SpecHealthDimension, DimensionScore>
  /** 整体判定（基于 threshold） */
  overallVerdict: "healthy" | "marginal" | "degraded"
  /** 触发建议 */
  recommendations: HealthRecommendation[]
}

export type HealthRecommendation =
  | { kind: "trigger_grill"; reason: string }     // ambiguity_score 低
  | { kind: "rerun_spec_review"; reason: string } // leak 多
  | { kind: "rerun_glossary_check"; reason: string } // glossary miss 多
  | { kind: "no_action"; reason: string }

export interface SpecHealthInput {
  specContent: string
  bannedPatterns: BannedPattern[]    // 来自 spec-leak-detector
  glossary: Glossary
  thresholds: {
    leak_max: number          // 默认 0
    scenario_max: number      // 默认 0
    glossary_miss_max: number // 默认 2
    ambiguity_min: number     // 默认 0.7
  }
}

/** 统一调度入口，纯函数。 */
export function checkSpecHealth(input: SpecHealthInput): SpecHealthReport

/** Score 计算（独立可测）：组合三维度 errorCount → [0, 1] */
export function computeAmbiguityScore(dims: Record<SpecHealthDimension, DimensionScore>): number

/** 渲染 advisory 文本 */
export function renderSpecHealthAdvisory(report: SpecHealthReport): string

/** Verdict 判定（独立可测） */
export function classifyVerdict(score: number, thresholds: SpecHealthInput["thresholds"]): "healthy" | "marginal" | "degraded"
```

## ambiguity_score 计算公式

明确的、可测的公式（PBT 验证）：

```
leak_factor      = max(0, 1 - leak_count / 5)         // 5 个泄漏归零
scenario_factor  = max(0, 1 - scenario_errors / 3)    // 3 个错误归零
glossary_factor  = max(0, 1 - glossary_miss / 5)      // 5 个 miss 归零

ambiguityScore   = 0.4 * leak_factor + 0.3 * scenario_factor + 0.3 * glossary_factor
```

权重设计：
- leak（实现细节泄漏）权重最高（0.4），直接破坏 spec 的"描述行为"原则
- scenario（场景质量）和 glossary（术语一致性）各 0.3

threshold:
- `score >= 0.85` → healthy
- `0.7 <= score < 0.85` → marginal
- `score < 0.7` → degraded

## 接入点矩阵

| Skill | 触发位置 | 行为 |
|-------|----------|------|
| forge-spec | Step 2 Review 完成后 | 计算 score，写入 frontmatter `health: { score, verdict, generated_at }` |
| forge-plan | §1.5 Pre-flight | 读 spec.md frontmatter，verdict=degraded 阻塞（interactive）/advisory（autonomous） |
| forge-build | §1.5 Pre-flight | 同 plan，验证 locked spec 仍 healthy |
| forge-debug | Phase 1 假设生成前 | verdict ≤ marginal 时优先怀疑"问题源于模糊 spec"，可选触发 grill-inline |
| forge-review | 各 Layer 启动前 | verdict=degraded 时 Layer 1 增加 spec re-validation 子项 |
| grill-auto-trigger-and-inline | spec aspect 触发判定 | 直接读 ambiguity_score，对接现有 spec |

## 与 grill-auto-trigger-and-inline 的协同

`grill-auto-trigger-and-inline` spec 中的：

> spec self-check 输出 `ambiguity_score >= threshold` → 自动触发 inline grill

修正为：

> `checkSpecHealth(spec)` 返回 `verdict: "degraded"` 或 `recommendations` 含 `trigger_grill` → 自动触发 inline grill

`HealthRecommendation` 中的 `trigger_grill` 类型直接为 grill-auto-trigger 提供精确触发条件。

## 双模式行为

### Autonomous 模式

| Verdict | 行为 |
|---------|------|
| healthy | 静默通过 |
| marginal | 写 advisory 到 `.forge/findings/spec-health-advisory-<topic>.md`，下游 skill 继续 |
| degraded | 同 marginal + spec frontmatter 加 `pending_advisories: ["spec-health-advisory-..."]`，下游 skill 看到此字段时输出明显警告但不阻塞 |

### Interactive 模式

| Verdict | 行为 |
|---------|------|
| healthy | 静默通过 |
| marginal | 输出中文摘要："spec 健康度边缘（score=0.X）。建议在下一阶段前 review 或运行 grill。" |
| degraded | 询问用户：「spec 健康度低（score=0.X）：<top 3 issues>。是否：1) 回 spec 重新审查 2) 触发 grill 澄清 3) 强制继续？」 |

## 频率控制

- spec frontmatter 缓存最近一次 `health` 字段，包含 `generated_at: <ISO>` 和 `spec_hash: <sha256>`
- 下游 skill 启动时：
  - 计算当前 spec content 的 hash
  - 与 frontmatter `spec_hash` 对比
  - 一致 → 复用缓存的 score 和 verdict
  - 不一致 → 重新跑 hook（spec 被修改了）
- 避免每次 plan/build/debug 都重复跑 leak detector + scenario linter（可能 100ms+）

## 文件影响

### 新增

- `src/spec-health.ts` — 调度层（约 250 LoC）
- `test/spec-health.test.ts` — 单元测试覆盖 verdict 分类、recommendation 生成
- `test/spec-health.property.test.ts` — PBT：score 单调性（errorCount 增加 score 单调减）、score 边界（[0, 1]）、维度独立性
- `test/spec-health-cache.test.ts` — frontmatter 缓存机制契约测试
- `test/spec-health-skill-integration.test.ts` — 5 个 skill 接入点的契约测试

### 修改

- `src/index.ts` — barrel 导出
- `skills/forge-spec/SKILL.md` — Step 2 Review 末尾增加"写入 health frontmatter"
- `skills/forge-plan/SKILL.md` — §1.5 Pre-flight 增加 health check
- `skills/forge-build/SKILL.md` — §1.5 同上
- `skills/forge-debug/SKILL.md` — Phase 1 增加 spec health 读取
- `skills/forge-review/SKILL.md` — Layer 1 增加 verdict=degraded 时的子项
- `.forge/specs/grill-auto-trigger-and-inline/spec.md` — 触发条件描述修正为引用 `checkSpecHealth`

### 不变

- `src/spec-leak-detector.ts` 接口零修改
- `src/scenario-linter.ts` 接口零修改
- `src/glossary.ts` 接口零修改
- spec content 的格式约定不变
- forge-spec Step 2 自检的 9 项规则不变（hook 仅整合其中三项的输出）

## 边界与约束

- **不替代 spec Step 2 完整自检**：hook 是 spec self-check 的一个子集（三维度纯函数化整合）
- **不修改 banned-patterns**：banned 加载仍由 spec-leak-detector / pack 决定
- **缓存仅在同一 spec_hash 下复用**：spec content 任何修改（甚至空白字符）都强制重算
- **不做语义级别歧义检测**：score 只反映三个可量化维度，不做 NLP 级歧义分析
- **autonomous 模式 advisory 不替代 spec self-check 必须的中止逻辑**：spec Step 2 自检本身的硬阻断（如有），autonomous 模式下仍按 spec SKILL.md 现行规则
- **不修改 spec 的 status 字段**：spec.status: locked / draft 由 forge-spec / forge-plan 控制，hook 只读

## 验收标准

1. spec content 含 5 个实现细节泄漏 → `leak_factor = 0`，整体 ambiguity_score 衰减至少 0.4
2. 全部三维度满分（无 leak / 无 scenario error / 无 glossary miss）→ ambiguityScore = 1.0，verdict = healthy
3. spec frontmatter 写入 health 字段后再次调用 → 复用缓存，不重跑底层 detector
4. spec content 修改后再次调用 → spec_hash 不一致，重新计算
5. plan 启动 + verdict = degraded + interactive 模式 → 询问用户 3 选项
6. plan 启动 + verdict = degraded + autonomous 模式 → 写 advisory，plan 继续
7. debug Phase 1 + verdict = marginal → recommendation 含 `trigger_grill`，可选触发 grill-inline
8. review Layer 1 + verdict = degraded → 增加"spec re-validation"子项
9. grill-auto-trigger 触发条件改为读 `checkSpecHealth().recommendations` → 行为正确
10. 三维度的现有测试（spec-leak / scenario-linter / glossary）零回归

## 场景

```gherkin
Feature: Spec Health Check

  Scenario: All dimensions clean
    Given spec content has zero leaks, zero scenario errors, zero glossary misses
    When checkSpecHealth is called
    Then ambiguityScore equals 1.0
    And overallVerdict equals "healthy"
    And recommendations contain exactly one "no_action"

  Scenario: Leak saturation drops score
    Given spec content contains 5 banned pattern matches
    And zero scenario errors and zero glossary misses
    When checkSpecHealth is called
    Then leak_factor equals 0
    And ambiguityScore drops by at least 0.4

  Scenario: Cache hit on unchanged spec
    Given spec frontmatter has health field with spec_hash matching current content
    When checkSpecHealth is called
    Then cached score is reused without re-running detectors

  Scenario: Cache miss on modified spec
    Given spec frontmatter has health field with spec_hash NOT matching current content
    When checkSpecHealth is called
    Then all three detectors are re-invoked and new score is written

  Scenario: Degraded verdict in interactive mode
    Given ambiguityScore below 0.7
    And mode is "interactive"
    When plan phase starts
    Then user is prompted with 3 options: return to spec, trigger grill, force continue

  Scenario: Degraded verdict in autonomous mode
    Given ambiguityScore below 0.7
    And mode is "autonomous"
    When plan phase starts
    Then advisory is written to findings/
    And plan continues without blocking

  Scenario: Marginal verdict triggers grill recommendation
    Given ambiguityScore between 0.7 and 0.85
    When debug Phase 1 starts
    Then recommendations include { kind: "trigger_grill" }

  Scenario: Degraded verdict adds review sub-item
    Given overallVerdict is "degraded"
    When review Layer 1 starts
    Then spec re-validation sub-item is added to review checklist
```

## Reversibility

- **回滚**：删除 `src/spec-health.ts` + 测试文件，还原 `src/index.ts` barrel 导出，还原 5 个 SKILL.md diff
- **挂载点**：所有下游 skill 接入点都是"读取 spec frontmatter health 字段"的加法操作，不修改现有控制流——移除接入代码即恢复原行为
- **数据残留**：spec frontmatter 中的 `health` 字段为附加元数据，删除不影响 spec 自身 `status`/`topic` 字段

## 风险与缓解（反模式对照）

| 反模式 | 是否风险 | 缓解 |
|--------|----------|------|
| 过度抽象 | 低 | 输入已归一化（SpecHealthInput），三个底层库接口零修改，hook 是薄调度层 |
| 触发链过长 | 中 | hook 不自动触发其他 hook；grill-auto-trigger 读 recommendation 是单步判定，非链式；已有 `alreadyTriggered` 防循环 |
| 状态管理复杂度 | 低 | 不引入新 status.md 字段；缓存存储在 spec frontmatter（语义归属位置），不增加全局状态 |
| autonomous 硬阻塞 | 否 | 双模式行为明确：autonomous 写 advisory 不阻塞；degraded 也仅 advisory + 警告，不 abort |
| 时间型缓存 | 否 | 使用 spec_hash（sha256 内容哈希）作缓存 key，非 TTL；spec 任意修改强制重算 |
| 权重设计主观 | 低 | 权重和 threshold 由 `.forge/config.md` 可配置，PBT 仅验证不变量 |
| degraded 阻塞频率过高 | 低 | 阈值默认偏宽松（ambiguity_min: 0.7），用户可在 config 调整 |
| 多 skill 并行重复计算 | 低 | 缓存机制（spec_hash 比对），首次写入 frontmatter 后复用 |

## 实施顺序

1. **基础调度层**：实现 `src/spec-health.ts` + score 计算 + verdict 分类 + 单元测试 + PBT
2. **Spec 接入**：Step 2 末尾写入 frontmatter health 字段
3. **缓存机制**：实现 spec_hash 计算 + frontmatter 读写
4. **Plan / Build 接入**：高风险阶段先接入，验证阻塞与 advisory 路径
5. **Debug 接入**：Phase 1 读取，提供"问题源于 spec"假设来源
6. **Review 接入**：Layer 1 子项联动
7. **Grill-auto-trigger 对接**：把现有 spec 中描述的"ambiguity_score >= threshold"修改为引用 `checkSpecHealth` 的 recommendation
8. **文档对齐**：5 个 SKILL.md 同步更新；grill-auto-trigger spec 修订
