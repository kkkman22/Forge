---
topic: "context-budget-management"
status: "approved"
date: "2026-04-29"
spec_ref: ".kiro/specs/context-budget-management"
format: "lightweight"
---

## Objective

实现上下文预算管理框架，通过信息生命周期分类和裁剪策略，将长会话中的上下文消耗降低约 65%。包含 TypeScript 数据模型、6 组序列化/反序列化器、3 个 SKILL 文档更新、属性测试和契约测试。

## Research Findings

### 来自知识库

ℹ️ 知识库为空（instincts.md、metrics.md、tool-health.md 均为初始状态），跳过历史经验搜索。

### 来自代码库分析

- **现有模式**：`src/context-accumulator.ts` 已有类似的格式化/解析函数模式，纯函数、无副作用
- **测试模式**：属性测试使用 `fast-check` + `vitest`，文件命名 `*.property.test.ts`，describe 块标签格式 `Feature: <topic>, Property N: <text>`
- **Barrel 文件**：`src/index.ts` 按分类分区导出（Core types → Error → Driver → Quality gate → Plan engine）
- **SKILL 文档插入点**：
  - `forge-build/SKILL.md`：Restatement 摘要格式在 line ~197，反射触发器在 line ~1124
  - `forge-review/SKILL.md`：已知 AI 失败模式在 line ~668
  - `forge-decide/SKILL.md`：边界情况处理在 line ~324
- **契约测试**：`test/contract.skills.test.ts` 已有 SKILL.md 结构验证模式

## Design Reference Index

| Anchor | Summary |
|--------|---------|
| `design.md#components-and-interfaces` | Context_Budget_Manager 分类映射表 + 6 个摘要组件的行为指令和 TypeScript 接口 |
| `design.md#data-models` | InformationLifecycle 类型、ClassificationEntry 接口、ClassificationMap 常量、ContextBudgetReport 接口 |
| `design.md#correctness-properties` | 11 个正确性属性定义（分类正确性、格式约束、阈值行为、往返一致性） |
| `design.md#error-handling` | 裁剪失败处理（序列化异常、解析失败、token 超限）和边界情况 |
| `design.md#testing-strategy` | 属性测试矩阵、单元测试清单、SKILL 契约测试、回归测试列表 |

## File Mapping

| 文件路径 | 操作 | 说明 |
|---------|------|------|
| `src/context-budget.ts` | CREATE | 数据模型、分类映射、6 组序列化/反序列化器、预算报告序列化 |
| `test/context-budget.property.test.ts` | CREATE | Properties 1-6：分类映射、格式约束、阈值行为 |
| `test/context-budget-roundtrip.property.test.ts` | CREATE | Properties 7-11：往返一致性测试 |
| `test/context-budget-contract.test.ts` | CREATE | SKILL 文档上下文预算章节契约测试 |
| `src/index.ts` | MODIFY | 添加 context-budget 类型和函数导出 |
| `skills/forge-build/SKILL.md` | MODIFY | 添加上下文预算管理章节 + Restatement 预算状态行 |
| `skills/forge-review/SKILL.md` | MODIFY | 添加上下文预算管理章节 |
| `skills/forge-decide/SKILL.md` | MODIFY | 添加上下文预算管理章节 |

## Task Breakdown

### Task 1: Create context budget data models and classification mapping

- **Goal**: 定义 InformationLifecycle 类型、所有摘要接口、分类映射常量和查询函数
- **File**: `src/context-budget.ts`
- **Design Reference**: `design.md#data-models` — 定义 InformationLifecycle、ClassificationEntry、CLASSIFICATION_MAP、ContextBudgetReport 及 6 个摘要接口
- **Property**: Property 1（分类映射正确性：每个 source 恰好映射到一个 lifecycle 类别，无重复）
- **Depends On**: (none)
- **Verify**: `npx vitest run --grep "Property 1.*classification"`
- **Commit**: `feat(context-budget): add data models and classification mapping`

### Task 2: Implement Explore_Summarizer serializer and deserializer

- **Goal**: 实现 ExploreSummary 的序列化（结构化文本格式）和反序列化（解析回对象），支持 >5 文件时的分组格式
- **File**: `src/context-budget.ts`
- **Design Reference**: `design.md#components-and-interfaces` 第 2 节 — Explore_Summarizer 行为指令、ExploreSummary 接口、分组格式规则
- **Property**: Property 2（Explore 摘要 ≤300 tokens，>5 文件时分组格式）、Property 8（Explore 往返一致性）
- **Depends On**: Task 1
- **Verify**: `npx vitest run --grep "Property [28].*Explore"`
- **Commit**: `feat(context-budget): add Explore_Summarizer serializer/deserializer`

### Task 3: Implement Review_Summarizer serializer and deserializer

