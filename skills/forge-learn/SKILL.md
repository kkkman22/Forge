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

## 1. 概述

`/forge learn` 是 Forge 工作流的知识沉淀阶段——把一次性的开发经验转化为可复用的知识资产。它以 Subagent 模式从五个维度提取知识，将解决方案文档化，将高频模式写入直觉库，并自动维护知识库的健康度。

**核心原则**：完成即沉淀。每次开发都是一次学习机会，不沉淀的经验等于没有发生过。

---

## 2. 执行质量分析（闭环反馈）

在知识提取之前，先对本次开发的执行质量进行结构化分析。

### 分析数据源

| 数据源 | 分析内容 |
|--------|---------|
| `.forge/progress/<topic>.md` | 一次通过/反复失败/阻塞的任务 |
| `.forge/reviews/<topic>.md` | P0/P1 数量和反复出现的问题类型 |
| `.forge/debug/<topic>.md` | 是否触发 debug 及根因 |
| `.forge/plans/<topic>.md` | 预估时间 vs 实际时间偏差 |
| `.forge/specs/<feature>/spec.md` | 场景覆盖率、Scope Creep |

**函数调用**：`analyzeSkillFeedback(entries)`
- 参数：`entries` — 从 `.forge/knowledge/skill-feedback.md` 解析的反馈条目数组（`SkillFeedbackEntry[]`，每条含 command、scenario、suggestion、frequency）
- 返回：`{ commandStats: CommandStats[], alertCommands: string[], totalEntries: number }`
- 用途：识别高失败率命令和不适用 SKILL 场景，`alertCommands` 中的命令需审阅对应 SKILL.md

**函数调用**：`crossValidateFailures(feedbackReasons, knownFailureDescriptions)`
- 参数：`feedbackReasons` — 从 `analyzeSkillFeedback` 结果中提取的失败原因（`string[]`）；`knownFailureDescriptions` — 从 `.forge/knowledge/known-failures.md` 解析的已知失败描述（`string[]`）
- 返回：交叉验证后的重复失败原因列表（`string[]`）
- 用途：确认反复出现的失败模式是否已在 known-failures 中记录，未记录的新模式应添加

### 分析维度

| 维度 | 指标 | 计算方式 |
|------|------|---------|
| **一次通过率** | 无需返工即完成的比率 | 一次通过任务数 / 总任务数 |
| **Plan 准确度** | 预估与实际偏差 | 实际总耗时 / 预估总耗时 |
| **Review 拦截率** | 问题密度 | (P0 + P1) / 总任务数 |
| **Debug 触发率** | debug 频率 | 触发次数 / 总任务数 |

### 分析输出格式

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

### 改进信号驱动知识提取

分析的**改进信号**直接作为五维度知识提取的输入：反复失败 → 踩坑记录；Plan 偏差大 → 可复用模式；Review 高频问题 → 直觉模式；Debug 根因 → 解决方案。

### 指标持久化

将本次会话指标追加到 `.forge/knowledge/metrics.md`：命令使用统计、路由准确度、四维度执行质量趋势、验证命令健康度。`/forge plan` Research 阶段可读取历史指标校准预估。

---

## 3. 五维度知识提取

以 **Subagent 模式**启动知识提取，每个维度由独立 Subagent 处理。

| 维度 | 提取内容 | 数据来源 |
|------|---------|---------|
| **问题模式** | 问题类型、触发条件、影响范围 | `.forge/debug/`、`.forge/progress/`（阻塞项） |
| **解决方案** | 最终方案、实现思路、选型理由 | `.forge/plans/`、代码变更、`.forge/findings/` |
| **踩坑记录** | 弯路、失败尝试、误导性线索 | `.forge/debug/`、`.forge/progress/`（失败记录） |
| **决策理由** | 决策上下文、权衡过程、否决方案 | `.forge/decisions/`、`.forge/specs/` |
| **可复用模式** | 可复用的代码/架构/流程模式 | 代码变更、`.forge/specs/`、`.forge/plans/` |

**函数调用**：`generateKnowledgeDocument(title, tags, date, confidence, body)`
- 参数：`title` — 知识标题（string）；`tags` — 标签数组（`string[]`）；`date` — 日期字符串（YYYY-MM-DD）；`confidence` — 置信度（0.3-0.9）；`body` — 五章节内容对象（含 `problem`、`solution`、`pitfalls`、`decisions`、`reusable`）
- 返回：完整的 `KnowledgeDocument` 对象（含 frontmatter 和结构化正文）
- 用途：从五维度提取结果生成标准格式的知识文档，写入 `.forge/knowledge/solutions/<topic>.md`

**函数调用**：`validateKnowledgeFrontmatter(frontmatter)`
- 参数：`frontmatter` — 待验证的 frontmatter 对象（含 title、tags、date、confidence 字段）
- 返回：`{ valid: boolean, errors: string[] }`
- 用途：写入前验证 frontmatter 格式合规（title 非空、tags 非空数组、date 为有效日历日期、confidence 在 0.3-0.9 范围）

