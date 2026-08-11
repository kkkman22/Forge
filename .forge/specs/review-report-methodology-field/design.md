---
feature: review-report-methodology-field
layout: design
created: 2026-05-17
---

# Design Document — review-report-methodology-field

## Overview

给 `ReviewReportSchema` 加一个枚举字段 `methodology`，覆盖 zod path + legacy path，确保旧报告零回归。改动隔离在 4 个文件：1 个 schema、1 个 state parser、1 个 SKILL 文档、1 个测试套件。零行为变更（消费方仍按原逻辑工作），仅给后续 spec 提供语义信号。

## Architecture

### 数据流

```
review 报告 frontmatter
        │
        ▼
  parseReviewReportGraceful(content)
        │
        ├─ FORGE_USE_ZOD_PARSER=1 → parseReviewReportViaSchema → safeParseReviewReport (zod)
        └─ default → parseReviewReportLegacy
        │
        ▼
  ReviewReportFields {
    ... 现有字段,
    methodology: "subagent-parallel" | ...,  ← 新增
  }
        │
        ▼
  消费方 (ship gate / canvas / learn)
```

### 反向兼容矩阵

| 调用方 | 受影响 | 改动 |
|---|---|---|
| `src/state.ts` parser | 是 | 增加字段，默认值，不抛错 |
| `src/schemas/review-report.ts` schema | 是 | 增加可选枚举字段 |
| `src/ship.ts` checkShipGate | 否 | 仍按 result 字段判断；unavailable 通过 result=blocked 间接生效 |
| `src/review.ts` mergeReviewResults | 是 | 调用 frontmatter 序列化时传默认值 |
| `src/learn.ts` SessionPhaseHistory | 否 | 不消费 methodology |
| `src/canvas-renderer.ts` | 否 | 不消费 methodology（后续可选增强）|

## Components and Interfaces

### 1. `src/schemas/review-report.ts`

新增 schema：

```typescript
export const MethodologySchema = z.enum([
  "subagent-parallel",
  "subagent-serial",
  "ci-evidence",
  "unavailable",
]);

export type Methodology = z.infer<typeof MethodologySchema>;

export const ReviewReportSchema = z
  .object({
    result: ReviewResultSchema.optional(),
    reviewed_at_commit: z.string().min(1).optional(),
    p0_count: SeverityCountSchema.optional(),
    p1_count: SeverityCountSchema.optional(),
    p2_count: SeverityCountSchema.optional(),
    p3_count: SeverityCountSchema.optional(),
    methodology: MethodologySchema.optional(),  // ← 新增
  })
  .passthrough();

const FIELD_SCHEMAS: Record<string, z.ZodTypeAny> = {
  result: ReviewResultSchema,
  reviewed_at_commit: z.string().min(1),
  p0_count: SeverityCountSchema,
  p1_count: SeverityCountSchema,
  p2_count: SeverityCountSchema,
  p3_count: SeverityCountSchema,
  methodology: MethodologySchema,
};
```

修改 `safeParseReviewReport`：

1. 字段缺失 → 默认填 `"subagent-parallel"`
2. 字段值不在枚举 → 降级 + 追加 errors
3. 字段值为 `"unavailable"` 且 `result !== "blocked"` → 强制 result = "blocked" + errors

```typescript
export function safeParseReviewReport(raw: unknown): SafeParseReviewResult {
  const result = ReviewReportSchema.safeParse(raw);
  const value: Partial<ReviewReport> = result.success ? { ...result.data } : {};
  const errors: string[] = [];

  if (!result.success) {
    for (const [field, schema] of Object.entries(FIELD_SCHEMAS)) {
      if (raw && typeof raw === "object" && field in raw) {
        const fieldResult = schema.safeParse((raw as Record<string, unknown>)[field]);
        if (fieldResult.success) {
          (value as Record<string, unknown>)[field] = fieldResult.data;
        } else if (field === "methodology") {
          (value as Record<string, unknown>).methodology = "subagent-parallel";
          errors.push(`methodology field invalid: ${JSON.stringify((raw as Record<string, unknown>)[field])}`);
        } else {
          errors.push(`${field}: ${fieldResult.error.issues[0]?.message ?? "invalid"}`);
        }
      }
    }
  }

  if (value.methodology === undefined) {
    value.methodology = "subagent-parallel";
  }

  if (value.methodology === "unavailable" && value.result !== "blocked") {
    errors.push(`methodology=unavailable forces result=blocked (was ${JSON.stringify(value.result ?? null)})`);
    value.result = "blocked";
  }

  return { valid: errors.length === 0, value, errors };
}
```

### 2. `src/state.ts` legacy path 同步

`parseReviewReportLegacy` 增加 `methodology` 字段解析（不引 zod）：

```typescript
function parseReviewReportLegacy(content: string | undefined): {
  parsed: ReviewReportFields;
  warnings: string[];
} {
  // 现有解析逻辑 ...
  const methodologyMatch = content?.match(/^methodology:\s*(.+)$/m);
  const methodologyRaw = methodologyMatch?.[1]?.trim();
  const VALID: Methodology[] = ["subagent-parallel", "subagent-serial", "ci-evidence", "unavailable"];
  const methodology: Methodology = (
    methodologyRaw && VALID.includes(methodologyRaw as Methodology)
      ? (methodologyRaw as Methodology)
      : "subagent-parallel"
  );

  if (methodologyRaw && !VALID.includes(methodologyRaw as Methodology)) {
    warnings.push(`methodology field invalid: ${methodologyRaw}`);
  }

  let finalResult = parsedResult;
  if (methodology === "unavailable" && finalResult !== "blocked") {
    warnings.push(`methodology=unavailable forces result=blocked`);
    finalResult = "blocked";
  }

  return { parsed: { ...existing, methodology }, warnings };
}
```

