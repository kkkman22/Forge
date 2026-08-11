---
topic: "ship-gate-commit-verification"
status: "approved"
date: "2026-05-01"
spec_ref: ".kiro/specs/ship-gate-commit-verification"
format: "lightweight"
---

## Objective

在 review 报告中记录评审时的 commit hash（`reviewed_at_commit`），在 ship 门禁中增加 commit 比对步骤，检测 review 后的代码变更。轻量改动：2 个 SKILL.md frontmatter + 2 个 TypeScript 模块 + 属性测试。

## Research Findings

### 来自知识库
- **instincts.md**（confidence: 0.85）：正则 `.test()` 永远用内联正则，不用全局正则——属性测试中尤其重要
- **instincts.md**（confidence: 0.8）：外部命令使用纯函数构建器 + `execFileSync`——`checkReviewFreshness` 是纯函数，不调用外部命令
- **instincts.md**（confidence: 0.7）：安全验证需要多字符序列检查——本任务不涉及用户输入验证

### 来自执行指标
- 历史 Plan 偏差率：会话 1 高(>1.5)，会话 2-3 改善。预估时间保守估算
- `npx vitest run` 成功率 100%（7/7），健康
- `fast-check` 4.7.0 已安装

### 来自代码库分析
- `src/review.ts`：无 `ReviewReportFrontmatter` 类型——需新建。现有类型：`ReviewFinding`、`MergedFinding`、`QualityGateResult`、`ReviewSubagentContext`
- `src/ship.ts`：已有 `checkShipGate` 和 `checkShipGateWithChecklist`。需新增 `checkReviewFreshness` 和 `ReviewFreshnessResult`
- `test/ship.property.test.ts`：已有 Property 11 测试。需新增 freshness 相关属性测试
- `test/contract.test.ts`：存在，需检查是否覆盖 SKILL frontmatter 格式
- `skills/forge-review/SKILL.md` §9 YAML frontmatter 无 `reviewed_at_commit` 字段
- `skills/forge-ship/SKILL.md` §2 Gate Checks 无 Review Freshness 检查

## Design Reference Index

| Anchor | Summary |
|--------|---------|
| `design.md#1-review-报告-frontmatter-更新` | Review 报告 YAML frontmatter 增加 `reviewed_at_commit` 字段 |
| `design.md#2-reviewts-类型更新` | `ReviewReportFrontmatter` 接口增加 optional `reviewed_at_commit` 字段 |
| `design.md#3-shipts-纯函数` | `checkReviewFreshness` 纯函数实现 4 种 case |
| `design.md#4-forge-ship-skillmd-门禁更新` | §2 Gate Checks 增加 Review Freshness Check |
| `design.md#correctness-properties` | Property 1-4 定义 `checkReviewFreshness` 的正确性不变量 |
| `design.md#testing-strategy` | 属性测试 + 单元测试 + 合约测试策略 |

## File Mapping

| File Path | Operation | Description |
|---------|------|------|
| `src/review.ts` | MODIFY | Add `ReviewReportFrontmatter` interface with `reviewed_at_commit` field |
| `src/ship.ts` | MODIFY | Add `ReviewFreshnessResult` interface and `checkReviewFreshness` pure function |
| `test/ship-freshness.property.test.ts` | CREATE | Property-based tests for `checkReviewFreshness` (Properties 1-4) |
| `test/ship-freshness.unit.test.ts` | CREATE | Unit tests for edge cases: empty file list, empty commit hash |
| `skills/forge-review/SKILL.md` | MODIFY | §9 frontmatter template add `reviewed_at_commit`; §10 Step 3 record commit hash |
| `skills/forge-ship/SKILL.md` | MODIFY | §2 add Review Freshness Check subsection |

## Task Breakdown

### Task 1: Add ReviewReportFrontmatter type to review.ts
- **Goal**: Add typed frontmatter interface with optional `reviewed_at_commit` field
- **File**: `src/review.ts`
- **Design Reference**: `design.md#2-reviewts-类型更新` — `ReviewReportFrontmatter` 接口增加 optional `reviewed_at_commit` 字段
- **Property**: N/A (type-only change)
- **Depends On**: (none)
- **Verify**: `npx vitest run`
- **Commit**: `feat(review): add ReviewReportFrontmatter type with reviewed_at_commit`

