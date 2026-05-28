---
topic: "skill-composability"
status: "approved"
date: "2026-05-01"
spec_ref: ".kiro/specs/skill-composability"
format: "lightweight"
---

## Objective

将 forge-build（598行）、forge-review（435行）、forge-plan（519行）三个大型 SKILL.md 拆分为主体（编排逻辑）+ references/ 子文件（详细规则），实现跨 SKILL 引用、token 优化和函数签名解耦。拆分后主体目标行数：build ≤200、review ≤150、plan ≤150。

## Research Findings

### 来自知识库
- **instincts.md**：regex/安全模式（与本次内容重组无直接关联）
- **metrics.md**：历史 Plan 偏差率 session1 >1.5，session2/3 正常；验证命令健康

### 来自代码库分析
- forge-build/SKILL.md：598 行，§2 Pre-build Checks(28-139)、§3 Execution Paths(140-352)、§4 TDD(353-365)、§6 Execution Discipline(386-434)、Context Budget(541-598)
- forge-review/SKILL.md：435 行，§6 Confidence Filtering(138-147)、§7 Dedup+Quality Gate(159-193)
- forge-plan/SKILL.md：519 行，§3 Atomic Task Format(165-244)、§4 Prohibited Content(245-264)
- 无现有 references/ 目录
- contract.test.ts：验证 SKILL 目录存在、frontmatter、model-invocation 标记

## Design Reference Index

| Anchor | Summary |
|--------|---------|
| `design.md#architecture` | 拆分后的目录结构和引用方式 |
| `design.md#components-and-interfaces` | forge-build/review/plan 主体结构和引用指针示例 |
| `design.md#testing-strategy` | 合约测试更新和回归验证 |

## File Mapping

| File Path | Operation | Description |
|---------|------|------|
| `skills/forge-build/references/tdd-rules.md` | CREATE | §4 TDD Iron Rules 详细内容 + 简洁性检查 |
| `skills/forge-build/references/closure-probes.md` | CREATE | §3.4 Closure-First Probes 完整内容 |
| `skills/forge-build/references/context-budget.md` | CREATE | Context Budget Management + Reflection Triggers |
| `skills/forge-build/references/anti-drift.md` | CREATE | §6 反漂移守卫 + 反射触发器 |
| `skills/forge-build/references/change-summary.md` | CREATE | §6 三段式变更摘要格式 |
| `skills/forge-build/references/dependency-discipline.md` | CREATE | §6 依赖纪律检查清单 |
| `skills/forge-build/references/function-contracts.md` | CREATE | 所有 Function Call 块 |
| `skills/forge-build/SKILL.md` | MODIFY | 提取内容替换为指针，主体 ≤200 行 |
| `skills/forge-review/references/confidence-filtering.md` | CREATE | §6 置信度评分 + 过滤规则 |
| `skills/forge-review/references/dedup-pipeline.md` | CREATE | §7.1 指纹去重 + 跨评审者一致性 |
| `skills/forge-review/references/quality-gate.md` | CREATE | §7.3 报告质量自检 |
| `skills/forge-review/references/function-contracts.md` | CREATE | 所有 Function Call 块 |
| `skills/forge-review/SKILL.md` | MODIFY | 提取内容替换为指针，主体 ≤150 行 |
| `skills/forge-plan/references/atomic-task-format.md` | CREATE | §3 完整任务格式 + TDD 步骤示例 |
| `skills/forge-plan/references/lightweight-task-format.md` | CREATE | §2 Step 3 轻量任务格式 |
| `skills/forge-plan/references/prohibited-content.md` | CREATE | §4 占位符扫描规则 |
| `skills/forge-plan/references/function-contracts.md` | CREATE | 所有 Function Call 块 |
| `skills/forge-plan/SKILL.md` | MODIFY | 提取内容替换为指针，主体 ≤150 行 |
| `skills/forge-debug/SKILL.md` | MODIFY | Phase 4 增加 ../forge-build/references/tdd-rules.md 引用 |
| `skills/forge-test/SKILL.md` | MODIFY | 增加 ../forge-build/references/tdd-rules.md 引用 |
| `skills/forge-decide/SKILL.md` | MODIFY | §2 增加 persona 覆盖声明 |
| `test/contract.test.ts` | MODIFY | 增加 references/ 文件存在性和指针有效性测试 |

## Task Breakdown

### Task 1: Extract forge-build references (7 files)
- **Goal**: 从 forge-build/SKILL.md 提取 7 个详细内容文件到 references/
- **File**: `skills/forge-build/references/*.md`
- **Design Reference**: `design.md#architecture` — 拆分后的目录结构
- **Depends On**: (none)
- **Verify**: `ls skills/forge-build/references/` 显示 7 个文件
- **Commit**: `refactor(build): extract forge-build detailed rules to references/`

