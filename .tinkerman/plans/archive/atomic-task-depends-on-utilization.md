---
topic: "atomic-task-depends-on-utilization"
status: "approved"
monolith_acknowledged: true
date: "2026-05-15"
spec_ref: ".tinkerman/specs/atomic-task-depends-on-utilization/spec.md"
format: "full"
---

# Plan: AtomicTask dependsOn 字段利用与 plan 拆解逻辑增强

## Objective

验证 spec 全部交付物已实现且测试通过。Spec 中所有"修改"和"新增"文件已存在代码库中，覆盖全部 9 条验收标准。本 plan 为验证计划，不新增生产代码。

## Research Findings

- `toTaskGraph()` 已存在于 `src/plan.ts:94-103`
- `validateDependencies`、`detectCycleInTasks`、`validateTopologicalOrder` 已存在于 `src/plan.ts`
- `validateGraph`、`topologicalOrder` 纯函数已存在于 `src/task-graph.ts`
- SKILL.md Step 3.5 依赖识别 + Step 4 图校验 + dependency-rules.md 已到位
- Build §3.2 和 Review Layer 2 的 dependsOn 消费文本已到位
- 7 个测试文件 (24 tests) 覆盖全部 spec 验收标准
- 全量测试: 409 files / 5420 tests / 0 failures

## File Mapping

所有文件均为 VERIFY（已存在，无修改）：

| File Path | Status |
|---------|------|
| `src/plan.ts` | `toTaskGraph()` + `validateDependencies` + cycle/topo 检查已存在 |
| `src/task-graph.ts` | `validateGraph` + `topologicalOrder` + `getReadyTasks` 已存在 |
| `skills/forge-plan/SKILL.md` | Step 3.5 + Step 4 图校验已到位 |
| `skills/forge-plan/references/atomic-task-format.md` | Depends On 字段已列入 |
| `skills/forge-plan/references/lightweight-task-format.md` | Depends On 字段已列入 |
| `skills/forge-plan/references/dependency-rules.md` | 依赖识别规则文档已存在 |
| `skills/forge-build/SKILL.md` | §3.2 引用 dependsOn 拓扑顺序 |
| `skills/forge-review/SKILL.md` | Layer 2 含 commit 顺序与依赖图检查 |
| `test/plan/depends-on.test.ts` | toTaskGraph 契约测试 (6 tests) |
| `test/plan/graph-validation.test.ts` | 图校验契约测试 (5 tests) |
| `test/plan/depends-on.property.test.ts` | PBT round-trip (5 tests) |
| `test/plan/plan-template-depends.test.ts` | 模板 Depends On (3 tests) |
| `test/plan/build-skill-depends.test.ts` | Build 引用 (1 test) |
| `test/plan/plan-skill-step35.test.ts` | Step 3.5 内容 (4 tests) |
| `test/plan/review-skill-depends.test.ts` | Review Layer 2 (1 test) |

## Task Breakdown

### Task 1: 运行 dependsOn 相关测试确认通过 (2 min)

**Depends On**: []

**Verify**: `npx vitest run test/plan/`
Expected: exit 0

**Commit**: (no changes — verification only)

### Task 2: 运行全量 check 确认零回归 (3 min)

**Depends On**: [1]

**Verify**: `npm run check`
Expected: exit 0

**Commit**: (no changes — verification only)

### Task 3: dist 同步校验 + 最终确认 (2 min)

**Depends On**: [2]

**Verify**: `bash scripts/build-dist.sh`
Expected: exit 0

**Commit**: (no changes unless dist drift detected)

## Spec Coverage

| Spec Acceptance Criteria | Evidence |
|-----------|---------|
| AC1: plan 输出 dependsOn 字段 | SKILL.md Step 3.5 + dependency-rules.md + plan-skill-step35.test.ts |
| AC2: Step 4 调用 validateGraph | SKILL.md Step 4 + graph-validation.test.ts |
| AC3: plan markdown 标注 Depends On | plan-document-format.md + plan-template-depends.test.ts |
| AC4: 旧 plan 仍可解析 | toTaskGraph(undefined → []) + depends-on.test.ts |
| AC5: build 按拓扑顺序执行 | build SKILL.md §3.2 + build-skill-depends.test.ts |
| AC6: review Layer 2 检测 commit 顺序 | review SKILL.md + review-skill-depends.test.ts |
| AC7: PBT round-trip | depends-on.property.test.ts (5 tests) |
| AC8: 零回归 | Task 2 (npm run check — 5420 tests) |
| AC9: spec 全覆盖 | 本表 + 7 个专门测试文件 |