### Task 2: Implement checkReviewFreshness in ship.ts
- **Goal**: Add pure function implementing 4 cases: undefined→fresh, same→fresh, .tinkerman/ only→fresh, project code→not fresh
- **File**: `src/ship.ts`
- **Design Reference**: `design.md#3-shipts-纯函数` — `checkReviewFreshness` 纯函数和 `ReviewFreshnessResult` 接口
- **Property**: Properties 1-4
- **Depends On**: (none)
- **Verify**: `npx vitest run`
- **Commit**: `feat(ship): add checkReviewFreshness pure function`

### Task 3: Property-based tests for checkReviewFreshness
- **Goal**: Property tests for all 4 correctness properties using fast-check
- **File**: `test/ship-freshness.property.test.ts`
- **Design Reference**: `design.md#testing-strategy` — 属性测试覆盖 Property 1-4
- **Property**: Properties 1-4
- **Depends On**: Task 2
- **Verify**: `npx vitest run test/ship-freshness.property.test.ts`
- **Commit**: `test(ship): add property-based tests for checkReviewFreshness`

### Task 4: Unit tests for edge cases
- **Goal**: Unit tests covering empty file list, empty commit hash, mixed .tinkerman/ and project files
- **File**: `test/ship-freshness.unit.test.ts`
- **Design Reference**: `design.md#testing-strategy` — 单元测试覆盖边界情况
- **Property**: N/A
- **Depends On**: Task 2
- **Verify**: `npx vitest run test/ship-freshness.unit.test.ts`
- **Commit**: `test(ship): add unit tests for checkReviewFreshness edge cases`

### Task 5: Update forge-review SKILL.md frontmatter and execution flow
- **Goal**: Add `reviewed_at_commit` to §9 YAML template; update §10 Step 3 to record `git rev-parse HEAD`
- **File**: `skills/forge-review/SKILL.md`
- **Design Reference**: `design.md#1-review-报告-frontmatter-更新` — frontmatter 增加 `reviewed_at_commit`
- **Property**: N/A
- **Depends On**: Task 1
- **Verify**: `npm run check`
- **Commit**: `docs(review): add reviewed_at_commit to SKILL frontmatter and execution flow`

### Task 6: Update forge-ship SKILL.md gate checks
- **Goal**: Add Review Freshness Check subsection to §2 after Review Gate, with warning format and non-blocking semantics
- **File**: `skills/forge-ship/SKILL.md`
- **Design Reference**: `design.md#4-forge-ship-skillmd-门禁更新` — §2 增加 Review Freshness Check
- **Property**: N/A
- **Depends On**: Task 2
- **Verify**: `npm run check`
- **Commit**: `docs(ship): add Review Freshness Check to gate checks`

## Spec Coverage

| Spec Requirement | Covering Tasks |
|-----------|---------|
| Req 1 AC1: SKILL.md frontmatter includes `reviewed_at_commit` | Task 5 |
| Req 1 AC2: Field populated by `git rev-parse HEAD` | Task 5 |
| Req 1 AC3: `ReviewReportFrontmatter` type in `src/review.ts` | Task 1 |
| Req 2 AC1: Ship SKILL.md §2 includes Review Freshness Check | Task 6 |
| Req 2 AC2: Compare `reviewed_at_commit` with current HEAD | Task 2, Task 6 |
| Req 2 AC3: Same hashes → pass silently | Task 2 |
| Req 2 AC4: Diff only `.tinkerman/` → pass; project code → warning | Task 2, Task 6 |
| Req 2 AC5: Does NOT hard-block ship | Task 6 |
| Req 2 AC6: Missing `reviewed_at_commit` → pass silently (backward compat) | Task 2 |
| Req 3 AC1-AC6: `checkReviewFreshness` pure function with 4 cases | Task 2 |
| Req 3 AC6: Property-based tests | Task 3 |

## Dependency Graph

```
Task 1 ──→ Task 5
Task 2 ──→ Task 3
       ──→ Task 4
       ──→ Task 6
```

Tasks 1 and 2 are independent. Tasks 3, 4 depend on Task 2. Task 5 depends on Task 1. Task 6 depends on Task 2.
