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

在知识提取之前，先对本次开发的执行质量进行结构化分析。这是从 OpenSpace 的 Post-Execution Analyzer 借鉴的闭环反馈机制——不只是提取知识，还要分析执行本身的质量，让分析结果驱动后续改进。

### 2.1 分析数据源

| 数据源 | 分析内容 |
|--------|---------|
| `.forge/progress/<topic>.md` | 哪些任务一次通过？哪些反复失败？哪些被阻塞？ |
| `.forge/reviews/<topic>.md` | 评审发现了多少 P0/P1？哪些是反复出现的问题类型？ |
| `.forge/debug/<topic>.md` | 是否触发了 debug？根因是什么？ |
| `.forge/plans/<topic>.md` | Plan 的预估时间 vs 实际时间偏差多大？ |
| `.forge/specs/<feature>/spec.md` | Spec 的场景覆盖率如何？有无 Scope Creep？ |

### 2.2 分析维度

对本次执行进行四维度评估，输出结构化的执行质量报告：

| 维度 | 指标 | 计算方式 |
|------|------|---------|
| **一次通过率** | 任务无需返工即完成的比率 | `一次通过的任务数 / 总任务数` |
| **Plan 准确度** | 计划预估与实际执行的偏差 | `实际总耗时 / 预估总耗时`（越接近 1.0 越好） |
| **Review 拦截率** | 评审发现的问题密度 | `(P0 + P1 数量) / 总任务数` |
| **Debug 触发率** | 进入 debug 模式的频率 | `触发 debug 的次数 / 总任务数` |

### 2.3 分析输出格式

```
📊 执行质量分析

━━━ 执行概况 ━━━
  总任务数：5
  一次通过：4/5（80%）
  返工任务：Task 3（连续失败 2 次后通过）
  Debug 触发：0 次

━━━ Plan 准确度 ━━━
  预估总耗时：17 min
  实际总耗时：22 min
  偏差率：1.29（偏高 29%）
  偏差最大的任务：Task 3（预估 3 min，实际 8 min）

━━━ Review 质量 ━━━
  P0：0 个
  P1：1 个（缺少鉴权中间件）
  P2：2 个
  拦截率：0.2（每 5 个任务 1 个 P1）

━━━ 改进信号 ━━━
  ⚠️ Task 3 反复失败：路由注册模式不熟悉 → 建议沉淀为知识
  ⚠️ Plan 预估偏差 > 20%：复杂任务的预估需要更多缓冲
  ✅ 无 Debug 触发：执行流程顺畅
```

### 2.4 改进信号驱动知识提取

分析输出的**改进信号**直接作为五维度知识提取的输入上下文：

- 反复失败的任务 → 优先提取为"踩坑记录"和"问题模式"
- Plan 预估偏差大的任务 → 提取为"可复用模式"（如"涉及路由注册的任务预估应 ×1.5"）
- Review 高频问题类型 → 提取为"直觉模式"（如"新增 API 路由必须检查鉴权"）
- Debug 触发的根因 → 优先提取为"解决方案"

这确保知识提取不是盲目的——它聚焦于本次执行中真正暴露的问题。

### 2.5 指标持久化

执行质量分析完成后，将本次会话的指标追加到 `.forge/knowledge/metrics.md`：

1. **命令使用统计**：更新本次会话中每个 forge 命令的调用次数和成功/失败计数。
2. **路由准确度**：如果本次使用了 `/forge` 路由，记录 AI 建议的档位和用户最终选择的档位。
3. **执行质量趋势**：追加一行本次会话的四维度指标（一次通过率、Plan 偏差率、Review 拦截率、Debug 触发率）。
4. **验证命令健康度**：更新本次会话中使用的验证命令的成功/失败计数（从 tool-health 数据汇总）。

**指标更新输出**：

```
📈 指标更新

  命令统计：build +5, review +1, test +1
  路由准确度：标准路径，用户接受（准确）
  执行质量：一次通过率 80%, Plan 偏差 1.15, Review 拦截 0.2, Debug 0
  已写入 .forge/knowledge/metrics.md
```

**指标的价值**：随着会话积累，metrics.md 形成趋势数据。`/forge plan` 在 Research 阶段可以读取历史指标，为预估时间提供校准参考（如"历史 Plan 偏差率平均 1.3，建议预估 ×1.3"）。

---

## 3. 五维度知识提取

以 **Subagent 模式**启动知识提取，每个维度由独立的 Subagent 处理，确保提取的深度和隔离性。

| 维度 | 提取内容 | 数据来源 |
|------|---------|---------|
| **问题模式** | 本次遇到的问题类型、触发条件、影响范围 | `.forge/debug/`、`.forge/progress/`（阻塞项） |
| **解决方案** | 最终采用的解决方案、关键实现思路、技术选型理由 | `.forge/plans/`、代码变更、`.forge/findings/` |
| **踩坑记录** | 走过的弯路、失败的尝试、误导性的线索 | `.forge/debug/`、`.forge/progress/`（失败记录） |
| **决策理由** | 关键决策的上下文、权衡过程、否决的替代方案 | `.forge/decisions/`、`.forge/specs/` |
| **可复用模式** | 可在其他项目中复用的代码模式、架构模式、流程模式 | 代码变更、`.forge/specs/`、`.forge/plans/` |

