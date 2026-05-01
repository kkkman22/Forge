---
name: forge-learn
description: "知识引擎。五维度经验提取和沉淀，维护知识库健康度。"
disable-model-invocation: true
---

# /forge learn — 知识引擎

> **触发方式**：全量路径的第八步（最后一步），或用户直接输入 `/forge learn`，或 `/forge ship` 完成后提示触发
> **职责**：从每次开发中提取关键经验并沉淀为可复用的知识资产，让系统越做越强
> **输出路径**：`.forge/knowledge/solutions/<topic>.md` + `.forge/knowledge/instincts.md` + `.forge/knowledge/known-failures.md` + `.forge/knowledge/sessions/<date>-<topic>.md`

---

## 1. Overview

`/forge learn` 是 Forge 工作流的知识沉淀阶段——把一次性的开发经验转化为可复用的知识资产。它以 Subagent 模式从五个维度提取知识，将解决方案文档化，将高频模式写入直觉库，并自动维护知识库的健康度。

**核心原则**：完成即沉淀。每次开发都是一次学习机会，不沉淀的经验等于没有发生过。

---

**Not For**：
- 轻量路径的简单修复（无值得沉淀的经验）
- 中止的任务（abort 后无需 learn）

## 2. Execution Quality Analysis (Closed-loop Feedback)

在知识提取之前，先对本次开发的执行质量进行结构化分析。

### Analysis Data Sources

| Data Source | Analysis Content |
|-------------|-----------------|
| `.forge/progress/<topic>.md` | First-pass / repeated failures / blocked tasks |
| `.forge/reviews/<topic>.md` | P0/P1 count and recurring issue types |
| `.forge/debug/<topic>.md` | Whether debug was triggered and root cause |
| `.forge/plans/<topic>.md` | Estimated vs actual time deviation |
| `.forge/specs/<feature>/spec.md` | Scenario coverage rate, Scope Creep |

**函数调用**：`analyzeSkillFeedback(entries)`
- 参数：`entries` — 从 `.forge/knowledge/skill-feedback.md` 解析的反馈条目数组（`SkillFeedbackEntry[]`，每条含 command、scenario、suggestion、frequency）
- 返回：`{ commandStats: CommandStats[], alertCommands: string[], totalEntries: number }`
- 用途：识别高失败率命令和不适用 SKILL 场景，`alertCommands` 中的命令需审阅对应 SKILL.md

**函数调用**：`crossValidateFailures(feedbackReasons, knownFailureDescriptions)`
- 参数：`feedbackReasons` — 从 `analyzeSkillFeedback` 结果中提取的失败原因（`string[]`）；`knownFailureDescriptions` — 从 `.forge/knowledge/known-failures.md` 解析的已知失败描述（`string[]`）
- 返回：交叉验证后的重复失败原因列表（`string[]`）
- 用途：确认反复出现的失败模式是否已在 known-failures 中记录，未记录的新模式应添加

### Analysis Dimensions

| Dimension | Metric | Calculation |
|-----------|--------|-------------|
| **First-pass Rate** | Ratio of tasks completed without rework | First-pass tasks / Total tasks |
| **Plan Accuracy** | Estimated vs actual deviation | Actual total time / Estimated total time |
| **Review Interception Rate** | Issue density | (P0 + P1) / Total tasks |
| **Debug Trigger Rate** | Debug frequency | Trigger count / Total tasks |

### Analysis Output Format

```
📊 执行质量分析

━━━ 执行概况 ━━━
  总任务数：5
  一次通过：4/5（80%）
  返工任务：Task 3（连续失败 2 次后通过）
  Debug 触发：0 次

━━━ Plan 准确度 ━━━
  预估总耗时：17 min → 实际：22 min → 偏差率：1.29

━━━ Review 质量 ━━━
  P0：0 / P1：1（缺少鉴权中间件）/ P2：2 → 拦截率：0.2

━━━ 改进信号 ━━━
  ⚠️ Task 3 反复失败：路由注册模式不熟悉 → 建议沉淀为知识
  ⚠️ Plan 预估偏差 > 20%：复杂任务需要更多缓冲
```

