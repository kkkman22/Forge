---
status: completed
feature: review-report-methodology-field
layout: requirements
created: 2026-05-17
tier: standard
---
# Requirements Document

## Introduction

`/forge review` 当前的 review 报告 frontmatter（`src/schemas/review-report.ts` 定义）包含 `topic / date / result / reviewed_at_commit / p0_count / p1_count / p2_count / p3_count / layers` 字段，但**没有字段记录"评审是怎么跑出来的"**。本次 SDK 抽风后（详见 `.forge/findings/agent-sdk-task-id-purge-2.1.143.md`），主 Agent 在三个 subagent 全部失败后接管直接评审，但报告 frontmatter 还是写着标准的 `result: blocked` + 三层 `layers`，**消费方（ship gate / canvas / learn）无从分辨**这份报告是 subagent 产出的、还是主 Agent 自评的、还是 CI 异步覆盖的。

本 spec 给报告 schema 加一个 `methodology` 字段，记录评审产出路径，配合后续 spec `review-no-mainagent-fallback` 的 fallback ladder 使用。本 spec 不引入新规则，只让消费方"看得见"路径差异。

### 设计原则

- **向后兼容**：旧报告（无 `methodology` 字段）默认按 `subagent-parallel` 解析，所有现有 ship gate / parser 测试零回归。
- **枚举闭集**：值受 schema 限定（4 个枚举值），消费方写 switch 时 TypeScript 强制完备。
- **消费侧零强制**：本 spec 只加字段，不改 ship gate 行为；行为变更由 `review-no-mainagent-fallback` 决定。

### 显式不在范围内（Out of Scope）

- ship gate 对 `methodology: unavailable` 的强制阻断 → `review-no-mainagent-fallback`
- 自动重跑机制 → `review-no-mainagent-fallback`
- 历史报告批量 backfill → 不做（旧报告默认值即可）
- canvas 渲染区分 methodology → 后续可选增强，不在本 spec

## Glossary

- **Methodology**：本次 review 报告的产出路径，4 个互斥枚举值之一。
- **subagent-parallel**：默认路径。三个 subagent 并行（或滚动窗口）跑出报告，与 Forge 设计预期一致。
- **subagent-serial**：降级路径。`review-subagent-concurrency` spec 引入 concurrency=1 时使用，subagent 一个接一个跑。
- **ci-evidence**：CI ultrareview 异步覆盖路径。`.forge/reviews/<pr>-ci.md` 存在且被本次 review 消费。
- **unavailable**：所有 subagent 路径全部不可用，且没有 CI 覆盖。该值禁止在合法 review 报告中出现，由后续 spec `review-no-mainagent-fallback` 用作 fail-safe 标记。

## Requirements

### Requirement 1: schema 字段定义

**User Story:** 作为 review 报告消费方（ship gate / canvas / learn），我希望从 frontmatter 一眼分辨这份报告是怎么产出的，这样能针对不同路径采取不同策略（例如 unavailable 时阻断 ship、ci-evidence 时跳过本地重测）。

#### Acceptance Criteria

1. WHEN `src/schemas/review-report.ts` 的 `ReviewReportSchema` 被引用 THEN schema SHALL 包含 `methodology` 字段，类型为枚举，可选值精确等于 `["subagent-parallel", "subagent-serial", "ci-evidence", "unavailable"]`。
2. WHEN review 报告 frontmatter **缺少** `methodology` 字段 THEN parser SHALL 默认填充 `subagent-parallel`，**禁止**抛错或 reject 整份报告。
3. WHEN review 报告 frontmatter `methodology` 值不在枚举内（如 `methodology: foo` / `methodology: ""` / `methodology: null`）THEN parser SHALL 把该字段降级为 `subagent-parallel` 并在返回的 `errors[]` 中追加 `methodology field invalid: <raw value>`，**禁止**抛错。
4. WHEN review 报告 frontmatter `methodology: unavailable` THEN parser SHALL 强制把 `result` 字段视为 `blocked`（即使 frontmatter `result` 为其他值），并在 `errors[]` 中追加 `methodology=unavailable forces result=blocked`。

### Requirement 2: parser 兼容老报告

**User Story:** 作为现有 review 报告（已写入 `.forge/reviews/` 的几十份历史报告）的读者，我希望 schema 升级不破坏旧报告解析，这样不需要批量 backfill。

#### Acceptance Criteria