**Subagent 模式的意义**：每个维度的提取需要不同的分析视角。Subagent 隔离确保每个维度的分析不会被其他维度的上下文干扰，提取结果更聚焦。

---

## 4. SKILL 反馈检测

五维度提取完成后，检测本次执行中 Forge 的 SKILL.md 指导是否有不适用的场景。这是从 OpenSpace 的自进化机制借鉴的——技能不应该是静态的，当指导反复不适用时应该被记录和改进。

**检测逻辑**：

回顾本次执行中的以下信号：

| 信号 | 含义 | 示例 |
|------|------|------|
| TDD 铁律被合理跳过 | 某些任务类型不适合严格 TDD | 纯文档生成、配置文件修改、数据迁移脚本 |
| Subagent 自检项不适用 | 某些自检在特定场景下无意义 | 非棕地项目的 Delta 检查 |
| 路由建议被用户覆盖 | AI 的复杂度判断不准确 | AI 建议全量但用户选择标准 |
| Review 层级不匹配 | 某些评审维度在特定项目中不适用 | 纯后端项目的可访问性检查 |

**反馈记录**：

如果检测到不适用的场景，记录到 `.forge/knowledge/skill-feedback.md`：

```markdown
---
updated: "YYYY-MM-DD"
---

## SKILL 反馈记录

### 2025-01-15：TDD 铁律在数据迁移任务中过于严格

**涉及命令**：/forge build
**场景**：数据迁移脚本是一次性的，严格 TDD 增加了不必要的开销
**建议**：对一次性脚本类任务，允许简化的验证流程（运行脚本 + 检查结果）
**频次**：1

### 2025-01-10：路由器对文档类任务的判定偏重

**涉及命令**：/forge（路由器）
**场景**：纯文档编写任务被建议全量路径，但实际只需标准路径
**建议**：增加"文档类任务"信号，默认建议标准路径
**频次**：2
```

**反馈积累与提醒**：

当同一类反馈的频次达到 **3 次**时，在 learn 输出中提醒用户：

```
💡 SKILL 反馈提醒

以下 SKILL.md 指导已被标记为不适用 3 次以上：
  - /forge build 的 TDD 铁律在一次性脚本任务中过于严格（3 次）

建议审阅并考虑调整 SKILL.md 中的相关规则。
反馈详情见 .forge/knowledge/skill-feedback.md
```

**注意**：SKILL 反馈机制**不自动修改** SKILL.md——它只记录和提醒。SKILL.md 的修改权在用户手中。

---

## 5. 知识文档格式

### 知识库分层架构

`.forge/knowledge/` 目录采用三层架构，不同层级的知识有不同的生命周期和用途：

| 层级 | 目录 | 生命周期 | 用途 |
|------|------|---------|------|
| **会话层** | `.forge/knowledge/sessions/` | 单次会话 | 当前开发会话的临时上下文，供 `/forge resume` 恢复使用 |
| **项目层** | `.forge/knowledge/solutions/` + `instincts.md` | 项目级持久 | 已验证的解决方案和高频模式，供 plan/build/debug 回流 |
| **跨项目层** | `.forge/knowledge/patterns/` | 跨项目持久 | 可在不同项目间复用的通用模式（手动迁移） |

**会话层**（`sessions/`）：
- 每次 `/forge` 启动时创建 `sessions/<date>-<topic>.md`
- 记录当前会话的关键决策点、中间状态、恢复所需的上下文
- `/forge resume` 优先读取此层恢复会话
- 会话结束后（ship 或 learn 完成），自动归档或清理

**项目层**（`solutions/` + `instincts.md`）：
- 这是现有的知识系统，保持不变
- 由 `/forge learn` 写入，由 plan/build/debug 回流读取

**跨项目层**（`patterns/`）：
- 存储从多个项目中提炼的通用模式（如"所有 REST API 都应有分页"）
- 不自动写入——由 `/forge learn` 在识别到跨项目适用的模式时建议用户手动提升
- 格式与 `solutions/` 相同，但 tags 中必须包含 `cross-project`
- 文档数量上限为 10（通用模式应该少而精）

### YAML Frontmatter

```yaml
---
title: "<知识标题>"
tags: ["tag1", "tag2", "tag3"]
date: "YYYY-MM-DD"
confidence: 0.85
---
```

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| `title` | string | 知识标题，简洁描述核心内容 | 必填 |
| `tags` | string[] | 标签列表，用于检索和分类 | 必填，至少 1 个 |
| `date` | string | 创建日期，YYYY-MM-DD 格式 | 必填 |
| `confidence` | number | 置信度评分，基于实际应用结果 | 必填，范围 0.3-0.9 |

**置信度评分规则**：

| 分数范围 | 含义 | 说明 |
|---------|------|------|
| 0.3-0.4 | 初步观察 | 仅在一次开发中观察到，尚未验证 |
| 0.5-0.6 | 有一定信心 | 在 2-3 次开发中验证过 |
| 0.7-0.8 | 高度可信 | 多次验证，稳定可靠 |
| 0.9 | 近乎确定 | 经过大量实践验证的成熟模式 |

