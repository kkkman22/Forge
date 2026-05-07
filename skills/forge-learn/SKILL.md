---
name: forge-learn
description: "Knowledge distillation engine extracting reusable lessons across five dimensions. Use when user runs `/forge learn` / task completes / needs to convert session experience into persistent knowledge assets."
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

**Not For**：轻量路径的简单修复（无值得沉淀的经验）/ 中止的任务（abort 后无需 learn）

---

## 2. Execution Quality Analysis (Closed-loop Feedback)

在知识提取之前，先对本次开发的执行质量进行结构化分析。四维度：First-pass Rate、Plan Accuracy、Review Interception Rate、Debug Trigger Rate。分析的**改进信号**（反复失败、Plan 偏差大、Review 高频问题、Debug 根因）直接作为五维度知识提取的输入，并追加到 `.forge/knowledge/metrics.md`。

→ 详见 references/quality-analysis.md（数据源、维度计算、输出格式、函数签名 `analyzeSkillFeedback` / `crossValidateFailures`）

---

## 3. Five-Dimension Knowledge Extraction

以 **Subagent 模式**启动知识提取，每个维度由独立 Subagent 处理。五维度为：Problem Pattern、Solution、Pitfall Record、Decision Rationale、Reusable Pattern。

**函数调用**：`generateKnowledgeDocument(title, tags, date, confidence, body)` / `validateKnowledgeFrontmatter(frontmatter)`

→ 详见 references/five-dimensions.md（维度详表、数据源、函数签名、Confidence Score Rules、分层架构）

---

## 4. SKILL Feedback Detection

五维度提取后，检测 SKILL.md 指导是否有不适用的场景。记录到 `.forge/knowledge/skill-feedback.md`，同一类反馈频次 ≥ 3 时提醒审阅。**不自动修改** SKILL.md。

→ 详见 references/skill-feedback.md

---

## 5. Knowledge Document Format

YAML frontmatter（title/tags/date/confidence）+ Body 五章节。confidence 范围 0.3–0.9。

→ 详见 references/knowledge-format.md §5（完整模板与字段说明）

---

## 6. High-Frequency Patterns and instincts.md

- 同一模式在 2+ 知识文档中出现且 confidence ≥ 0.5 → 提升为"直觉"写入 `instincts.md`
- 模式 confidence ≥ 0.8、不依赖特定技术栈 → 建议用户提升到 `patterns/`
- `instincts.md` 每个模式 Confidence_Score 必须在 0.3–0.9 范围

### 6.5 Error-Prevention Rule Distillation

从积累的知识数据中蒸馏"错误预防规则"，写入 `.forge/knowledge/evolved-rules.md`（最多 15 条），通过 SessionStart hook 注入。**核心原则**：只添加"没有这条规则 Claude 就会犯错"的规则——不是知识转储。

→ 详见 references/rule-distillation.md（数据源、蒸馏算法、阈值、排除、冲突检测、容量管理、陈旧检测、审批与写入）

---

## 7. Knowledge Base Maintenance

- `solutions/` 上限 20（`config.md` 中 `knowledge_limit` 可配置）
- Confidence_Score < 0.3 的 instinct 模式自动删除
- 写入前检测 tags 重叠度 ≥ 50% → 合并到已有文档
- 不变量：文档数 ≤ 上限 ∧ 无低置信度模式

**函数调用**：`maintainKnowledgeBase(state)`

→ 详见 references/maintenance-invariants.md

---

## 8. Knowledge Backflow

- `/forge plan` Research：必须搜索知识库（solutions tags + instincts Tags）
- `/forge build` 每任务：自动匹配 instincts.md 注入 Subagent 上下文
- `/forge debug` Phase 2：自动搜索 solutions 踩坑
- 回流被采用：confidence +0.05（上限 0.9）；无效：-0.1（下限 0.3）
- 失败模式（2+ 次）写入 `.forge/knowledge/known-failures.md`
- 每次 learn 完成写 `sessions/<date>-<topic>.md`（≤20 行）

→ 详见 references/knowledge-backflow.md

---

## 9. Execution Flow

21 步执行流程（维护 → 回流 → 质量分析 → 五维度提取 → 文档生成 → 模式识别 → Glossary → 规则蒸馏 → Episode → Evolution → 归档）+ Task Archival：

→ 详见 references/knowledge-format.md §9

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

→ 详见 references/examples.md
