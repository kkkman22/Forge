---
feature: skill-function-integration-audit
layout: tasks
created: 2026-04-29
spec_ref: ".forge/specs/skill-function-integration-audit/requirements.md"
---

# Implementation Plan

- [x] 1. 审计：生成 SKILL-纯函数对接状态报告
  - 扫描 `src/context-budget.ts`、`src/learn.ts`、`src/ship.ts`、`src/build.ts` 中所有 exported 函数
  - 对照 `skills/*/SKILL.md` 中的引用，标记每个函数的对接状态：
    - ✅ 已对接：SKILL 中有函数名 + 参数来源 + 返回值用途
    - ⚠️ 概念引用：SKILL 中有概念描述但无函数名映射
    - ❌ 未对接：SKILL 中完全未引用
  - 将审计报告输出到 `.forge/findings/skill-function-audit.md`
  - 确认 design.md 中的审计表格与实际代码一致，如有偏差则更新 design.md
  - _Requirements: R1_

- [x] 2. 修复 forge-build/SKILL.md 的对接缺失
  - 在 §2 前置检查处添加 `checkBuildGate()` 函数调用说明（参数来源：spec frontmatter status、plan frontmatter status；返回值：`{ allowed, reasons }`，`allowed: false` 时使用 reasons 生成拒绝输出）
  - 在 §5.1 连续失败升级处添加 `analyzeFixAttempts()` 函数调用说明（参数来源：当前任务的修复尝试序列；返回值：`{ shouldEscalate, consecutiveFailures, escalationIndex }`）
  - 在 §3.3 全量路径阶段一添加 `buildResearchSubagents()` 和 `mergeResearchFindings()` 调用说明
  - 在"上下文预算管理"章节的裁剪执行时机处，为每个 Trimmer 概念名添加函数名映射：
    - Explore_Summarizer → `serializeExploreResult(exploreOutput)` — 参数：Explore Agent 原始返回值；返回：摘要字符串；用途：替换 context 中的原始输出
    - Subagent_Summary_Protocol → `serializeSubagentSummary(subagentOutput)` — 参数：Subagent 原始返回值；返回：摘要字符串；用途：替换 context 中的执行日志
    - Test_Output_Trimmer → `serializeTestOutput(testOutput)` — 参数：测试运行原始输出（需先解析为 TestOutputSummary）；返回：摘要字符串；用途：替换 context 中的测试输出
    - Git_Output_Limiter → `serializeGitDiff(diffSummary, lineCount)` / `serializeGitStatus(statusSummary, fileCount)` — 参数：git 命令输出（需先解析）；返回：摘要字符串；用途：超阈值时替换原始输出
  - 验证：修改后的 SKILL 文档中，每个函数调用说明包含三要素（函数名、参数来源、返回值用途）
  - _Requirements: R2, R5_

- [x] 3. 修复 forge-review/SKILL.md 的对接缺失
  - 在"上下文预算管理"章节添加 `serializeReviewSummary()` 函数调用说明：
    - Review_Summarizer → `serializeReviewSummary(reviewOutput)` — 参数：评审者输出（需先解析为 ReviewSummary）；返回：摘要字符串；用途：替换 context 中的评审完整输出
  - 验证：三要素完整
  - _Requirements: R2, R5_

- [x] 4. 修复 forge-ship/SKILL.md 的对接缺失
  - 在 §2 门禁检查处添加 `checkShipGate()` 函数调用说明：
    - 参数来源：`review` 从 `.forge/reviews/<topic>.md` frontmatter 解析，`test` 从 Layer 1 + Layer 3 结果构造，`progress` 从 `.forge/progress/<topic>.md` 解析
    - 返回值：`{ allowed, reasons }`，`allowed: false` 时列出所有未通过的门禁
  - 添加 `checkShipGateWithChecklist()` 说明（当存在 P1 Fix Checklist 时使用）
  - 验证：三要素完整
  - _Requirements: R2, R5_

- [x] 5. 修复 forge-learn/SKILL.md 的对接缺失
  - 在 §2 执行质量分析处添加：
    - `analyzeSkillFeedback(entries)` — 参数：从 `.forge/knowledge/skill-feedback.md` 解析的反馈条目；返回：`{ commandStats, alertCommands, totalEntries }`；用途：识别高失败率命令
    - `crossValidateFailures(feedbackReasons, knownFailureDescriptions)` — 参数：feedbackReasons 从 analyzeSkillFeedback 结果提取，knownFailureDescriptions 从 `known-failures.md` 解析；返回：交叉验证的重复失败原因；用途：确认反复出现的模式
  - 在 §3 五维度知识提取后添加：
    - `generateKnowledgeDocument(title, tags, date, confidence, body)` — 参数：从五维度提取结果构造；返回：完整的 KnowledgeDocument 对象；用途：生成标准格式的知识文档写入 `solutions/`
    - `validateKnowledgeFrontmatter(frontmatter)` — 参数：生成的文档 frontmatter；返回：`{ valid, errors }`；用途：写入前验证格式合规
  - 在 §7 知识库维护处添加：
    - `maintainKnowledgeBase(state)` — 参数：当前知识库状态（documents + instinctPatterns + limit）；返回：维护结果（保留/移除的文档和模式）；用途：执行文档上限和置信度下限不变量
  - 在 §9 执行流程中添加新步骤（在步骤 12 "会话层清理"之前）：
    - 调用 `serializeContextBudgetReport(report)` 生成上下文预算报告
    - 参数 `report` 的构造：`date` 从当前日期获取，`topic` 从 status.md 获取，token 估算从本次会话的裁剪前后数据估算
    - 将报告追加到 `.forge/knowledge/sessions/<date>-<topic>.md`
  - 验证：所有函数调用说明包含三要素
  - _Requirements: R2, R3, R5_

- [x] 6. 修复 forge-decide/SKILL.md 的对接缺失
  - 在"上下文预算管理"章节添加：
    - Subagent_Summary_Protocol → `serializeSubagentSummary(subagentOutput)` — 参数：视角 Subagent 原始返回值；返回：摘要字符串（≤200 tokens）；用途：Round 2 输入时替换原始输出
  - 验证：三要素完整
  - _Requirements: R2, R5_

- [x] 7. 在 CONTRIBUTING.md 添加对接检查机制
  - 添加"SKILL-纯函数对接检查"章节
  - 包含 3 项 checklist：函数是否被 SKILL 引用、引用是否包含完整调用路径、Forge Loop 专用函数的例外标注
  - _Requirements: R4_

- [x] 8. 验证：全量检查
  - 重新执行 Task 1 的审计扫描，确认所有 ⚠️ 和 ❌ 状态已修复为 ✅
  - 运行 `npm run check` 确保无回归（SKILL 文档修改不应影响代码）
  - 检查修改后的 SKILL 文档 token 增量是否在可接受范围内（每个 SKILL 增量 ≤500 tokens）
  - _Requirements: R1, R2, R3, R4, R5_