**置信度下限 0.3**：低于 0.3 的模式不值得记录，噪音大于信号。

**置信度上限 0.9**：不使用 1.0，因为没有绝对确定的模式——环境变化可能使任何模式失效。

### 正文结构

```markdown
---
title: "异步导出的超时处理模式"
tags: ["async", "export", "timeout", "error-handling"]
date: "2025-01-15"
confidence: 0.7
---

## 问题模式

<描述遇到的问题类型、触发条件和影响范围>

## 解决方案

<描述最终采用的解决方案和关键实现思路>

## 踩坑记录

<描述走过的弯路和失败的尝试>

## 决策理由

<描述关键决策的上下文和权衡过程>

## 可复用模式

<提炼可在其他项目中复用的模式>
```

### 输出路径

知识文档输出到：`.forge/knowledge/solutions/<topic>.md`

`<topic>` 使用 kebab-case 格式，从本次开发的主题中提取，如 `order-batch-export`、`email-verification-timeout`。

---

## 6. 高频模式与 instincts.md

### 6.1 高频模式识别

当某个模式在多次开发中反复出现时，将其提升为"直觉"——不需要每次重新推导的经验法则。

**识别标准**：

- 同一模式在 2 次以上的知识文档中出现
- 模式的置信度 ≥ 0.5

### 6.2 instincts.md 格式

```markdown
---
updated: "YYYY-MM-DD"
---

## 模式列表

### 异步操作必须有超时机制

**Confidence_Score**: 0.8
**Tags**: async, timeout, error-handling
**来源**: order-batch-export, report-generation

任何异步操作（导出、邮件发送、外部 API 调用）都必须设置超时时间。
没有超时的异步操作 = 潜在的资源泄漏。

### 数据库迁移前必须备份

**Confidence_Score**: 0.9
**Tags**: database, migration, safety
**来源**: user-system-upgrade, schema-refactor

生产环境的数据库迁移前，必须创建备份并验证备份可恢复。
```

### 6.3 跨项目模式提升

当某个模式满足以下条件时，建议用户将其提升到跨项目层（`patterns/`）：

- 模式的 Confidence_Score ≥ 0.8
- 模式不依赖特定项目的技术栈或业务逻辑
- 模式描述的是通用的工程实践或架构原则

**提升提示**：

```
💡 跨项目模式候选

以下模式可能适用于其他项目：
  - "异步操作必须有超时机制"（confidence: 0.8，已在 3 个任务中验证）

是否提升到跨项目模式库？(y/n)
提升后将写入 .forge/knowledge/patterns/async-timeout.md
```

### 6.4 Confidence_Score 范围

instincts.md 中每个模式的 Confidence_Score 必须在 **0.3 至 0.9** 范围内：

- **0.3**：最低可接受的置信度，低于此值的模式应被清理
- **0.9**：最高置信度，表示经过大量实践验证

### 6.5 Error-Prevention Rule Distillation（错误预防规则蒸馏）

跨项目模式检测完成后，从积累的知识数据中蒸馏出"错误预防规则"——Claude 在没有明确指导时会犯错的高价值模式。蒸馏出的规则写入 `.forge/knowledge/evolved-rules.md`（最多 15 条），在每次会话开始时通过 SessionStart hook 注入 Claude 上下文。

**核心原则**：只添加"没有这条规则 Claude 就会犯错"的规则——不是知识转储。

#### 6.5.1 数据源

规则蒸馏从以下四个数据源 + 会话日志中提取候选：

| 数据源 | 文件路径 | 提取内容 |
|--------|---------|---------|
| 已知失败模式 | `.forge/knowledge/known-failures.md` | 反复出现的失败模式（occurrence >= 3） |
| 直觉模式 | `.forge/knowledge/instincts.md` | 高置信度的经验法则（confidence >= 0.8） |
| SKILL 反馈 | `.forge/knowledge/skill-feedback.md` | 反复不适用的 SKILL 指导（frequency >= 3） |
| 执行指标 | `.forge/knowledge/metrics.md` | 质量维度的退化趋势（连续 3+ 会话退化） |
| 会话日志 | `.forge/knowledge/sessions/*.md` | 跨会话重复出现的同一问题（3+ 会话） |

#### 6.5.2 蒸馏算法

```
1. READ evolved-rules.md → current_rules[], rule_count, max_rules
2. READ known-failures.md → failures[]
3. READ instincts.md → instincts[]
4. READ skill-feedback.md → feedback[]
5. READ metrics.md → metrics_history[]
6. SCAN session journals → cross_session_issues[]

7. candidates = []
8. FOR each failure WHERE occurrence >= 3:
     candidates.push(transform(failure))
9. FOR each instinct WHERE confidence >= 0.8:
     candidates.push(transform(instinct))
10. FOR each feedback WHERE frequency >= 3:
      candidates.push(transform(feedback))
11. FOR each cross_session_issue WHERE sessions >= 3:
      candidates.push(transform(cross_session_issue))
12. FOR each metric_dimension WHERE degradation_trend >= 3 sessions:
      candidates.push(friction_adjustment(metric_dimension))

13. IF candidates is empty:
      OUTPUT "No qualifying entries found. Skipping rule distillation."
      RETURN

14. FOR each candidate:
      a. APPLY exclusion filter (architecture, file paths, best practices, raw data, tool standards)
      b. APPLY conflict detection against current_rules[]
      c. IF conflict found: mark candidate with conflict info
      d. APPLY capacity check: if rule_count >= max_rules, identify lowest-value rule for retirement

15. PRESENT proposals to user (including conflicts and retirement suggestions)
16. FOR each approved proposal:
      a. WRITE rule to evolved-rules.md
      b. UPDATE rule_count frontmatter
      c. APPEND entry to rule-changelog.md
      d. IF retirement: REMOVE retired rule, APPEND retirement entry to changelog
```