1. WHEN parser 解析任意一份现有 `.forge/reviews/*.md` 文件（commit `d1ee44b` 之前生成，frontmatter 无 `methodology`）THEN parser SHALL 返回 `valid` 解析结果，`methodology` 字段值为 `subagent-parallel`。
2. WHEN `parseReviewReportLegacy`（非 zod 路径）解析旧报告 THEN 返回的 `parsed` 对象 SHALL 包含 `methodology: "subagent-parallel"` 默认值。
3. WHEN `parseReviewReportViaSchema`（zod 路径，`FORGE_USE_ZOD_PARSER=1`）解析旧报告 THEN 返回的 `parsed` 对象 SHALL 与 legacy path 输出形状一致（含 `methodology` 默认值）。
4. WHEN review 报告生成器（如 `src/review.ts` 中的 frontmatter 序列化逻辑）写入新报告 THEN 报告 frontmatter SHALL 显式包含 `methodology` 字段（默认 `subagent-parallel`），便于人工查阅。

### Requirement 3: 文档与示例同步

**User Story:** 作为 SKILL 维护者，我希望文档和示例报告显式说明 methodology 字段的语义，这样后续 reviewer / 调试人员能快速理解。

#### Acceptance Criteria

1. WHEN `skills/forge/lib/review/references/review-report-format.md` 描述 frontmatter schema THEN 文档 SHALL 包含 `methodology` 字段说明、4 个枚举值含义、缺省值约定。
2. WHEN `dist-plugin/skills/forge/lib/review/references/review-report-format.md` 存在 THEN 镜像内容 SHALL 与 source 一致。
3. WHEN 任意 review 报告示例（如 `skills/forge/lib/review/references/` 内的 example fragment）展示 frontmatter THEN 示例 SHALL 包含 `methodology` 字段。

## Validation Contract

### VAL-R1-001: schema 包含 methodology 字段

**Verify-By**: `vitest`
**Evidence**: `test/schemas/review-report-methodology.test.ts` 测试 `ReviewReportSchema accepts all 4 methodology values` 通过；断言 schema parse 4 个枚举值全部 success
**Covers**: R1.AC1

### VAL-R1-002: 缺失字段默认 subagent-parallel

**Verify-By**: `vitest`
**Evidence**: `test/schemas/review-report-methodology.test.ts` 测试 `parser fills default subagent-parallel when methodology absent` 通过
**Covers**: R1.AC2

### VAL-R1-003: 非法值降级 + errors[]

**Verify-By**: `vitest`
**Evidence**: `test/schemas/review-report-methodology.test.ts` 测试 `invalid methodology degrades with errors[] entry` 通过；断言 errors 数组包含 `methodology field invalid` 子串
**Covers**: R1.AC3

### VAL-R1-004: unavailable 强制 result=blocked

**Verify-By**: `vitest`
**Evidence**: `test/schemas/review-report-methodology.test.ts` 测试 `unavailable forces result=blocked even when frontmatter says passed` 通过；断言 parsed.result === "blocked"、errors 包含 `methodology=unavailable forces`
**Covers**: R1.AC4

### VAL-R2-001: 旧报告解析 (legacy path)

**Verify-By**: `vitest`
**Evidence**: `test/state/parse-review-report-legacy.test.ts` 新增 case `legacy path fills methodology default for old reports` 通过；测试 fixture 使用 `.forge/reviews/atomic-task-depends-on-utilization.md`
**Covers**: R2.AC1, R2.AC2

### VAL-R2-002: 旧报告解析 (zod path)

**Verify-By**: `vitest`
**Evidence**: `test/state/parse-review-report-zod.test.ts` 新增 case `zod path output matches legacy shape including methodology default` 通过
**Covers**: R2.AC3

### VAL-R2-003: 报告生成器写入字段

**Verify-By**: `vitest`
**Evidence**: `test/review/report-frontmatter-write.test.ts` 测试 `frontmatter includes methodology field` 通过；断言生成的 frontmatter YAML 含 `methodology:` 行
**Covers**: R2.AC4

### VAL-R3-001: 文档同步

**Verify-By**: `bash`
**Evidence**: `grep "methodology" skills/forge/lib/review/references/review-report-format.md` 非空；4 个枚举值在文档中各出现至少 1 次
**Covers**: R3.AC1

### VAL-R3-002: dist-plugin 镜像

**Verify-By**: `bash`
**Evidence**: `diff skills/forge/lib/review/references/review-report-format.md dist-plugin/skills/forge/lib/review/references/review-report-format.md` 退出 0
**Covers**: R3.AC2
