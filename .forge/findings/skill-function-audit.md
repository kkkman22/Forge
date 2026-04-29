---
date: "2026-04-30"
scope: "skill-function-integration-audit"
---

# SKILL-纯函数对接审计报告

## 审计范围

扫描 4 个 TypeScript 模块的 30 个 exported 函数，对照 16 个 SKILL.md 文件。

## 对接状态

### `src/context-budget.ts` — Trimmer 函数

| 函数名 | SKILL 概念名 | 状态 | 涉及 SKILL |
|--------|-------------|------|-----------|
| `serializeExploreResult()` | Explore_Summarizer | ⚠️ 概念引用，无函数名 | forge-build |
| `serializeReviewSummary()` | Review_Summarizer | ⚠️ 概念引用，无函数名 | forge-review |
| `serializeTestOutput()` | Test_Output_Trimmer | ⚠️ 概念引用，无函数名 | forge-build |
| `serializeGitDiff()` | Git_Output_Limiter | ⚠️ 概念引用，无函数名 | forge-build |
| `serializeGitStatus()` | Git_Output_Limiter | ⚠️ 概念引用，无函数名 | forge-build |
| `serializeSubagentSummary()` | Subagent_Summary_Protocol | ⚠️ 概念引用，无函数名 | forge-build, forge-decide |
| `serializeContextBudgetReport()` | （无） | ❌ 完全未引用 | 应在 forge-learn |
| `deserializeContextBudgetReport()` | （无） | ❌ 完全未引用 | 应在 forge-learn |

### `src/learn.ts` — 知识引擎函数

| 函数名 | 状态 | 涉及 SKILL |
|--------|------|-----------|
| `generateKnowledgeDocument()` | ⚠️ SKILL 描述了流程但未指明函数名 | forge-learn |
| `validateKnowledgeFrontmatter()` | ⚠️ SKILL 描述了格式要求但未指明验证函数 | forge-learn |
| `maintainKnowledgeBase()` | ⚠️ SKILL 描述了维护规则但未指明函数名 | forge-learn |
| `analyzeSkillFeedback()` | ⚠️ SKILL 描述了反馈分析但未指明函数名 | forge-learn |
| `crossValidateFailures()` | ❌ 完全未引用 | 应在 forge-learn |

### `src/ship.ts` — 交付引擎函数

| 函数名 | 状态 | 涉及 SKILL |
|--------|------|-----------|
| `checkShipGate()` | ⚠️ SKILL 描述了门禁逻辑但未指明函数名 | forge-ship |
| `checkShipGateWithChecklist()` | ⚠️ SKILL 未提及 checklist 扩展门禁 | forge-ship |

### `src/build.ts` — 构建引擎函数

| 函数名 | 状态 | 涉及 SKILL |
|--------|------|-----------|
| `checkBuildGate()` | ⚠️ SKILL 描述了门禁逻辑但未指明函数名 | forge-build |
| `analyzeFixAttempts()` | ⚠️ SKILL 描述了三次换路但未指明函数名 | forge-build |
| `buildResearchSubagents()` | ⚠️ SKILL 描述了并行研究但未指明函数名 | forge-build |
| `mergeResearchFindings()` | ⚠️ SKILL 描述了合并发现但未指明函数名 | forge-build |

## 统计

| 状态 | 数量 | 说明 |
|------|------|------|
| ✅ 已对接 | 0 | 无任何函数在 SKILL 中有显式调用路径 |
| ⚠️ 概念引用 | 16 | SKILL 中有概念描述或概念名，但无函数名映射 |
| ❌ 未对接 | 2 | serializeContextBudgetReport、deserializeContextBudgetReport |

## 不在审计范围内的函数

以下函数为辅助/反序列化函数，主要用于测试和 round-trip 验证，不在本次对接修复范围：

- `classifySource` — 内部分类辅助函数
- `serializeExploreSummary` / `deserializeExploreSummary` — Explore 的辅助序列化
- `canParseTestOutput` / `deserializeTestOutput` — Test 的解析辅助
- `deserializeGitDiff` / `deserializeGitStatus` — Git 的反序列化
- `deserializeReviewSummary` / `deserializeSubagentSummary` — Review/Subagent 反序列化
- `isValidCalendarDate` — 日期验证辅助
- `shouldEscalateToDebug` — build.ts 中的布尔判断辅助