#### 6.5.3 转换过程（transform）

每个达到阈值的知识条目通过以下步骤转换为规则候选：

```
1. EXTRACT raw pattern — 从知识条目中提取原始模式
2. DISTILL into concise rule statement — 蒸馏为一句可执行的规则声明
3. DECLARE what specific error the rule prevents — 声明该规则防止的具体错误（可测试的失败场景）
4. ASSIGN confidence — 从源条目继承置信度
5. SET last_triggered — 设置为当前日期
```

**转换示例**：

| 源数据 | 转换结果 |
|--------|---------|
| known-failures: "异步导出未设超时，导致连接池耗尽"（occurrence: 4） | **Content**: 所有异步导出操作必须设置 30 秒超时<br/>**Prevents**: 异步导出无超时导致连接池耗尽和服务不可用 |
| instincts: "数据库迁移前必须备份"（confidence: 0.9） | **Content**: 执行数据库迁移前必须创建备份并验证可恢复<br/>**Prevents**: 迁移失败时无法回滚导致数据丢失 |
| skill-feedback: "TDD 铁律在数据迁移任务中过于严格"（frequency: 3） | **Content**: 一次性数据迁移脚本使用简化验证流程（运行 + 检查结果）<br/>**Prevents**: 对一次性脚本强制 TDD 导致不必要的开销和延迟 |

#### 6.5.4 阈值条件

五类知识条目的蒸馏阈值：

| 类别 | 数据源 | 阈值 | 说明 |
|------|--------|------|------|
| 项目特定陷阱 | known-failures.md | occurrence >= 3 | 同一失败模式出现 3 次以上 |
| 重复纠正模式 | instincts.md | confidence >= 0.8 | 高置信度的直觉模式 |
| 环境/工具怪癖 | skill-feedback.md | frequency >= 3 | 同一 SKILL 反馈出现 3 次以上 |
| 跨会话行为纠正 | session journals | 同一问题出现在 3+ 会话 | 扫描会话日志识别重复问题 |
| 规则摩擦调整 | metrics.md | 连续 3+ 会话退化趋势 | 某质量维度持续下降，可能由现有规则引起 |

**静默通过**：如果没有任何知识条目达到阈值，输出提示并跳过蒸馏阶段：

```
ℹ️ No qualifying entries found. Skipping rule distillation.
```

#### 6.5.5 排除过滤器

以下内容**不是**有效的规则候选，即使达到阈值也必须排除：

- **架构描述**：可从代码推断的架构信息
- **文件路径列表**：项目结构信息
- **通用最佳实践**：Claude 已经知道的通用知识
- **原始知识数据**：属于知识文件而非规则的原始数据
- **工具已执行的标准**：已由现有工具（如 Biome 代码风格）执行的标准

#### 6.5.6 冲突检测

生成候选后，必须与 evolved-rules.md 中的现有规则进行冲突检测：

1. 比较新候选的 `Prevents` 声明与现有规则的 `Prevents` 声明。
2. 如果两条规则引用**同一系统组件**且有**矛盾的指令**，标记为冲突。
3. 冲突候选在提案中标注冲突信息，由用户选择：
   - 保留现有规则
   - 替换为新规则
   - 同时保留两条

**冲突提示**：

```
⚠️ 规则冲突检测

新提案与现有规则冲突：
  现有：R3 — 所有 API 调用使用 10 秒超时
  新提案：外部支付 API 调用使用 60 秒超时

两条规则引用同一组件（API 超时），但指令矛盾。
选择：(1) 保留现有  (2) 替换为新规则  (3) 同时保留
```

#### 6.5.7 容量管理与退役

evolved-rules.md 最多容纳 **15 条规则**。当规则数达到上限时：

1. 计算每条现有规则的**价值分数**：

```
value = confidence × recency_factor

recency_factor:
  - 最近 2 个会话内触发过: 1.0
  - 3-4 个会话前触发: 0.7
  - 5+ 个会话前触发（陈旧）: 0.3
```

2. 价值分数最低的规则成为退役候选。
3. 如果新提案的置信度低于所有现有规则，跳过该提案并记录原因。

**退役提示**：

```
📋 规则退役建议

evolved-rules.md 已满（15/15）。
为添加新规则，建议退役价值最低的规则：

  R7: "CSS Grid 布局优先于 Flexbox 用于页面级布局"
  confidence: 0.5, last_triggered: 8 sessions ago
  value = 0.5 × 0.3 = 0.15

退役此规则以腾出空间？(y/n)
```

