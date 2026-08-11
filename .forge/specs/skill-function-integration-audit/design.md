---
feature: skill-function-integration-audit
layout: design
created: 2026-04-29
---

# SKILL-纯函数对接审计 — 设计文档

## 概述

本设计解决 Forge 双层架构中的对接缝隙：纯函数已实现但 SKILL 文档未引用，导致功能断裂。方案是纯文档层面的修改——更新 SKILL 文档建立显式调用路径，不修改任何 TypeScript 代码。

## 审计范围

### 需要审计的纯函数模块

基于 R6/R7/R14 诊断和代码库扫描，以下模块存在对接问题：

#### 1. `src/context-budget.ts` — Trimmer 函数

| 函数名 | SKILL 概念名 | 当前状态 | 涉及 SKILL |
|--------|-------------|---------|-----------|
| `serializeExploreResult()` | Explore_Summarizer | ⚠️ 概念引用，无函数名 | forge-build |
| `serializeReviewSummary()` | Review_Summarizer | ⚠️ 概念引用，无函数名 | forge-review |
| `serializeTestOutput()` | Test_Output_Trimmer | ⚠️ 概念引用，无函数名 | forge-build, forge-test |
| `serializeGitDiff()` | Git_Output_Limiter | ⚠️ 概念引用，无函数名 | forge-build |
| `serializeGitStatus()` | Git_Output_Limiter | ⚠️ 概念引用，无函数名 | forge-build |
| `serializeSubagentSummary()` | Subagent_Summary_Protocol | ⚠️ 概念引用，无函数名 | forge-build, forge-decide |
| `serializeContextBudgetReport()` | （无） | ❌ 完全未引用 | 应在 forge-learn |
| `deserializeContextBudgetReport()` | （无） | ❌ 完全未引用 | 应在 forge-learn |

#### 2. `src/learn.ts` — 知识引擎函数

| 函数名 | 当前状态 | 涉及 SKILL |
|--------|---------|-----------|
| `generateKnowledgeDocument()` | ⚠️ SKILL 描述了流程但未指明函数名 | forge-learn |
| `validateKnowledgeFrontmatter()` | ⚠️ SKILL 描述了格式要求但未指明验证函数 | forge-learn |
| `maintainKnowledgeBase()` | ⚠️ SKILL 描述了维护规则但未指明函数名 | forge-learn |
| `analyzeSkillFeedback()` | ⚠️ SKILL 描述了反馈分析但未指明函数名 | forge-learn |
| `crossValidateFailures()` | ❌ 完全未引用 | 应在 forge-learn |

#### 3. `src/ship.ts` — 交付引擎函数

| 函数名 | 当前状态 | 涉及 SKILL |
|--------|---------|-----------|
| `checkShipGate()` | ⚠️ SKILL 描述了门禁逻辑但未指明函数名 | forge-ship |
| `checkShipGateWithChecklist()` | ⚠️ SKILL 未提及 checklist 扩展门禁 | forge-ship |

#### 4. `src/build.ts` — 构建引擎函数

| 函数名 | 当前状态 | 涉及 SKILL |
|--------|---------|-----------|
| `checkBuildGate()` | ⚠️ SKILL 描述了门禁逻辑但未指明函数名 | forge-build |
| `analyzeFixAttempts()` | ⚠️ SKILL 描述了三次换路但未指明函数名 | forge-build |
| `buildResearchSubagents()` | ⚠️ SKILL 描述了并行研究但未指明函数名 | forge-build |
| `mergeResearchFindings()` | ⚠️ SKILL 描述了合并发现但未指明函数名 | forge-build |

### 不需要审计的模块

以下模块属于 Forge Loop（独立 CLI 程序），不通过 SKILL 指令调用，不在审计范围：

- `src/orchestrator.ts` — 纯函数状态机，由 SdkDriver 直接调用
- `src/effect-executor.ts` — 副作用执行器，由 SdkDriver 直接调用
- `src/sdk-driver.ts` — 迭代循环驱动器
- `src/sdk-agent-adapter.ts` — Agent SDK 适配层
- `src/run-manager.ts` — 运行生命周期管理
- `src/failure-handler.ts` — 失败处理（指数退避 + 熔断器）
- `src/worktree-manager.ts` — Git Worktree 管理
- 其他 Forge Loop 专用模块

## 修改方案

### 方案 1：SKILL 文档内联函数调用说明

在每个 SKILL 文档的相关步骤处，添加函数调用说明块：

