---
topic: "plan-document-streamlining"
spec_ref: ".kiro/specs/plan-document-streamlining"
status: "approved"
created: "2026-04-29"
format: "full"
---

# Plan: Plan Document Streamlining

## Objective

引入 Lightweight Task 格式，重新定义 Spec 与 Plan 的职责边界。Plan 只补充 File Mapping、Task Dependency Graph、Spec Coverage Matrix，具体代码留给 build 阶段按 TDD 编写。保持向后兼容，通过 `format` frontmatter 字段区分新旧格式。

## Scope

- `src/plan.ts` — 新增 LightweightTask 类型、validation 函数、format detection
- `test/plan.property.test.ts` — 新增 6 个 property-based test
- `src/index.ts` — 导出新类型和函数
- `skills/forge-plan/SKILL.md` — 文档化 lightweight format 生成流程
- `skills/forge-build/SKILL.md` — 文档化 lightweight plan 消费流程

**不涉及**：`frontmatter.ts`、`task-graph.ts`、现有 `AtomicTask` 验证逻辑。

## Tasks

### Task 1: Add LightweightTask types and format detection to plan.ts

- [ ] 1.1 Add `PlanFormat`, `LightweightTask`, `DesignReferenceEntry`, `DesignReferenceValidation` type definitions
- [ ] 1.2 Implement `detectPlanFormat(frontmatter: string): PlanFormat` using `extractStringField`
- [ ] 1.3 Unit tests for `detectPlanFormat`

**Commit**: `feat(plan): add LightweightTask types and format detection`

### Task 2: Implement heading anchor extraction

- [ ] 2.1 Implement `extractHeadingAnchors(markdownContent: string): string[]`
- [ ] 2.2 Property test for Property 2 (heading anchor extraction preserves heading identity)
- [ ] 2.3 Unit tests for edge cases (special characters, CJK, empty content, inline code)

**Commit**: `feat(plan): implement heading anchor extraction`

### Task 3: Implement LightweightTask validation

- [ ] 3.1 Implement `validateLightweightTask(task: LightweightTask): { valid: boolean; errors: string[] }`
- [ ] 3.2 Implement `validateLightweightPlan(tasks: LightweightTask[]): boolean`
- [ ] 3.3 Property tests for Properties 1, 5, 6

**Commit**: `feat(plan): implement LightweightTask validation`

### Task 4: Implement Design Reference validation

- [ ] 4.1 Implement `validateDesignReferences(references: string[], designContent: string): DesignReferenceValidation`
- [ ] 4.2 Property test for Property 3
- [ ] 4.3 Unit tests for edge cases

**Commit**: `feat(plan): implement Design Reference validation`

### Task 5: Implement unified plan validation dispatcher

- [ ] 5.1 Implement `validatePlan(frontmatter, tasks, designContent?)` dispatcher
- [ ] 5.2 Property test for Property 4
- [ ] 5.3 Unit tests for routing
- [ ] 5.4 Verify backward compatibility

**Commit**: `feat(plan): add unified validation dispatcher`

### Task 6: Update exports and barrel file

- [ ] 6.1 Export all new types and functions from `src/plan.ts`
- [ ] 6.2 Update barrel file `src/index.ts`
- [ ] 6.3 Run full test suite and lint

**Commit**: `feat(plan): export new types and functions`

### Task 7: Update forge-plan SKILL.md for lightweight format

- [ ] 7.1 Add Lightweight Task format section to §3
- [ ] 7.2 Update §2 Step 3 for lightweight task generation
- [ ] 7.3 Update §4 Self-Check rules
- [ ] 7.4 Update §7 Plan Document Format
- [ ] 7.5 Add fallback behavior description

**Commit**: `docs(plan-skill): add lightweight format documentation`

### Task 8: Update forge-build SKILL.md for consuming lightweight plans

- [ ] 8.1 Update §3.2 for Design Reference consumption
- [ ] 8.2 Update Subagent instruction construction
- [ ] 8.3 Add TDD guidance for lightweight tasks
- [ ] 8.4 Ensure §2 gate logic supports both formats

**Commit**: `docs(build-skill): add lightweight plan consumption guide`

## Notes

- TDD 强制：Tasks 1-5 遵循 RED→GREEN→REFACTOR，先写失败测试再写实现
- 向后兼容铁律：不修改现有 `validateAtomicTask`、`validatePlanTasks`、`validateDependencies`
- SKILL.md 更新（Tasks 7-8）是文档变更，不涉及 TypeScript 代码