### Improvement Signals Drive Knowledge Extraction

分析的**改进信号**直接作为五维度知识提取的输入：反复失败 → 踩坑记录；Plan 偏差大 → 可复用模式；Review 高频问题 → 直觉模式；Debug 根因 → 解决方案。

### Metrics Persistence

将本次会话指标追加到 `.forge/knowledge/metrics.md`：命令使用统计、路由准确度、四维度执行质量趋势、验证命令健康度。`/forge plan` Research 阶段可读取历史指标校准预估。

---

## 3. Five-Dimension Knowledge Extraction

以 **Subagent 模式**启动知识提取，每个维度由独立 Subagent 处理。

| Dimension | Extraction Content | Data Source |
|-----------|-------------------|------------|
| **Problem Pattern** | Issue type, trigger condition, impact scope | `.forge/debug/`, `.forge/progress/` (blocked items) |
| **Solution** | Final approach, implementation rationale, selection reasoning | `.forge/plans/`, code changes, `.forge/findings/` |
| **Pitfall Record** | Detours, failed attempts, misleading clues | `.forge/debug/`, `.forge/progress/` (failure records) |
| **Decision Rationale** | Decision context, trade-off process, rejected alternatives | `.forge/decisions/`, `.forge/specs/` |
| **Reusable Pattern** | Reusable code/architecture/process patterns | Code changes, `.forge/specs/`, `.forge/plans/` |

**函数调用**：`generateKnowledgeDocument(title, tags, date, confidence, body)`
- 参数：`title` — 知识标题（string）；`tags` — 标签数组（`string[]`）；`date` — 日期字符串（YYYY-MM-DD）；`confidence` — 置信度（0.3-0.9）；`body` — 五章节内容对象（含 `problem`、`solution`、`pitfalls`、`decisions`、`reusable`）
- 返回：完整的 `KnowledgeDocument` 对象（含 frontmatter 和结构化正文）
- 用途：从五维度提取结果生成标准格式的知识文档，写入 `.forge/knowledge/solutions/<topic>.md`

**函数调用**：`validateKnowledgeFrontmatter(frontmatter)`
- 参数：`frontmatter` — 待验证的 frontmatter 对象（含 title、tags、date、confidence 字段）
- 返回：`{ valid: boolean, errors: string[] }`
- 用途：写入前验证 frontmatter 格式合规（title 非空、tags 非空数组、date 为有效日历日期、confidence 在 0.3-0.9 范围）

---

## 4. SKILL Feedback Detection

五维度提取后，检测 SKILL.md 指导是否有不适用的场景。

| Signal | Meaning | Example |
|--------|---------|---------|
| TDD legitimately skipped | Certain tasks are not suited for strict TDD | Pure documentation, config changes, data migration |
| Subagent self-check inapplicable | Meaningless in specific scenarios | Delta check for non-brownfield projects |
| Routing suggestion overridden | AI complexity judgment inaccurate | AI suggests full but user chooses standard |
| Review layer mismatch | Certain review dimensions inapplicable | Accessibility check for pure backend projects |

不适用的场景记录到 `.forge/knowledge/skill-feedback.md`（含涉及命令、场景、建议、频次）。同一类反馈频次 ≥ 3 时提醒用户审阅 SKILL.md。**不自动修改** SKILL.md——只记录和提醒。

---

## 5. Knowledge Document Format

### Knowledge Base Tiered Architecture

| Tier | Directory | Lifecycle | Purpose |
|------|-----------|-----------|---------|
| **Session Tier** | `sessions/` | Single session | `/forge resume` context recovery |
| **Project Tier** | `solutions/` + `instincts.md` | Project-level persistent | plan/build/debug backflow |
| **Cross-project Tier** | `patterns/` | Cross-project persistent | Universal patterns (manual migration, max 10) |

### YAML Frontmatter

