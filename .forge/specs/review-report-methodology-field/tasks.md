---
feature: review-report-methodology-field
layout: tasks
created: 2026-05-17
spec_ref: ".forge/specs/review-report-methodology-field/requirements.md"
---

# Implementation Plan: review-report-methodology-field

## Overview

Tier: Standard | Branch: `feature/review-report-methodology-field` | 依赖: 无（与 `review-subagent-concurrency` 完全并行）

给 review 报告 schema 增加 `methodology` 字段（4 个枚举值），覆盖 zod path + legacy path，确保旧报告零回归。后续 `review-no-mainagent-fallback` spec 消费此字段实现 fail-safe 阻断。

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"], "description": "RED: zod schema tests" },
    { "wave": 2, "tasks": ["2"], "description": "GREEN: zod schema impl" },
    { "wave": 3, "tasks": ["3"], "description": "RED: legacy parser tests" },
    { "wave": 4, "tasks": ["4"], "description": "GREEN: legacy parser impl" },
    { "wave": 5, "tasks": ["5"], "description": "RED: report writer tests" },
    { "wave": 6, "tasks": ["6"], "description": "GREEN: report writer impl" },
    { "wave": 7, "tasks": ["7"], "description": "SKILL docs + dist-plugin sync" },
    { "wave": 8, "tasks": ["8"], "description": "Property tests" },
    { "wave": 9, "tasks": ["9"], "description": "Final validation" }
  ]
}
```

## Tasks

- [x] 1. RED — zod schema 单元测试
  - Files: Create `test/schemas/review-report-methodology.test.ts`
  - 测试用例：
    - `ReviewReportSchema accepts all 4 methodology values`
    - `ReviewReportSchema rejects invalid methodology` (e.g. `"foo"`, `""`, `null`)
    - `parser fills default subagent-parallel when methodology absent`
    - `invalid methodology degrades with errors[] entry`
    - `unavailable forces result=blocked even when frontmatter says passed`
    - `unavailable + result=blocked passes without forcing warning`
  - Verify-By: vitest
  - Evidence: 6 fail (RED)
  - 对应需求: R1.AC1, R1.AC2, R1.AC3, R1.AC4
  - Commit: `test(schema): add methodology field tests for zod path`

- [x] 2. GREEN — zod schema 实现
  - Files: Modify `src/schemas/review-report.ts`、`src/index.ts`
  - 实现要点：见 design.md §1
  - Verify-By: vitest
  - Evidence: 6 pass (GREEN)；现有 `test/schemas/review-report.test.ts` 全绿
  - 对应需求: R1.AC1, R1.AC2, R1.AC3, R1.AC4
  - Commit: `feat(schema): add methodology enum field to ReviewReportSchema`

- [x] 3. RED — legacy parser 测试
  - Files: Modify `test/state/parse-review-report-legacy.test.ts`
  - 测试用例：
    - `legacy path fills methodology default for old reports without field` (fixture: `.forge/reviews/atomic-task-depends-on-utilization.md`)
    - `legacy path parses subagent-serial`
    - `legacy path degrades invalid methodology to default with warning`
    - `legacy path forces result=blocked when methodology=unavailable`
  - Verify-By: vitest
  - Evidence: 4 新测试 fail (RED)
  - 对应需求: R2.AC1, R2.AC2
  - Commit: `test(state): add methodology field parsing for legacy path`

- [x] 4. GREEN — legacy parser 实现
  - Files: Modify `src/state.ts`、`src/index.ts`
  - 实现要点：见 design.md §2
  - Verify-By: vitest
  - Evidence: 4 pass + 现有测试零回归
  - 对应需求: R2.AC1, R2.AC2, R2.AC3
  - Commit: `feat(state): parse methodology field in legacy and zod paths`

- [x] 5. RED — 报告生成器测试
  - Files: Create or modify `test/review/report-frontmatter-write.test.ts`
  - 测试用例：
    - `frontmatter includes methodology field with default subagent-parallel`
    - `frontmatter accepts custom methodology argument`
  - Verify-By: vitest
  - Evidence: 2 fail (RED)
  - 对应需求: R2.AC4
  - Commit: `test(review): add frontmatter generation tests for methodology field`

- [x] 6. GREEN — 报告生成器实现
  - Files: Modify `src/review.ts`
  - 实现要点：见 design.md §3
  - Verify-By: vitest
  - Evidence: 2 pass + 现有 review 测试零回归
  - 对应需求: R2.AC4
  - Commit: `feat(review): write methodology field into report frontmatter`

- [x] 7. SKILL 文档 + dist-plugin 同步
  - Files: Modify `skills/forge/lib/review/references/review-report-format.md`；Run `node scripts/sync-dist-plugin.mjs`
  - 格式：见 design.md §4
  - Verify-By: bash
  - Evidence: `grep "methodology"` 返回至少 4 个匹配；`diff source dist-plugin` 退出 0
  - 对应需求: R3.AC1, R3.AC2, R3.AC3
  - Commit: `docs(review): document methodology field semantics`

- [x] 8. Property Test 完整性
  - Files: Create `test/schemas/review-report-methodology.property.test.ts`
  - 属性：
    - `parser always returns valid methodology enum value`
    - `unavailable invariant`：含 unavailable 输入 → result === "blocked"
    - `legacy and zod paths agree`
  - Verify-By: vitest
  - Evidence: 3 property pass (200 runs each)
  - 对应需求: R1.AC2, R1.AC3, R1.AC4, R2.AC3
  - Commit: `test(schema): add property tests for methodology parsing invariants`

- [x] 9. Final Validation
  - 执行：
    - `npm run check` → 全绿
    - `npx vitest run` → 全绿
    - `node scripts/check-registry-parity.sh` → 退出 0
    - 手工 smoke：解析现有无 methodology 字段的 review 报告 → methodology=subagent-parallel；构造 unavailable fixture → result=blocked
  - Verify-By: bash
  - Evidence: 所有命令退出 0
  - 对应需求: 全部
  - Commit: `chore(review): final validation for methodology field`

## Notes

### Out of Scope

- ship gate 对 methodology 的特殊处理（unavailable 已通过 result=blocked 间接生效）
- 自动重跑机制 → `review-no-mainagent-fallback`
- 历史报告批量 backfill（默认值即可）
- canvas 渲染区分 methodology

### Risk Register

| 风险 | 缓解 |
|---|---|
| schema 改动破坏旧报告 | T3+T4 用真实历史 fixture 测试；T8 property test 200 runs 覆盖随机输入 |
| zod path 与 legacy path 输出不一致 | T8 property test `legacy and zod paths agree` |
| 文档/示例不同步 | T7 显式 grep + diff 验证 |
| 默认值掩盖真实问题 | parser 在非法值时**仍**记录 errors/warnings |

### Property Tests Warning

Task 8 包含 fast-check 属性测试。