### 3. `src/review.ts` 报告生成器

frontmatter 序列化逻辑增加：

```typescript
function buildReviewFrontmatter(
  topic: string,
  date: string,
  result: string,
  commit: string,
  counts: SeverityCounts,
  layers: string[],
  methodology: Methodology = "subagent-parallel",  // ← 新增
): string {
  return `---
topic: ${topic}
date: ${date}
result: ${result}
reviewed_at_commit: ${commit}
p0_count: ${counts.p0}
p1_count: ${counts.p1}
p2_count: ${counts.p2}
p3_count: ${counts.p3}
methodology: ${methodology}
layers:
${layers.map(l => `  - ${l}`).join("\n")}
---
`;
}
```

调用方传 `subagent-parallel`（默认）。后续 spec `review-no-mainagent-fallback` 修改调用方传其他值。

### 4. SKILL 文档

`skills/forge/lib/review/references/review-report-format.md` 增加段落：

```markdown
## Frontmatter Schema

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| topic | string | ✓ | review topic / spec name |
| date | YYYY-MM-DD | ✓ | review 执行日期 |
| result | string | ✓ | `passed` / `blocked` / `incomplete` |
| reviewed_at_commit | sha | ✓ | review 时的 HEAD |
| p0_count..p3_count | non-negative int | ✓ | 各 severity finding 数 |
| layers | string[] | ✓ | 实际启动的 review layer |
| methodology | enum | 否 | 评审产出路径，缺省 `subagent-parallel` |

### methodology 字段语义

| 值 | 含义 |
|---|---|
| `subagent-parallel` | 默认。三个 subagent 并行/滚动窗口产出 |
| `subagent-serial` | 降级。`FORGE_REVIEW_CONCURRENCY=1` 时使用 |
| `ci-evidence` | CI ultrareview 异步覆盖路径 |
| `unavailable` | 所有 subagent 路径不可用、CI 也无覆盖。**parser 强制 result=blocked** |
```

`dist-plugin/skills/forge/lib/review/references/review-report-format.md` 通过 `node scripts/sync-dist-plugin.mjs` 镜像。

## Data Models

### 新增类型

```typescript
// src/schemas/review-report.ts
export type Methodology =
  | "subagent-parallel"
  | "subagent-serial"
  | "ci-evidence"
  | "unavailable";

// 默认值约定
export const METHODOLOGY_DEFAULT: Methodology = "subagent-parallel";

// src/state.ts ReviewReportFields 接口扩展
export interface ReviewReportFields {
  result: string;
  reviewed_at_commit: string | null;
  p0_count: number | null;
  p1_count: number | null;
  p2_count: number | null;
  p3_count: number | null;
  methodology: Methodology;  // ← 新增，默认 subagent-parallel
}
```

### Frontmatter 实例（各 methodology 值）

```yaml
# subagent-parallel (默认/常见)
---
topic: my-feature
methodology: subagent-parallel
result: passed
...
---

# subagent-serial (降级路径)
---
methodology: subagent-serial
retry_count: 1   # 由后续 spec 引入
...
---

# ci-evidence (CI 路径)
---
methodology: ci-evidence
...
---

# unavailable (阻断 fail-safe)
---
methodology: unavailable
result: blocked    # 强制
failure_reason: "subagent paths exhausted"  # 由后续 spec 引入
...
---
```

## Correctness Properties

### Property 1: Legacy and Zod Path Agreement

legacy path + zod path 对同一份输入返回 `methodology` 字段值相等。

**Validates: Requirements 2.1, 2.2, 2.3**

### Property 2: Missing Field Defaults Silently

任何缺 `methodology` 的报告 → 默认 `subagent-parallel`，零警告。

**Validates: Requirements 1.2, 2.1**

### Property 3: Invalid Value Degrades Gracefully

任何非枚举值 → 默认 + warning，**不抛错**。

**Validates: Requirements 1.3**

### Property 4: Unavailable Forces Blocked

`methodology=unavailable` ⇒ `result === "blocked"`（解析后断言不变量）。

**Validates: Requirements 1.4**

## Error Handling

| 场景 | legacy path | zod path |
|---|---|---|
| 字段缺失 | 默认 subagent-parallel，无 warning | 默认 + 无 errors |
| 值非枚举 | 默认 + warning（`field invalid`）| 默认 + errors（`field invalid`）|
| 值为 unavailable + result=passed | result 改 blocked + warning（`forces result=blocked`）| result 改 blocked + errors |
| YAML 完全损坏 | 走现有 graceful fallback | 走现有 safeParse fallback |

### 回滚

| 风险 | 回滚动作 |
|---|---|
| schema 解析回归 | revert `src/schemas/review-report.ts` + `src/state.ts`，旧报告继续按无字段解析 |
| 默认值导致语义混淆 | 在文档中补强说明（不需要代码回滚）|
| 报告生成器写入失败 | revert `src/review.ts` 的 frontmatter 序列化改动，字段仍可由消费方填默认 |

## Testing Strategy

| 测试 | 类型 | 关键断言 |
|---|---|---|
| `review-report-methodology.test.ts` | unit (zod path) | 4 个枚举值全 accept、缺失默认、非法降级、unavailable 强制 blocked |
| `parse-review-report-legacy.test.ts` 增量 | unit (legacy path) | 旧 fixture 默认填 subagent-parallel、新 fixture 解析正确 |
| `parse-review-report-zod.test.ts` 增量 | unit (zod path) | 同上 + zod 输出与 legacy 形状一致 |
| `report-frontmatter-write.test.ts` | unit | 生成的 frontmatter 含 `methodology:` 行 |
| Property test | property | 任意输入下 parser 返回 methodology 字段非空、且为合法枚举值 |