```yaml
---
title: "<知识标题>"
tags: ["tag1", "tag2"]
date: "YYYY-MM-DD"
confidence: 0.85
---
```

### Confidence Score Rules

| Score | Meaning |
|-------|---------|
| 0.3-0.4 | Preliminary observation, verified only once |
| 0.5-0.6 | Verified 2-3 times |
| 0.7-0.8 | Verified multiple times, stable and reliable |
| 0.9 | Mature pattern verified by extensive practice (upper limit, do not use 1.0) |

下限 0.3：低于此值不值得记录。

### Body Structure

知识文档包含五个章节：问题模式、解决方案、踩坑记录、决策理由、可复用模式。

输出路径：`.forge/knowledge/solutions/<topic>.md`（kebab-case）。

---

## 6. High-Frequency Patterns and instincts.md

### 6.1 High-Frequency Pattern Recognition

同一模式在 2+ 知识文档中出现且 confidence ≥ 0.5 时，提升为"直觉"。

### 6.2 instincts.md Format

每个模式包含：标题、Confidence_Score（0.3-0.9）、Tags、来源、描述。

### 6.3 Cross-project Pattern Promotion

模式 confidence ≥ 0.8、不依赖特定技术栈、描述通用工程实践时，建议用户提升到 `patterns/`。

### 6.4 Confidence_Score Range

instincts.md 中每个模式必须在 **0.3 至 0.9** 范围内。

### 6.5 Error-Prevention Rule Distillation（错误预防规则蒸馏）

从积累的知识数据中蒸馏出"错误预防规则"——Claude 在没有明确指导时会犯错的高价值模式。规则写入 `.forge/knowledge/evolved-rules.md`（最多 15 条），通过 SessionStart hook 注入上下文。

**核心原则**：只添加"没有这条规则 Claude 就会犯错"的规则——不是知识转储。

#### 6.5.1 Data Sources

| Data Source | File Path | Extraction Content |
|-------------|-----------|-------------------|
| Known failure patterns | `.forge/knowledge/known-failures.md` | Failure patterns with occurrence >= 3 |
| Instinct patterns | `.forge/knowledge/instincts.md` | Experience rules with confidence >= 0.8 |
| SKILL feedback | `.forge/knowledge/skill-feedback.md` | Inapplicable SKILL guidance with frequency >= 3 |
| Execution metrics | `.forge/knowledge/metrics.md` | Degradation trend across 3+ consecutive sessions |
| Session journals | `.forge/knowledge/sessions/*.md` | Same issue appearing in 3+ sessions |

#### 6.5.2 Distillation Algorithm

```
1. READ evolved-rules.md → current_rules[], rule_count, max_rules
2. READ 数据源 → failures[], instincts[], feedback[], metrics[], cross_session_issues[]
3. candidates = []
4. FOR each entry WHERE meets_threshold:
     candidates.push(transform(entry))
5. IF candidates is empty: SKIP
6. FOR each candidate:
     APPLY exclusion filter → APPLY conflict detection → APPLY capacity check
7. PRESENT proposals → FOR each approved: WRITE + UPDATE changelog
```

#### 6.5.3 Transformation Process

每条达标知识转为规则候选：(1) 提取原始模式 (2) 蒸馏为可执行规则声明 (3) 声明防止的具体错误 (4) 继承置信度 (5) 设置 last_triggered。

#### 6.5.4 阈值条件

| Category | Data Source | Threshold |
|------|--------|------|
| 项目特定陷阱 | known-failures.md | occurrence >= 3 |
| 重复纠正模式 | instincts.md | confidence >= 0.8 |
| 环境/工具怪癖 | skill-feedback.md | frequency >= 3 |
| 跨会话行为纠正 | session journals | 同一问题出现在 3+ 会话 |
| 规则摩擦调整 | metrics.md | 连续 3+ 会话退化趋势 |

无达标条目时输出 `ℹ️ No qualifying entries found. Skipping rule distillation.`

#### 6.5.5 排除过滤器