### Task 2: Slim down forge-build SKILL.md
- **Goal**: 将提取的内容替换为 `→ 详见 references/<filename>` 指针，保留 1-3 行摘要
- **File**: `skills/forge-build/SKILL.md`
- **Design Reference**: `design.md#components-and-interfaces` — forge-build 主体结构
- **Property**: 行数 ≤200
- **Depends On**: Task 1
- **Verify**: `wc -l skills/forge-build/SKILL.md` ≤200
- **Commit**: `refactor(build): slim down forge-build SKILL.md main body to ≤200 lines`

### Task 3: Extract forge-review references (4 files)
- **Goal**: 从 forge-review/SKILL.md 提取 4 个详细内容文件到 references/
- **File**: `skills/forge-review/references/*.md`
- **Design Reference**: `design.md#architecture` — 拆分后的目录结构
- **Depends On**: (none)
- **Verify**: `ls skills/forge-review/references/` 显示 4 个文件
- **Commit**: `refactor(review): extract forge-review detailed rules to references/`

### Task 4: Slim down forge-review SKILL.md
- **Goal**: 将提取的内容替换为指针，主体 ≤150 行
- **File**: `skills/forge-review/SKILL.md`
- **Design Reference**: `design.md#components-and-interfaces` — forge-review 主体结构
- **Property**: 行数 ≤150
- **Depends On**: Task 3
- **Verify**: `wc -l skills/forge-review/SKILL.md` ≤150
- **Commit**: `refactor(review): slim down forge-review SKILL.md main body to ≤150 lines`

### Task 5: Extract forge-plan references (4 files)
- **Goal**: 从 forge-plan/SKILL.md 提取 4 个详细内容文件到 references/
- **File**: `skills/forge-plan/references/*.md`
- **Design Reference**: `design.md#architecture` — 拆分后的目录结构
- **Depends On**: (none)
- **Verify**: `ls skills/forge-plan/references/` 显示 4 个文件
- **Commit**: `refactor(plan): extract forge-plan detailed rules to references/`

### Task 6: Slim down forge-plan SKILL.md
- **Goal**: 将提取的内容替换为指针，主体 ≤150 行
- **File**: `skills/forge-plan/SKILL.md`
- **Design Reference**: `design.md#components-and-interfaces` — forge-plan 主体结构
- **Property**: 行数 ≤150
- **Depends On**: Task 5
- **Verify**: `wc -l skills/forge-plan/SKILL.md` ≤150
- **Commit**: `refactor(plan): slim down forge-plan SKILL.md main body to ≤150 lines`

### Task 7: Add cross-SKILL references
- **Goal**: forge-debug Phase 4 和 forge-test 引用 ../forge-build/references/tdd-rules.md
- **File**: `skills/forge-debug/SKILL.md`, `skills/forge-test/SKILL.md`
- **Design Reference**: `design.md#architecture` — 跨 SKILL 引用方式
- **Depends On**: Task 1
- **Verify**: `grep -c "forge-build/references/tdd-rules" skills/forge-debug/SKILL.md skills/forge-test/SKILL.md`
- **Commit**: `refactor: add cross-SKILL TDD references to debug and test`

### Task 8: Add Persona override declarations
- **Goal**: forge-review §2 和 forge-decide §2 增加 persona 覆盖声明
- **File**: `skills/forge-review/SKILL.md`, `skills/forge-decide/SKILL.md`
- **Design Reference**: `design.md#components-and-interfaces` — persona 覆盖声明
- **Depends On**: Task 4 (review 需先完成主体瘦身)
- **Verify**: `grep "用户可在" skills/forge-review/SKILL.md skills/forge-decide/SKILL.md`
- **Commit**: `feat: add persona override declarations to review and decide skills`

### Task 9: Update contract tests and verify
- **Goal**: 增加测试验证 references/ 文件存在性、指针有效性、跨 SKILL 引用路径
- **File**: `test/contract.test.ts`
- **Design Reference**: `design.md#testing-strategy` — 合约测试更新
- **Depends On**: Task 2, Task 4, Task 6, Task 7
- **Verify**: `npm run check` 全量通过
- **Commit**: `test: add contract tests for SKILL references/ structure`

## Spec Coverage

| Spec Requirement | Covering Tasks |
|-----------|---------|
| Requirement 1: forge-build 拆分 | Task 1, Task 2 |
| Requirement 2: forge-review 拆分 | Task 3, Task 4 |
| Requirement 3: forge-plan 拆分 | Task 5, Task 6 |
| Requirement 4: 跨 SKILL 引用 | Task 7 |
| Requirement 5: 函数签名分离 | Task 1, Task 3, Task 5 (function-contracts.md) |
| Requirement 6: Persona 覆盖声明 | Task 8 |