#### 6.5.8 陈旧检测

每次蒸馏阶段执行时，扫描 evolved-rules.md 中所有规则的 `last_triggered` 字段：

- 如果 `last_triggered` 距今超过 **5 个会话**（通过计算 `.forge/knowledge/sessions/` 目录中的条目数确定），标记为陈旧候选。
- 陈旧规则包含在退役提案中，向用户展示陈旧原因。
- 用户可以选择退役陈旧规则或保留（如果认为规则仍有价值）。

**陈旧检测输出**：

```
🕐 陈旧规则检测

以下规则超过 5 个会话未被触发：
  R4: "批量导入必须使用事务包裹"（last_triggered: 7 sessions ago）
  R9: "日志输出使用结构化 JSON 格式"（last_triggered: 5 sessions ago）

建议审阅并考虑退役。
```

#### 6.5.9 提案展示与审批

所有候选经过排除过滤、冲突检测和容量检查后，以提案形式展示给用户：

```
📋 Rule Proposal #1

  Title: 异步导出必须设置超时
  Content: 所有异步导出操作必须设置 30 秒超时，防止连接池耗尽
  Prevents: 异步导出无超时导致连接池耗尽和服务不可用
  Source: known-failures.md — "异步导出超时" (occurrence: 4)
  Confidence: 0.75

  Approve? (y/n)
```

**审批规则**：

- 每条提案独立审批，用户可以逐条选择
- 被拒绝的提案不写入，不记录（下次蒸馏时如果仍达阈值会再次提出）
- 所有提案被拒绝时，不修改 evolved-rules.md，直接进入下一阶段

#### 6.5.10 写入与变更日志

用户批准提案后：

1. **写入规则**：将规则追加到 evolved-rules.md，使用 `### R{N}: {title}` 格式
2. **更新 frontmatter**：更新 `rule_count` 和 `updated` 字段
3. **记录变更**：在 `.forge/knowledge/rule-changelog.md` 追加条目

```markdown
### 2025-01-15 — added: R5 异步导出必须设置超时

**Action**: added
**Source**: known-failures.md — "异步导出超时" (occurrence: 4)
**Confidence**: 0.75
**Reason**: 同一失败模式出现 4 次，蒸馏为错误预防规则
```

4. **退役写入**（如有）：从 evolved-rules.md 移除退役规则，在 changelog 追加退役条目

```markdown
### 2025-01-15 — retired: R7 CSS Grid 布局优先于 Flexbox

**Action**: retired
**Source**: staleness — 8 sessions since last triggered
**Confidence**: 0.5
**Reason**: 超过 5 个会话未被触发，价值分数 0.15（最低）
```

---

## 7. 知识库维护

### 7.1 文档数量上限

`.forge/knowledge/solutions/` 目录下的文档数量上限为 **20 个**（可通过 `.forge/config.md` 中的 `knowledge_limit` 字段配置）。

**超限处理**：

1. 按 `confidence` 从低到高排序。
2. 删除置信度最低的文档，直到文档数 ≤ 上限。
3. 输出清理报告：

```
🧹 知识库维护

文档数量超过上限（22/20），已清理 2 个低置信度文档：
  - removed: async-retry-pattern.md (confidence: 0.3)
  - removed: css-grid-layout.md (confidence: 0.35)

当前文档数：20/20
```

### 7.2 低置信度自动清理

当 instincts.md 中存在 Confidence_Score 低于 0.3 的模式时，自动清理该模式。

**清理规则**：

- 扫描 instincts.md 中所有模式的 Confidence_Score。
- 删除 Confidence_Score < 0.3 的模式。
- 更新 instincts.md 的 `updated` 日期。

**清理时机**：每次 `/forge learn` 执行时，在写入新知识之前先执行维护。

```
🧹 直觉库维护

已清理 1 个低置信度模式：
  - removed: "前端状态管理用 Redux" (confidence: 0.25)

当前模式数：8
```

### 7.3 高重叠文档合并

在写入新知识文档之前，**必须检查是否与已有文档高度重叠**。同质内容分散在多个文档中会浪费知识库的 20 个名额，挤掉真正有价值的多样性知识。

**重叠检测规则**：

1. 读取新文档的 `tags` 列表。
2. 扫描 `solutions/` 中所有已有文档的 `tags` 列表。
3. 计算 tags 重叠度：`重叠度 = 共同 tags 数 / min(新文档 tags 数, 已有文档 tags 数)`。
4. 如果重叠度 ≥ 50%，判定为高重叠。

**高重叠时的处理**：

合并到已有文档，而非创建新文档：

1. 将新文档的内容追加到已有文档的对应章节（问题模式、解决方案、踩坑记录等）。
2. 更新已有文档的 `date` 为当前日期。
3. 提升已有文档的 `confidence`：`新 confidence = min(旧 confidence + 0.1, 0.9)`。
4. 合并两个文档的 `tags`（去重）。
5. 输出合并报告：

```
🔄 知识合并

新文档与已有文档高度重叠（tags 重叠度：75%）：
  已有：timeout-handling-export.md（confidence: 0.5 → 0.6）
  合并：本次超时处理经验已追加到已有文档

未创建新文档，知识库文档数不变：15/20
```