非有效候选：架构描述（可从代码推断）、文件路径列表、通用最佳实践（Claude 已知）、原始知识数据、工具已执行的标准（如 Biome 代码风格）。

#### 6.5.6 冲突检测

比较新候选与现有规则的 `Prevents` 声明。同一组件 + 矛盾指令 = 冲突。冲突候选标注冲突信息，由用户选择保留/替换/同时保留。

#### 6.5.7 容量管理与退役

上限 15 条。满时计算价值分数：`value = confidence × recency_factor`（2 会话内: 1.0, 3-4 会话: 0.7, 5+ 会话: 0.3）。最低价值规则成为退役候选。

#### 6.5.8 陈旧检测

`last_triggered` 距今超过 5 个会话（通过 sessions/ 目录条目数确定）→ 标记为陈旧候选，向用户展示退役建议。

#### 6.5.9 提案展示与审批

每条提案独立审批。被拒绝的不写入、不记录。所有被拒绝则不修改 evolved-rules.md。

#### 6.5.10 写入与变更日志

批准后：(1) 追加规则到 evolved-rules.md (2) 更新 rule_count 和 updated (3) 在 rule-changelog.md 追加条目（含 Action/Source/Confidence/Reason）。如有退役，移除规则并追加退役条目。

---

## 7. Knowledge Base Maintenance

### 7.1 Document Count Limit

`solutions/` 上限 20 个（config.md `knowledge_limit` 可配置）。超限时按 confidence 从低到高删除。

### 7.2 Low Confidence Auto-cleanup

instincts.md 中 Confidence_Score < 0.3 的模式自动删除。每次 learn 执行时先维护。

### 7.3 High Overlap Document Merge

写入前检测 tags 重叠度（共同 tags / min(tags 数)）。≥ 50% 时合并到已有文档，更新 date、提升 confidence（+0.1，上限 0.9）、合并 tags。

### 7.4 Maintenance Invariants

维护完成后必须满足：(1) 文档数 ≤ 上限 (2) 无低置信度模式。

**函数调用**：`maintainKnowledgeBase(state)`
- 参数：`state` — 当前知识库状态（`KnowledgeBaseState` 类型，含 `documents` 数组、`instinctPatterns` 数组、`limit` 数量上限）
- 返回：`MaintenanceResult`（含保留/移除的文档和模式列表，及维护后的不变量校验结果）
- 用途：执行文档上限和置信度下限不变量检查，超限文档按 confidence 从低到高清理，低置信度模式（< 0.3）自动删除

---

## 8. Knowledge Backflow

### 8.1 Plan Phase Backflow (Mandatory)

`/forge plan` Research 步骤**必须**搜索知识库：匹配 solutions/ tags 和 instincts.md Tags，将相关经验注入 Research Findings。知识库为空时提示但不阻断。

### 8.2 Build Phase Backflow (Automatic)

`/forge build` 每个任务自动匹配 instincts.md Tags，注入 Subagent 上下文作为实现参考。

### 8.3 Debug Phase Backflow (Automatic)

`/forge debug` Phase 2 自动搜索 solutions/ 踩坑记录，匹配时直接展示历史方案。

### 8.4 Backflow Effect Tracking

每次回流被实际采用时更新 confidence：有效 → +0.05（上限 0.9）；无效 → -0.1（下限 0.3）。未采用则不变。

### 8.5 Known Failure Pattern Recording

反复出现的失败模式（2+ 次）记录到 `.forge/knowledge/known-failures.md`（模式/触发条件/根因/解决方案/出现次数/置信度）。已有相同模式则更新次数。build 的 Closure-First 探针和 debug Phase 2 自动搜索此文件。

### 8.6 Session Journal

每次 learn 完成后写入 `.forge/knowledge/sessions/<date>-<topic>.md`（≤20 行，含摘要/关键决策/验证结果/下次建议）。`/forge resume` 优先读取最近 3 条恢复上下文。

---

## 9. Execution Flow

