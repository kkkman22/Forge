---
topic: "build-discipline-enhancement"
status: "approved"
date: "2026-05-01"
spec_ref: ".kiro/specs/build-discipline-enhancement"
format: "lightweight"
---

# Plan: Build Discipline Enhancement

> 来源: `.kiro/specs/build-discipline-enhancement/`

## Objective

为 forge-build SKILL.md 增加 6 项工程纪律规则。纯 Markdown 内容改动，不涉及 TypeScript 代码。

## Research Findings

经检查 reference 文件，以下 3 项内容已预存在：
- **Simplicity Check**: `references/tdd-rules.md` 已包含完整内容和示例
- **Chesterton's Fence**: `references/context-budget.md` Reflection Triggers 表已包含触发行
- **Dead Code Hygiene**: `references/tdd-rules.md` 已包含扫描规则

但 SKILL.md 主文件缺少对应的显式章节引用。需补充 SKILL.md 层面的章节 + 新增 Change Summary、Source-Driven、Dependency Discipline。

## Design Reference Index

| Anchor | Summary |
|--------|---------|
| `design.md#1-41-simplicity-check` | GREEN 阶段简洁性规则 + Rule of Three + 示例 |
| `design.md#2-66-change-summary` | 三段式变更摘要格式（变更/未触碰/关注点） |
| `design.md#3-source-driven` | Framework API 验证规则，追加到 §3.2 Include 列表 |
| `design.md#4-chestertons-fence` | Reflection Triggers 表新行（已实现） |
| `design.md#5-67-dependency-discipline` | 4 项依赖确认清单 |
| `design.md#6-dead-code-hygiene` | REFACTOR 后孤儿代码扫描 |

## File Mapping

| File Path | Operation | Description |
|---------|------|------|
| `skills/forge-build/SKILL.md` | MODIFY | 新增 §4.1、§6.6、§6.7，修改 §3.2 Include 列表 |
| `CLAUDE.md` | MODIFY | §2.6 Structured_Output 豁免清单增加 Change Summary |

## Task Breakdown

### Task 1: Add §4.1 Simplicity Check to SKILL.md

- **Goal**: 在 §4 TDD Iron Rules 后新增 §4.1 子章节，引用 tdd-rules.md 中的详细内容
- **File**: `skills/forge-build/SKILL.md`
- **Design Reference**: `design.md#1-41-simplicity-check` — GREEN 阶段简洁性规则
- **Depends On**: (none)
- **Verify**: 检查 SKILL.md 含 §4.1 标题和 Simplicity Check 关键规则
- **Commit**: `feat(build-skill): add §4.1 Simplicity Check subsection`

### Task 2: Add §4.1.1 Dead Code Hygiene to SKILL.md

- **Goal**: 在 §4.1 后新增 §4.1.1 子章节，引用 tdd-rules.md 中的 Dead Code Hygiene 内容
- **File**: `skills/forge-build/SKILL.md`
- **Design Reference**: `design.md#6-dead-code-hygiene` — REFACTOR 后孤儿代码扫描
- **Depends On**: Task 1
- **Verify**: 检查 SKILL.md 含 Dead Code Hygiene 规则和 `.tinkerman/findings/` 引用
- **Commit**: `feat(build-skill): add Dead Code Hygiene to §4.1.1`

### Task 3: Add Framework API verification to §3.2

- **Goal**: 在 §3.2 Standard Include 列表追加 Framework API 验证项
- **File**: `skills/forge-build/SKILL.md`
- **Design Reference**: `design.md#3-source-driven` — 框架 API 签名验证规则
- **Depends On**: (none)
- **Verify**: 检查 §3.2 Include 列表含 "Framework API 验证" 或 "apiVerification"
- **Commit**: `feat(build-skill): add Framework API verification to §3.2 Include list`

### Task 4: Add §6.6 Change Summary to SKILL.md

- **Goal**: 在 §6 Execution Discipline 新增 §6.6 变更摘要子章节
- **File**: `skills/forge-build/SKILL.md`
- **Design Reference**: `design.md#2-66-change-summary` — 三段式变更摘要
- **Depends On**: (none)
- **Verify**: 检查 §6.6 含 变更/未触碰/关注点 三段格式
- **Commit**: `feat(build-skill): add §6.6 Change Summary subsection`

### Task 5: Add §6.7 Dependency Discipline to SKILL.md

- **Goal**: 在 §6.6 后新增 §6.7 依赖纪律子章节
- **File**: `skills/forge-build/SKILL.md`
- **Design Reference**: `design.md#5-67-dependency-discipline` — 4 项依赖确认清单
- **Depends On**: Task 4
- **Verify**: 检查 §6.7 含 4 项确认清单
- **Commit**: `feat(build-skill): add §6.7 Dependency Discipline subsection`

### Task 6: Update CLAUDE.md §2.6 Structured_Output exemption list

- **Goal**: 在 §2.6 Structured_Output 豁免清单增加 Change Summary 条目
- **File**: `CLAUDE.md`
- **Design Reference**: `design.md#2-66-change-summary` — 变更摘要属于 Structured_Output
- **Depends On**: Task 4
- **Verify**: 检查 CLAUDE.md §2.6 豁免清单含 "变更摘要" 或 "Change Summary"
- **Commit**: `feat(claude-md): add Change Summary to Structured_Output exemption list`

### Task 7: Verify consistency

- **Goal**: 确认无重复内容，运行 npm run check
- **File**: (无文件改动)
- **Design Reference**: `design.md#testing-strategy` — 一致性验证
- **Depends On**: Task 1, Task 2, Task 3, Task 4, Task 5, Task 6
- **Verify**: `npm run check` 通过
- **Commit**: (无需提交)

## Spec Coverage

| Spec Requirement | Covering Tasks | Status |
|-----------|---------|--------|
| Requirement 1 (Simplicity Check) | Task 1 | 内容已在 tdd-rules.md，SKILL.md 补充引用 |
| Requirement 2 (Change Summary) | Task 4, Task 6 | 新增 |
| Requirement 3 (Source-Driven Development) | Task 3 | 新增 |
| Requirement 4 (Chesterton's Fence) | — | 已在 context-budget.md Reflection Triggers 表中实现 |
| Requirement 5 (Dependency Discipline) | Task 5 | 新增 |
| Requirement 6 (Dead Code Hygiene) | Task 2 | 内容已在 tdd-rules.md，SKILL.md 补充引用 |