**无重叠时**：正常创建新文档。

**示例**：

第一次开发导出功能，生成 `timeout-handling-export.md`，tags: `["async", "timeout", "export"]`。
第二次开发 API 调用，提取的知识 tags: `["async", "timeout", "api"]`。
重叠度 = 2（async, timeout）/ min(3, 3) = 67% ≥ 50%。
→ 合并到 `timeout-handling-export.md`，confidence 从 0.5 提升到 0.6，tags 更新为 `["async", "timeout", "export", "api"]`。

### 7.4 维护不变量

在任何维护操作完成后，以下不变量必须成立：

1. **文档数 ≤ 上限**：`solutions/` 目录下的文档数量不超过配置的上限（默认 20）
2. **无低置信度模式**：`instincts.md` 中不存在 Confidence_Score < 0.3 的模式

---

## 8. 知识回流

知识回流是知识系统的核心价值——写入知识只是手段，在后续开发中自动应用才是目的。

### 8.1 Plan 阶段回流（强制）

当 `/forge plan` 执行 Research 步骤时，**必须**搜索知识库：

1. 基于当前任务的关键词，匹配 `solutions/` 中的 `tags` 字段。
2. 基于当前任务涉及的技术领域，匹配 `instincts.md` 中的 `Tags`。
3. 读取所有匹配的知识文档，提取：
   - **踩坑记录**：避免重复踩坑
   - **解决方案**：复用已验证的方案
   - **可复用模式**：直接应用成熟模式
4. 将相关经验**显式注入** Plan 的 Research Findings 章节，标注来源：

```markdown
## Research Findings

### 来自知识库

- **streaming-export-pattern.md**（confidence: 0.75）：超过 10000 条记录的导出应使用流式处理，避免内存溢出
- **instincts.md**：异步操作必须有超时机制（confidence: 0.8）

### 来自代码库分析

- 项目使用 Express + TypeScript + Vitest
- 现有导出功能：无（新功能）
```

**如果知识库为空**，输出提示但不阻断：

```
ℹ️ 知识库为空，跳过历史经验搜索。
```

### 8.2 Build 阶段回流（自动）

当 `/forge build` 执行每个任务时，自动搜索相关的直觉模式：

1. 基于当前任务涉及的技术领域，匹配 `instincts.md` 中的 `Tags`。
2. 将匹配的直觉模式注入 Subagent 的上下文，作为实现参考。
3. **Subagent 指令中必须包含**：

```
参考以下历史经验（来自 .forge/knowledge/instincts.md）：
- 异步操作必须有超时机制（confidence: 0.8）
- 数据库迁移前必须备份（confidence: 0.9）

这些是经过验证的模式，优先采用。如果当前场景不适用，在 progress 中说明原因。
```

### 8.3 Debug 阶段回流（自动）

当 `/forge debug` 执行 Phase 2（模式分析）时，自动搜索知识库：

1. 基于当前错误的关键词，匹配 `solutions/` 中的踩坑记录。
2. 如果找到匹配，直接展示历史解决方案，避免重复调查。

### 8.4 回流效果追踪

每次知识回流被实际采用时，更新对应知识文档的 `confidence`：

- 回流的知识被采用且有效 → confidence += 0.05（上限 0.9）
- 回流的知识被采用但无效 → confidence -= 0.1（下限 0.3）

**追踪时机**：在 `/forge learn` 执行时（§7 执行流程的五维度提取之前），回顾本次开发中 plan 和 build 阶段注入的知识回流记录（记录在 `.forge/progress/<topic>.md` 和 `.forge/findings/<topic>.md` 中），对比实际采用情况，更新对应知识文档的 confidence。

**判定标准**：

| 情况 | confidence 变化 |
|------|----------------|
| plan 引用了某知识，build 中实际采用了该方案且任务成功 | +0.05 |
| plan 引用了某知识，build 中采用了该方案但任务失败/需要调整 | -0.1 |
| plan 引用了某知识，build 中未采用（场景不适用） | 不变 |

这确保知识库的质量随使用而提升。

---

## 8.5 已知失败模式记录

在五维度提取过程中，如果发现**反复出现的失败模式**（同一类错误在本次或历史开发中出现 2 次以上），将其记录到 `.forge/knowledge/known-failures.md`。

**记录格式**：

```markdown
### <失败模式标题>

**模式**：<一句话描述失败的表现>
**触发条件**：<什么情况下会触发>
**根因**：<根本原因>
**解决方案**：<已验证的解决方法>
**首次发现**：YYYY-MM-DD
**出现次数**：N
**置信度**：0.3-0.9
```

**记录规则**：

- 仅记录**反复出现**的失败，一次性的偶发错误不记录
- 如果已有相同模式，更新出现次数和置信度，不重复创建
- `/forge debug` 的根因分析结果是主要数据来源
- `/forge build` 中连续失败 3 次触发升级的场景优先记录

**回流机制**：

- `/forge build` 的 Closure-First 探针阶段自动搜索 known-failures.md
- `/forge debug` 的 Phase 2（模式分析）自动搜索 known-failures.md
- 匹配到已知失败时，直接展示历史解决方案，避免重复调查

---

## 8.6 会话日志（Session Journal）