- **Goal**: 实现 ReviewSummary 的序列化（severity 分布 + findings 列表 + 文件引用）和反序列化，零 findings 时单行确认
- **File**: `src/context-budget.ts`
- **Design Reference**: `design.md#components-and-interfaces` 第 3 节 — Review_Summarizer 行为指令、ReviewSummary 接口、零 findings 处理
- **Property**: Property 3（Review 摘要 ≤400 tokens，含文件路径引用）、Property 9（Review 往返一致性）
- **Depends On**: Task 1
- **Verify**: `npx vitest run --grep "Property [39].*Review"`
- **Commit**: `feat(context-budget): add Review_Summarizer serializer/deserializer`

### Task 4: Implement Test_Output_Trimmer serializer and deserializer

- **Goal**: 实现 TestOutputSummary 的序列化（全通过时单行，有失败时保留失败详情）和反序列化
- **File**: `src/context-budget.ts`
- **Design Reference**: `design.md#components-and-interfaces` 第 4 节 — Test_Output_Trimmer 行为指令、TestOutputSummary 接口、全通过/有失败两种格式
- **Property**: Property 4（全通过 ≤150 tokens 单行，有失败时含所有失败详情无通过详情）、Property 10（Test 往返一致性）
- **Depends On**: Task 1
- **Verify**: `npx vitest run --grep "Property [41][0].*Test"`
- **Commit**: `feat(context-budget): add Test_Output_Trimmer serializer/deserializer`

### Task 5: Implement Git_Output_Limiter serializer and deserializer

- **Goal**: 实现 GitDiffSummary 和 GitStatusSummary 的序列化（阈值判断 + 摘要格式）和反序列化
- **File**: `src/context-budget.ts`
- **Design Reference**: `design.md#components-and-interfaces` 第 5 节 — Git_Output_Limiter 行为指令、阈值逻辑（50 行/30 文件）、文件级摘要格式
- **Property**: Property 5（diff >50 行时文件级摘要，status >30 文件时分类摘要每类 ≤10）、Property 11（Git 往返一致性）
- **Depends On**: Task 1
- **Verify**: `npx vitest run --grep "Property [51][1].*Git"`
- **Commit**: `feat(context-budget): add Git_Output_Limiter serializer/deserializer`

### Task 6: Implement Subagent_Summary_Protocol serializer and deserializer

- **Goal**: 实现 SubagentSummary 的序列化（状态 + 任务 + 文件 + 测试 + commit + 自检，条件字段）和反序列化
- **File**: `src/context-budget.ts`
- **Design Reference**: `design.md#components-and-interfaces` 第 6 节 — Subagent_Summary_Protocol 行为指令、条件字段（BLOCKED/NEEDS_CONTEXT 含 blockingReason，DONE_WITH_CONCERNS 含 concerns）
- **Property**: Property 6（含所有必需字段，≤200 tokens，条件字段按 status 出现）、Property 7（Subagent 往返一致性）
- **Depends On**: Task 1
- **Verify**: `npx vitest run --grep "Property [67].*Subagent"`
- **Commit**: `feat(context-budget): add Subagent_Summary_Protocol serializer/deserializer`

### Task 7: Implement ContextBudgetReport serializer and deserializer

- **Goal**: 实现 ContextBudgetReport 的序列化（Markdown 格式报告含节省比例和分类明细）和反序列化
- **File**: `src/context-budget.ts`
- **Design Reference**: `design.md#components-and-interfaces` 第 8 节 — 可观测性报告格式、节省低于 30% 时的警告
- **Property**: (单元测试覆盖：正常报告、节省 <30% 警告、零节省边界)
- **Depends On**: Task 1
- **Verify**: `npx vitest run --grep "ContextBudgetReport"`
- **Commit**: `feat(context-budget): add ContextBudgetReport serializer/deserializer`

### Task 8: Write property tests for classification, format constraints, and thresholds

- **Goal**: 编写 Properties 1-6 的属性测试，使用 fast-check 生成器覆盖所有接口字段
- **File**: `test/context-budget.property.test.ts`
- **Design Reference**: `design.md#correctness-properties` — Properties 1-6 的精确语义和 `design.md#testing-strategy` 的测试矩阵
- **Property**: Properties 1-6
- **Depends On**: Task 1
- **Verify**: `npx vitest run test/context-budget.property.test.ts`
- **Commit**: `test(context-budget): add property tests for format constraints and thresholds`

### Task 9: Write round-trip property tests

- **Goal**: 编写 Properties 7-11 的往返一致性测试，验证 serialize → deserialize 语义等价
- **File**: `test/context-budget-roundtrip.property.test.ts`
- **Design Reference**: `design.md#correctness-properties` — Properties 7-11 往返属性定义
- **Property**: Properties 7-11
- **Depends On**: Task 2, Task 3, Task 4, Task 5, Task 6
- **Verify**: `npx vitest run test/context-budget-roundtrip.property.test.ts`
- **Commit**: `test(context-budget): add round-trip property tests`