---

## 4. SKILL 反馈检测

五维度提取后，检测 SKILL.md 指导是否有不适用的场景。

| 信号 | 含义 | 示例 |
|------|------|------|
| TDD 被合理跳过 | 某些任务不适合严格 TDD | 纯文档、配置修改、数据迁移 |
| Subagent 自检不适用 | 特定场景下无意义 | 非棕地项目的 Delta 检查 |
| 路由建议被覆盖 | AI 复杂度判断不准 | AI 建议全量但用户选标准 |
| Review 层级不匹配 | 某些评审维度不适用 | 纯后端项目的可访问性检查 |

不适用的场景记录到 `.forge/knowledge/skill-feedback.md`（含涉及命令、场景、建议、频次）。同一类反馈频次 ≥ 3 时提醒用户审阅 SKILL.md。**不自动修改** SKILL.md——只记录和提醒。

---

## 5. 知识文档格式

### 知识库分层架构

| 层级 | 目录 | 生命周期 | 用途 |
|------|------|---------|------|
| **会话层** | `sessions/` | 单次会话 | `/forge resume` 恢复上下文 |
| **项目层** | `solutions/` + `instincts.md` | 项目级持久 | plan/build/debug 回流 |
| **跨项目层** | `patterns/` | 跨项目持久 | 通用模式（手动迁移，上限 10 个） |

### YAML Frontmatter

```yaml
---
title: "<知识标题>"
tags: ["tag1", "tag2"]
date: "YYYY-MM-DD"
confidence: 0.85
---
```

### 置信度评分规则

| 分数 | 含义 |
|------|------|
| 0.3-0.4 | 初步观察，仅一次验证 |
| 0.5-0.6 | 2-3 次验证 |
| 0.7-0.8 | 多次验证，稳定可靠 |
| 0.9 | 大量实践验证的成熟模式（上限，不用 1.0） |

下限 0.3：低于此值不值得记录。

### 正文结构

知识文档包含五个章节：问题模式、解决方案、踩坑记录、决策理由、可复用模式。

输出路径：`.forge/knowledge/solutions/<topic>.md`（kebab-case）。

---

## 6. 高频模式与 instincts.md

### 6.1 高频模式识别

同一模式在 2+ 知识文档中出现且 confidence ≥ 0.5 时，提升为"直觉"。

### 6.2 instincts.md 格式

每个模式包含：标题、Confidence_Score（0.3-0.9）、Tags、来源、描述。

### 6.3 跨项目模式提升

模式 confidence ≥ 0.8、不依赖特定技术栈、描述通用工程实践时，建议用户提升到 `patterns/`。

### 6.4 Confidence_Score 范围

instincts.md 中每个模式必须在 **0.3 至 0.9** 范围内。

### 6.5 Error-Prevention Rule Distillation（错误预防规则蒸馏）

从积累的知识数据中蒸馏出"错误预防规则"——Claude 在没有明确指导时会犯错的高价值模式。规则写入 `.forge/knowledge/evolved-rules.md`（最多 15 条），通过 SessionStart hook 注入上下文。

**核心原则**：只添加"没有这条规则 Claude 就会犯错"的规则——不是知识转储。

#### 6.5.1 数据源

| 数据源 | 文件路径 | 提取内容 |
|--------|---------|---------|
| 已知失败模式 | `.forge/knowledge/known-failures.md` | occurrence >= 3 的失败模式 |
| 直觉模式 | `.forge/knowledge/instincts.md` | confidence >= 0.8 的经验法则 |
| SKILL 反馈 | `.forge/knowledge/skill-feedback.md` | frequency >= 3 的不适用的 SKILL 指导 |
| 执行指标 | `.forge/knowledge/metrics.md` | 连续 3+ 会话退化趋势 |
| 会话日志 | `.forge/knowledge/sessions/*.md` | 同一问题在 3+ 会话中出现 |

#### 6.5.2 蒸馏算法

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

#### 6.5.3 转换过程

每条达标知识转为规则候选：(1) 提取原始模式 (2) 蒸馏为可执行规则声明 (3) 声明防止的具体错误 (4) 继承置信度 (5) 设置 last_triggered。

#### 6.5.4 阈值条件

| 类别 | 数据源 | 阈值 |
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

## 7. 知识库维护

### 7.1 文档数量上限

`solutions/` 上限 20 个（config.md `knowledge_limit` 可配置）。超限时按 confidence 从低到高删除。

### 7.2 低置信度自动清理

instincts.md 中 Confidence_Score < 0.3 的模式自动删除。每次 learn 执行时先维护。

### 7.3 高重叠文档合并