每次 `/forge learn` 执行完成后，**必须写入一条会话日志**到 `.forge/knowledge/sessions/<date>-<topic>.md`。

会话日志是 `/forge resume` 恢复上下文的关键数据源——它比 status.md 和 progress 更简洁、更有针对性。

**日志格式**：

```markdown
---
date: "YYYY-MM-DD"
task: "<任务描述>"
tier: "light | standard | full"
duration: "<实际耗时>"
---

## 本次会话摘要

### 做了什么
- <完成的关键工作，2-3 条>

### 关键决策
- <本次做出的重要决策>

### 验证结果
- <测试通过情况、评审结果>

### 下次应该
- <下次会话的建议起点>
```

**日志规则**：

- 每条日志控制在 20 行以内，简洁为主
- 不重复 progress 中已有的任务列表
- 聚焦"下次会话需要知道什么"
- `/forge resume` 优先读取最近 3 条会话日志来恢复上下文

---

## 9. 执行流程

### 完整流程图

```
用户输入 /forge learn
        │
        ▼
  ┌─────────────────────┐
  │  知识库维护           │  清理低置信度、检查上限
  └──────────┬──────────┘
             │
             ▼
  ┌─────────────────────┐
  │  回流效果追踪         │  更新已引用知识的 confidence
  └──────────┬──────────┘
             │
             ▼
  ┌─────────────────────┐
  │  执行质量分析         │  四维度评估 + 改进信号
  │                     │
  │  一次通过率           │
  │  Plan 准确度         │
  │  Review 拦截率       │
  │  Debug 触发率        │
  └──────────┬──────────┘
             │
             ▼
  ┌─────────────────────┐
  │  指标更新            │  写入 metrics.md
  └──────────┬──────────┘
             │
             ▼
  ┌─────────────────────┐
  │  五维度提取           │  Subagent 模式（以改进信号为输入）
  │                     │
  │  1. 问题模式         │
  │  2. 解决方案         │
  │  3. 踩坑记录         │
  │  4. 决策理由         │
  │  5. 可复用模式       │
  └──────────┬──────────┘
             │
             ▼
  ┌─────────────────────┐
  │  SKILL 反馈检测       │  SKILL.md 指导是否有不适用的场景？
  └──────────┬──────────┘
             │
             ▼
  ┌─────────────────────┐
  │  生成知识文档         │  YAML frontmatter + 五章节
  └──────────┬──────────┘
             │
             ▼
  ┌─────────────────────┐
  │  重叠检测            │  扫描已有文档 tags
  └──────┬──────┬───────┘
    重叠 │      │ 无重叠
         ▼      ▼
  ┌────────┐  ┌─────────────────┐
  │合并到   │  │创建新文档        │
  │已有文档 │  │写入 solutions/   │
  └────┬───┘  └───────┬─────────┘
       │              │
       └──────┬───────┘
              ▼
  ┌─────────────────────┐
  │  高频模式识别         │  是否写入 instincts.md？
  └──────────┬──────────┘
             │
             ▼
  ┌─────────────────────┐
  │  跨项目模式检测       │  是否建议提升到 patterns/？
  └──────────┬──────────┘
             │
             ▼
  ┌─────────────────────────────┐
  │  错误预防规则蒸馏             │  Error-Prevention Rule Distillation
  │                             │
  │  1. 读取 4 个数据源          │  known-failures, instincts,
  │  2. 应用阈值生成候选         │  skill-feedback, metrics
  │  3. 排除过滤 + 冲突检测      │
  │  4. 容量管理                │
  │  5. 向用户展示提案           │
  │  6. 写入已批准的规则         │
  │  7. 更新 changelog          │
  └──────────┬──────────────────┘
             │
             ▼
  ┌─────────────────────┐
  │  会话层清理           │  归档 sessions/ 中的当前会话
  └──────────┬──────────┘
             │
             ▼
  ┌─────────────────────┐
  │  再次检查上限         │  确保维护不变量成立
  └─────────────────────┘
```

---

## 9.1 任务归档（learn 完成后自动执行）

知识沉淀完成后，**自动将本次任务的全部制品归档**到 `.forge/archive/<date>-<topic>/`。

**归档内容**：

| 源路径 | 归档路径 | 说明 |
|--------|---------|------|
| `.forge/decisions/<topic>.md` | `archive/<date>-<topic>/decisions/` | 决策文档 |
| `.forge/specs/<feature>/` | `archive/<date>-<topic>/specs/` | 规格文档 |
| `.forge/plans/<topic>.md` | `archive/<date>-<topic>/plans/` | 任务计划 |
| `.forge/progress/<topic>.md` | `archive/<date>-<topic>/progress/` | 执行进度 |
| `.forge/reviews/<topic>.md` | `archive/<date>-<topic>/reviews/` | 评审报告 |
| `.forge/handoffs/*.md` | `archive/<date>-<topic>/handoffs/` | 阶段间 Handoff |
| `.forge/debug/<topic>.md` | `archive/<date>-<topic>/debug/` | 调试记录（如有） |

**归档规则**：