```markdown
**函数调用**：`serializeExploreResult(exploreOutput)`
- 参数：`exploreOutput` — Explore Agent 的原始返回值
- 返回：结构化摘要字符串（≤300 tokens）
- 用途：替换 context 中的原始 Explore 输出
```

优点：调用路径与执行步骤紧密关联，AI 在执行到该步骤时能立即看到应调用的函数。
缺点：增加 SKILL 文档长度。

### 方案 2：集中式映射表 + SKILL 引用

创建一个集中式映射文档，SKILL 文档通过引用指向它。

优点：单一维护点。
缺点：增加间接层，AI 需要额外一次文件读取。

### 选择：方案 1

理由：Forge 的 SKILL 是按需加载的（每次只加载当前命令的 SKILL），增加的长度分散在各个 SKILL 中，不会显著增加单次会话的 token 开销。内联方式消除了间接层，AI 执行时无需额外读取。

### 具体修改

#### forge-build/SKILL.md

1. §2 前置检查：在门禁检查表后添加函数调用说明
   - `checkBuildGate(specStatus, planStatus)` → 参数从 frontmatter 读取，返回 `{ allowed, reasons }`
   - `analyzeFixAttempts(sequence)` → §5.1 连续失败升级处使用

2. §3.2 标准路径 / §3.3 全量路径：在 Subagent 返回后的裁剪时机处添加
   - `serializeExploreResult(exploreOutput)` → Explore Agent 返回后
   - `serializeSubagentSummary(subagentOutput)` → Subagent 返回后
   - `serializeTestOutput(testOutput)` → 测试运行后
   - `serializeGitDiff(diffSummary, lineCount)` → Git diff 超 50 行时
   - `serializeGitStatus(statusSummary, fileCount)` → Git status 超 30 文件时

3. §3.3 全量路径阶段一：
   - `buildResearchSubagents(topics)` → 构建研究 Subagent 调用
   - `mergeResearchFindings(results)` → 合并研究发现

#### forge-review/SKILL.md

1. 评审结果处理处添加：
   - `serializeReviewSummary(reviewOutput)` → 评审完成后裁剪输出

#### forge-ship/SKILL.md

1. §2 门禁检查处添加：
   - `checkShipGate(review, test, progress)` → 三道门禁的程序化检查
   - `checkShipGateWithChecklist(review, test, progress, checklist)` → 含 P1 Fix Checklist 的扩展门禁

#### forge-learn/SKILL.md

1. §2 执行质量分析处添加：
   - `analyzeSkillFeedback(entries)` → SKILL 反馈分析
   - `crossValidateFailures(feedbackReasons, knownFailureDescriptions)` → 交叉验证

2. §3 五维度知识提取后添加：
   - `generateKnowledgeDocument(title, tags, date, confidence, body)` → 生成知识文档
   - `validateKnowledgeFrontmatter(frontmatter)` → 验证 frontmatter 格式

3. §7 知识库维护处添加：
   - `maintainKnowledgeBase(state)` → 执行维护不变量

4. §9 执行流程末尾（新增步骤）：
   - `serializeContextBudgetReport(report)` → 生成上下文预算报告
   - 写入 `.forge/knowledge/sessions/<date>-<topic>.md` 的附录

#### forge-decide/SKILL.md

1. Subagent 输出处理处添加：
   - `serializeSubagentSummary(subagentOutput)` → 视角 Subagent 返回后裁剪

### 对接检查机制

在 `CONTRIBUTING.md` 中添加一节"SKILL-纯函数对接检查"，作为 code review checklist 的一部分：

```markdown
## SKILL-纯函数对接检查

每次新增或修改 `src/*.ts` 中的 exported 函数时，检查：

1. [ ] 该函数是否被某个 SKILL 文档引用？
2. [ ] 引用是否包含完整调用路径？
   - 函数名（含模块路径）
   - 参数来源（从哪个上下文变量/文件/命令输出获取）
   - 返回值用途（如何影响后续流程：替换 context / 写入文件 / 阻断流程）
3. [ ] 如果是 Forge Loop 专用函数（由 SdkDriver/EffectExecutor 直接调用），标注为"非 SKILL 调用"

例外：Forge Loop 模块（orchestrator、effect-executor、sdk-driver 等）的函数由程序直接调用，不需要 SKILL 引用。
```

## 不修改的内容

- 所有 `src/*.ts` 文件的实现代码
- 所有现有测试
- SKILL 文档中与对接无关的章节
- Forge Loop 相关模块
