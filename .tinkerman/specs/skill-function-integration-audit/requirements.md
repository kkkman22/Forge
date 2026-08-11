---
status: completed
feature: skill-function-integration-audit
layout: requirements
created: 2026-04-29
tier: standard
---
# SKILL-纯函数对接审计 — 需求文档

## 背景

Forge 采用双层架构：
- **SKILL 指令层**：`.md` 文档，由 AI 按步骤解释执行
- **TypeScript 纯函数层**：`src/*.ts` 模块，提供可调用的数据处理逻辑

在实际开发中发现，多个纯函数模块已实现并通过测试，但对应的 SKILL 文档未引用它们，导致功能断裂。这个问题在以下三个场景中被观察到（来源：`/forge` 会话中的 R6/R7/R14 诊断）：

- **R6（Backlog）**：`forge-ship` SKILL 提到 `appendToBacklog()` 但 `backlog.ts` 从未创建，SKILL 指令指向不存在的函数
- **R7（Knowledge Accumulation）**：`forge-learn` 的五维度提取是 SKILL 指令驱动的，但 `learn.ts` 中的 `generateKnowledgeDocument`、`maintainKnowledgeBase` 等纯函数缺少从 SKILL 到函数的显式调用路径
- **R14（Budget Reporting）**：`context-budget.ts` 中的 `serializeContextBudgetReport` / `deserializeContextBudgetReport` 已实现且有 round-trip property test，但没有任何 SKILL 文档指示 AI 调用它们

此外，`context-budget.ts` 中的 Trimmer 函数（`serializeExploreResult`、`serializeReviewSummary`、`serializeTestOutput`、`serializeGitDiff`、`serializeSubagentSummary`）在 SKILL 文档中仅以概念名称出现（如 "Explore_Summarizer"、"Test_Output_Trimmer"），未建立从概念名到实际函数调用的映射。这导致 context window 在长流程中线性增长直到触发 compaction。

## 问题定义

### P1：SKILL-函数对接断裂

GIVEN 一个纯函数已在 `src/*.ts` 中实现并通过测试
WHEN 对应的 SKILL 文档未包含该函数的显式调用路径（函数名 + 参数来源 + 返回值用途）
THEN 该函数在实际工作流中永远不会被 AI 调用，功能等于不存在

### P2：Trimmer 概念名与实际函数脱节

GIVEN SKILL 文档中引用了 Trimmer 概念名（如 "Explore_Summarizer"）
WHEN 概念名未映射到实际的 TypeScript 函数名（如 `serializeExploreResult`）
THEN AI 在执行 SKILL 指令时无法确定应调用哪个函数，裁剪策略形同虚设

### P3：Budget Report 无调用方

GIVEN `serializeContextBudgetReport` 和 `deserializeContextBudgetReport` 已实现
WHEN 没有任何 SKILL 在流程结束时指示 AI 调用这些函数生成报告
THEN 上下文预算报告永远不会被生成，无法追踪裁剪效果

## 需求

### R1：审计所有已实现纯函数的 SKILL 引用状态

扫描 `src/*.ts` 中所有 exported 函数，对照 `skills/*/SKILL.md` 中的引用，生成审计报告，标识：
- ✅ 已对接：SKILL 中有显式调用路径
- ⚠️ 概念引用：SKILL 中有概念名但无函数名映射
- ❌ 未对接：SKILL 中完全未引用

### R2：为 Trimmer 函数建立概念名→函数名映射

在相关 SKILL 文档的"上下文预算管理"章节中，为每个 Trimmer 概念名添加对应的函数调用说明：
- 概念名 → 函数名
- 参数来源（从哪个上下文变量获取）
- 返回值用途（替换原始输出 / 写入文件 / 丢弃原始数据）

### R3：为 Budget Report 添加 SKILL 调用路径

在 `forge-learn/SKILL.md` 或 `forge-ship/SKILL.md` 的适当位置添加步骤：
- 调用 `serializeContextBudgetReport` 生成报告
- 将报告写入 `.tinkerman/knowledge/sessions/` 
- 明确参数来源（date、topic、token 估算数据）

### R4：建立对接检查机制

在未来每次新增纯函数模块后，确保有一个显式的验证步骤：
- 新函数是否已在对应 SKILL 文档中被引用？
- 引用是否包含完整调用路径（函数名 + 参数来源 + 返回值用途）？

### R5：不修改已有纯函数的实现

本次审计只修改 SKILL 文档（指令层），不修改 `src/*.ts` 中的纯函数实现。纯函数的正确性已由现有测试保证。

### 不在范围内

- 创建 `backlog.ts`（R6 的完整修复需要独立的设计决策，不在本次审计范围）
- 修改 `forge-learn` 的运行时行为使其自动触发（R7 的 scope creep 风险，需独立评估）
- 修改任何纯函数的接口或实现