1. 归档是**复制**，不是移动。源文件保留，直到下一次 `/forge` 启动新任务时清理。
2. 归档目录名格式：`<YYYY-MM-DD>-<topic>`，如 `2025-01-15-order-batch-export`。
3. 归档完成后，更新 `.forge/status.md` 的 `phase` 为 `"completed"`。
4. 不归档 `knowledge/` 目录——知识是跨任务的持久资产，不属于单次任务。
5. 不归档 `config.md`——项目配置是全局的。

**归档输出**：

```
📦 任务归档完成

归档路径：.forge/archive/2025-01-15-order-batch-export/
归档内容：decisions(1) + specs(1) + plans(1) + progress(1) + reviews(1) + handoffs(3)

✅ 本次任务全部完成。知识已沉淀，制品已归档。
```

**为什么归档？** 归档形成完整的变更历史。当需要回顾"上次做类似功能时怎么做的"时，可以直接查看归档目录，而不是在 knowledge/ 中搜索碎片化的经验。

---

## 10. 边界情况处理

### 10.1 首次执行（空知识库）

如果 `.forge/knowledge/` 为空：

```
ℹ️ 知识库为空，这是首次知识沉淀。
将创建 solutions/ 目录和 instincts.md 文件。
```

### 10.2 无可提取的知识

如果本次开发过于简单（如轻量路径的小修改），可能没有值得沉淀的知识：

```
ℹ️ 本次开发较为简单，未识别到值得沉淀的新知识。
如果你认为有值得记录的经验，请描述，我会帮你整理。
```

### 10.3 知识库已满

如果 solutions/ 已达上限且新文档的置信度高于现有最低置信度文档：

```
📦 知识库已满（20/20）

新文档置信度（0.7）高于现有最低置信度文档（0.3）。
将替换最低置信度文档：async-retry-pattern.md

确认替换？(y/n)
```

### 10.4 无 `.forge/` 目录

提示先运行初始化：

```
⚠️ 未检测到 .forge/ 目录。请先运行 forge init 初始化项目。
```

---

## 11. 示例

### 示例 1：正常知识沉淀

```
$ /forge learn

🧹 知识库维护...
  文档数：15/20 ✅
  低置信度模式：0 ✅

📊 执行质量分析...

  ━━━ 执行概况 ━━━
    总任务数：5
    一次通过：4/5（80%）
    返工任务：Task 3（连续失败 2 次后通过）
    Debug 触发：0 次

  ━━━ Plan 准确度 ━━━
    偏差率：1.15（偏高 15%，正常范围）

  ━━━ 改进信号 ━━━
    ⚠️ Task 3 反复失败：流式处理的 backpressure 处理不当 → 优先提取

📈 指标更新...
  写入 .forge/knowledge/metrics.md

🔍 五维度知识提取（聚焦改进信号）...

  1. 问题模式：大数据量导出导致内存溢出
  2. 解决方案：流式处理 + 分片写入
  3. 踩坑记录：最初尝试全量加载到内存，超过 100MB 后 OOM
  4. 决策理由：选择流式处理而非分页查询，因为分页有数据一致性问题
  5. 可复用模式：任何超过 10000 条记录的导出都应使用流式处理

📝 生成知识文档...
  输出：.forge/knowledge/solutions/streaming-export-pattern.md
  置信度：0.7

📊 高频模式检查...
  "流式处理大数据量"模式已出现 3 次，写入 instincts.md
  Confidence_Score: 0.75

✅ 知识沉淀完成
  新增文档：1
  更新直觉：1
  当前知识库：16/20
```

### 示例 2：高重叠合并

```
$ /forge learn

🧹 知识库维护...
  文档数：16/20 ✅
  低置信度模式：0 ✅

🔍 五维度知识提取...

  1. 问题模式：API 调用超时导致请求堆积
  2. 解决方案：设置 30 秒超时 + 指数退避重试
  3. 踩坑记录：最初未设超时，高峰期连接池耗尽
  4. 决策理由：选择指数退避而非固定间隔，避免雪崩
  5. 可复用模式：外部 API 调用必须有超时和重试机制

📝 生成知识文档...
  tags: ["async", "timeout", "api", "retry"]

🔄 重叠检测...
  与已有文档 timeout-handling-export.md 高度重叠（tags 重叠度：67%）
  合并到已有文档（confidence: 0.5 → 0.6）
  tags 更新为：["async", "timeout", "export", "api", "retry"]

📊 高频模式检查...
  "超时处理"模式已出现 3 次，写入 instincts.md
  Confidence_Score: 0.7

✅ 知识沉淀完成
  合并文档：1（未新增）
  更新直觉：1
  当前知识库：16/20
```

### 示例 3：知识库维护触发清理

```
$ /forge learn

🧹 知识库维护...
  文档数：20/20（已满）
  低置信度模式：1（confidence: 0.25）

  清理低置信度模式：
    - removed: "前端状态管理用 Redux" (confidence: 0.25)

🔍 五维度知识提取...
  ...

📝 生成知识文档...
  输出：.forge/knowledge/solutions/api-rate-limiting.md
  置信度：0.65

  知识库超限（21/20），清理最低置信度文档：
    - removed: css-grid-layout.md (confidence: 0.35)

✅ 知识沉淀完成
  当前知识库：20/20
```