### Task 10: Add context budget section to forge-build/SKILL.md

- **Goal**: 在反射触发器章节之前添加"上下文预算管理"章节；在 Restatement 摘要格式的 5 区块中增加 💾 上下文预算状态行
- **File**: `skills/forge-build/SKILL.md`
- **Design Reference**: `design.md#components-and-interfaces` 第 1 节 — 分类映射表中 forge-build 相关的裁剪模块（Explore、Test、Git、Subagent）和第 7 节 — Restatement 集成
- **Property**: (契约测试覆盖：SKILL.md 包含上下文预算章节且现有内容未修改)
- **Depends On**: (none)
- **Verify**: `npx vitest run --grep "context-budget.*forge-build"`
- **Commit**: `feat(skills): add context budget section to forge-build SKILL.md`

### Task 11: Add context budget section to forge-review/SKILL.md and forge-decide/SKILL.md

- **Goal**: 在 forge-review 的"已知 AI 失败模式"之前添加上下文预算章节；在 forge-decide 的"边界情况处理"之前添加上下文预算章节
- **File**: `skills/forge-review/SKILL.md`, `skills/forge-decide/SKILL.md`
- **Design Reference**: `design.md#components-and-interfaces` 第 1 节 — 分类映射表中 forge-review（Write-and-discard + Review_Summarizer）和 forge-decide（Subagent_Summary_Protocol + Write-and-discard）的裁剪策略
- **Property**: (契约测试覆盖：两个 SKILL.md 包含上下文预算章节且现有内容未修改)
- **Depends On**: (none)
- **Verify**: `npx vitest run --grep "context-budget.*forge-\\(review\\|decide\\)"`
- **Commit**: `feat(skills): add context budget section to forge-review and forge-decide SKILL.md`

### Task 12: Add SKILL document contract tests for context budget sections

- **Goal**: 编写契约测试验证 3 个 SKILL 文档包含上下文预算管理章节并引用正确的裁剪模块名称
- **File**: `test/context-budget-contract.test.ts`
- **Design Reference**: `design.md#testing-strategy` SKILL 文档 Contract Tests 部分 — 验证章节存在、模块引用正确、现有内容未修改
- **Property**: (契约测试)
- **Depends On**: Task 10, Task 11
- **Verify**: `npx vitest run test/context-budget-contract.test.ts`
- **Commit**: `test(context-budget): add SKILL document contract tests`

### Task 13: Export context-budget module and run full CI check

- **Goal**: 将 context-budget 类型和函数添加到 src/index.ts，运行全量 CI 验证
- **File**: `src/index.ts`
- **Design Reference**: (N/A — 标准模块导出)
- **Property**: (集成验证)
- **Depends On**: Task 2, Task 3, Task 4, Task 5, Task 6, Task 7, Task 8, Task 9, Task 12
- **Verify**: `npm run check`
- **Commit**: `feat(context-budget): export module from barrel file`

## Spec Coverage

| Spec 需求 | 覆盖任务 |
|-----------|---------|
| Requirement 1: 信息生命周期分类框架 | Task 1, Task 8 |
| Requirement 2: Explore Agent 结果摘要化 | Task 2, Task 8, Task 9 |
| Requirement 3: Review 报告上下文裁剪 | Task 3, Task 8, Task 9 |
| Requirement 4: 测试输出裁剪 | Task 4, Task 8, Task 9 |
| Requirement 5: Git Diff/Status 输出限制 | Task 5, Task 8, Task 9 |
| Requirement 6: Subagent 结果摘要协议 | Task 6, Task 8, Task 9 |
| Requirement 7: SKILL 文档上下文预算指令集成 | Task 10, Task 11, Task 12 |
| Requirement 8: Restatement Checkpoint 上下文裁剪集成 | Task 10 |
| Requirement 9: 上下文预算可观测性 | Task 7 |
| Requirement 10: 裁剪结果的解析器往返一致性 | Task 9 |

## Task Dependency Graph

```
Task 1 (data models) ──┬── Task 2 (Explore)
                       ├── Task 3 (Review)
                       ├── Task 4 (Test)
                       ├── Task 5 (Git)
                       ├── Task 6 (Subagent)
                       ├── Task 7 (BudgetReport)
                       └── Task 8 (property tests)

Task 2,3,4,5,6 ────────→ Task 9 (roundtrip tests)

Task 10 (forge-build SKILL) ─┐
Task 11 (review+decide SKILL) ┤→ Task 12 (contract tests)

Task 2-9, Task 12 ───────────→ Task 13 (export + CI)
```