写入前检测 tags 重叠度（共同 tags / min(tags 数)）。≥ 50% 时合并到已有文档，更新 date、提升 confidence（+0.1，上限 0.9）、合并 tags。

### 7.4 维护不变量

维护完成后必须满足：(1) 文档数 ≤ 上限 (2) 无低置信度模式。

**函数调用**：`maintainKnowledgeBase(state)`
- 参数：`state` — 当前知识库状态（`KnowledgeBaseState` 类型，含 `documents` 数组、`instinctPatterns` 数组、`limit` 数量上限）
- 返回：`MaintenanceResult`（含保留/移除的文档和模式列表，及维护后的不变量校验结果）
- 用途：执行文档上限和置信度下限不变量检查，超限文档按 confidence 从低到高清理，低置信度模式（< 0.3）自动删除

---

## 8. 知识回流

### 8.1 Plan 阶段回流（强制）

`/forge plan` Research 步骤**必须**搜索知识库：匹配 solutions/ tags 和 instincts.md Tags，将相关经验注入 Research Findings。知识库为空时提示但不阻断。

### 8.2 Build 阶段回流（自动）

`/forge build` 每个任务自动匹配 instincts.md Tags，注入 Subagent 上下文作为实现参考。

### 8.3 Debug 阶段回流（自动）

`/forge debug` Phase 2 自动搜索 solutions/ 踩坑记录，匹配时直接展示历史方案。

### 8.4 回流效果追踪

每次回流被实际采用时更新 confidence：有效 → +0.05（上限 0.9）；无效 → -0.1（下限 0.3）。未采用则不变。

### 8.5 已知失败模式记录

反复出现的失败模式（2+ 次）记录到 `.forge/knowledge/known-failures.md`（模式/触发条件/根因/解决方案/出现次数/置信度）。已有相同模式则更新次数。build 的 Closure-First 探针和 debug Phase 2 自动搜索此文件。

### 8.6 会话日志

每次 learn 完成后写入 `.forge/knowledge/sessions/<date>-<topic>.md`（≤20 行，含摘要/关键决策/验证结果/下次建议）。`/forge resume` 优先读取最近 3 条恢复上下文。

---

## 9. 执行流程

1. **知识库维护**：清理低置信度、检查上限
2. **回流效果追踪**：更新已引用知识的 confidence
3. **执行质量分析**：四维度评估 + 改进信号
4. **指标更新**：写入 metrics.md
5. **五维度提取**：Subagent 模式（以改进信号为输入）
6. **SKILL 反馈检测**：检查不适用的 SKILL.md 指导
7. **生成知识文档**：YAML frontmatter + 五章节
8. **重叠检测**：≥ 50% 合并，< 50% 创建新文档
9. **高频模式识别**：达到阈值则写入 instincts.md
10. **跨项目模式检测**：建议提升到 patterns/
11. **错误预防规则蒸馏**：4 数据源 → 阈值过滤 → 排除 → 冲突 → 容量 → 提案 → 写入
12. **上下文预算报告**：调用 `serializeContextBudgetReport(report)` — 参数 `report` 构造方式：`date` 从当前日期获取，`topic` 从 `.forge/status.md` 的 `current_task` 获取，`trimStats` 从本次会话的裁剪前后数据估算（各 trimmer 调用次数和节省 token 数），`totalEstimatedTokens` 为会话总消耗估算；返回：结构化报告字符串。将报告追加到 `.forge/knowledge/sessions/<date>-<topic>.md` 的附录
13. **会话层清理**：归档 sessions/ 中的当前会话
14. **再次检查上限**：确保维护不变量成立

### 9.1 任务归档（learn 完成后自动执行）

知识沉淀完成后，自动将任务制品**复制**归档到 `.forge/archive/<date>-<topic>/`。

| 源路径 | 归档路径 |
|--------|---------|
| `.forge/decisions/<topic>.md` | `archive/<date>-<topic>/decisions/` |
| `.forge/specs/<feature>/` | `archive/<date>-<topic>/specs/` |
| `.forge/plans/<topic>.md` | `archive/<date>-<topic>/plans/` |
| `.forge/progress/<topic>.md` | `archive/<date>-<topic>/progress/` |
| `.forge/reviews/<topic>.md` | `archive/<date>-<topic>/reviews/` |
| `.forge/debug/<topic>.md` | `archive/<date>-<topic>/debug/` |

归档后更新 `.forge/status.md` phase 为 `"completed"`。不归档 knowledge/ 和 config.md。

---

## 10. 边界情况处理

| 场景 | 处理方式 |
|------|---------|
| 首次执行（空知识库） | 创建 solutions/ 和 instincts.md，输出提示 |
| 无可提取知识 | 提示本次较简单，未识别到新知识 |
| 知识库已满 | 新文档 confidence 高于最低文档时提示替换确认 |
| 无 `.forge/` 目录 | 提示先运行 `forge init` |

---

## 11. 示例

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