1. **Knowledge base maintenance**: Clean low-confidence, check limits
2. **Backflow effect tracking**: Update confidence of referenced knowledge
3. **Execution quality analysis**: Four-dimension assessment + improvement signals
4. **Metrics update**: Write to metrics.md
5. **Five-dimension extraction**: Subagent mode (using improvement signals as input)
6. **SKILL feedback detection**: Check for inapplicable SKILL.md guidance
7. **Generate knowledge document**: YAML frontmatter + five sections
8. **Overlap detection**: ≥ 50% merge, < 50% create new document
9. **High-frequency pattern recognition**: Write to instincts.md when threshold reached
10. **Cross-project pattern detection**: Suggest promotion to patterns/
11. **Error-prevention rule distillation**: 4 data sources → threshold filter → exclusion → conflict → capacity → proposal → write
12. **Context budget report**: Call `serializeContextBudgetReport(report)` — parameter `report` construction: `date` from current date, `topic` from `.forge/status.md` `current_task`, `trimStats` from session trim data (trimmer call counts and token savings), `totalEstimatedTokens` as session total cost estimate; returns: structured report string. Append report to `.forge/knowledge/sessions/<date>-<topic>.md` appendix
13. **Session layer cleanup**: Archive current session in sessions/
14. **Re-check limits**: Ensure maintenance invariants hold

### 9.1 Task Archival (Auto After Learn)

After knowledge is captured, automatically **copy** task artifacts to `.forge/archive/<date>-<topic>/`.

| Source Path | Archive Path |
|-------------|-------------|
| `.forge/decisions/<topic>.md` | `archive/<date>-<topic>/decisions/` |
| `.forge/specs/<feature>/` | `archive/<date>-<topic>/specs/` |
| `.forge/plans/<topic>.md` | `archive/<date>-<topic>/plans/` |
| `.forge/progress/<topic>.md` | `archive/<date>-<topic>/progress/` |
| `.forge/reviews/<topic>.md` | `archive/<date>-<topic>/reviews/` |
| `.forge/debug/<topic>.md` | `archive/<date>-<topic>/debug/` |

After archival, update `.forge/status.md` phase to `"completed"`. Do not archive knowledge/ and config.md.

## Common Rationalizations

| 合理化 | 反驳 |
|--------|------|
| "这次开发没什么值得记录的" | 每次开发都有值得记录的经验。"没什么特别的"本身就是一个信号——说明你没有深入反思 |
| "知识沉淀是额外开销" | 不沉淀的经验等于没有发生过。下次遇到同样问题时你会从零开始 |
| "代码本身就是文档" | 代码记录了"做了什么"，不记录"为什么这样做"和"试过什么不行" |

---

## 10. Edge Case Handling

| Scenario | Handling |
|----------|----------|
| 首次执行（空知识库） | 创建 solutions/ 和 instincts.md，输出提示 |
| 无可提取知识 | 提示本次较简单，未识别到新知识 |
| 知识库已满 | 新文档 confidence 高于最低文档时提示替换确认 |
| 无 `.forge/` 目录 | 提示先运行 `forge init` |

---

## 11. Examples

**正常知识沉淀**：

```
$ /forge learn

🧹 知识库维护... 15/20 ✅
📊 执行质量分析... 一次通过 4/5, 偏差 1.15
📈 指标更新... 写入 metrics.md
🔍 五维度提取...
  1. 问题：大数据量导出内存溢出
  2. 方案：流式处理 + 分片写入
  3. 踩坑：全量加载到内存 OOM
  4. 决策：流式优于分页（一致性）
  5. 可复用：>10000 条用流式
📝 输出：solutions/streaming-export-pattern.md (confidence: 0.7)
📊 "流式处理大数据量"已出现 3 次 → 写入 instincts.md (0.75)
✅ 知识沉淀完成：新增 1, 更新直觉 1, 当前 16/20
```

其他场景：高重叠时合并到已有文档（confidence +0.1，tags 合并）；知识库满时清理最低 confidence 文档。
