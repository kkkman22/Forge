---
status: completed
feature: decide-spec-divergent-thinking
layout: requirements
created: 2026-06-04
tier: light
---
# Requirements Document — Decide/Spec Divergent Thinking（发散性思维增强）

## 引言

调研 CE 的 `ce-brainstorm` 发现一个 Forge 缺失的关键能力：**问题重构（Problem Reframing）**。Forge 的 `/forge decide` 和 `/forge spec` 都假设用户已经想清楚了问题——用户带着一个"决策题"或"需求"进来，AI 分析 trade-offs 或写正式需求。但现实中，用户经常带的是**错误的问题**：

- "要不要加缓存" → 真正的问题可能是"查询太慢"，而索引比缓存更合适
- "加一个用户导出功能" → 真正的需求可能是"合规团队需要审计数据"，API 导出比 CSV 下载更合适
- "拆分成微服务" → 真正的痛点可能是"部署太慢"，monolith + CI 优化就够了

CE 的 brainstorm 在正式进入需求之前先用 3–5 个问题做压力测试：这是正确的问题吗？有没有更重要的底层问题？隐藏的约束是什么？

本 spec 不新增命令，而是**增量增强**现有的 `/forge decide` 和 `/forge spec`，在最开始加入一个简短的问题重构阶段。

**核心原则**：不增加用户认知负担（不新增命令），不增加 ceremony（问题重构 ≤3 分钟），不阻断流程（用户可以跳过）。

## 术语表

- **Problem_Reframing**：在分析或规划前，先花 1–3 个问题质疑问题本身的行为。"你确定这是正确的问题吗？"
- **Reframing_Gate**：decide 或 spec 执行前的一个简短交互阶段（≤3 个问题），用户可选择跳过。
- **Divergent_Question**：发散性问题，旨在拓宽视角而非收窄。示例："如果资源无限制，你会怎么解决这个问题？"、"这个问题的反面是什么？"
- **Constraint_Uncovering**：通过提问暴露用户未明确表达的约束。示例："这个功能必须在 3 天内上线吗？"、"有监管合规要求吗？"
- **Pressure_Test**：在 spec 正式编写前对需求假设的压力测试。"如果只有 20% 的用户用这个功能，你还做吗？"

## Requirements

### Requirement 1: `/forge decide` 问题重构阶段

**User Story:** As a developer about to make an architectural decision, I want the decide agent to first challenge whether I'm solving the right problem, so that I don't invest in a sophisticated solution to the wrong question.

#### 验收标准

1. WHEN `/forge decide <topic>` 被调用，THE decide agent SHALL 在正式进入 5 视角分析前，先执行一个 **Reframing_Gate**（问题重构门控）。
2. THE Reframing_Gate SHALL 提出 1–3 个问题，从以下维度中选择最相关的：
   - **问题替代**："你确定这是正确的问题吗？有没有更根本的痛点？"（当决策题是方案级而非问题级时触发）
   - **约束揭示**："有什么隐藏的约束我没看到？（时间、团队、合规、预算）"（当决策涉及大范围变更时触发）
   - **代价校准**："这个决策的代价你愿意承受多少？如果 cost 是 2x，你还做吗？"（当决策有高成本选项时触发）
3. THE Reframing_Gate SHALL 使用 `AskUserQuestion` 以非阻断方式提问——每个问题提供一个 `跳过，直接分析` 选项。
4. WHEN 用户选择跳过所有重构问题，THE decide agent SHALL 直接进入正式的 5 视角分析，不做延迟。
5. WHEN 用户回答了至少一个重构问题，THE decide agent SHALL 将回答作为**额外上下文**注入到 5 个 reviewer 的分析中，可能改变他们的分析深度或方向。
6. THE Reframing_Gate 的总耗时 SHALL 不超过 1 分钟（3 个问题，每个 20 秒以内）。

### Requirement 2: `/forge spec` 需求澄清阶段

**User Story:** As a developer writing a spec for a new feature, I want the spec agent to first ask a few clarifying questions that expose hidden requirements and constraints, so that the final spec is more complete and fewer iterations are needed.

#### 验收标准

1. WHEN `/forge spec <topic>` 被调用，THE spec agent SHALL 在正式进入模板化需求编写前，先执行一个 **Clarification_Gate**（需求澄清门控）。
2. THE Clarification_Gate SHALL 提出 2–5 个问题，从以下维度中选择：
   - **用户价值**："这个功能的核心用户价值是什么？如果只保留一个场景，是哪个？"
   - **边界条件**："什么情况下这个功能不应该工作？"（定义 not-in-scope）
   - **成功标准**："你怎么知道这个功能成功了？可衡量的指标是什么？"
   - **替代方案**："有没有更简单的方式达到同样的目标？"
   - **依赖关系**："这个功能依赖什么已有功能或外部服务？它们准备好了吗？"
3. THE Clarification_Gate SHALL 使用 `AskUserQuestion` 提问——每个问题提供 `跳过` 选项。
4. WHEN 用户跳过所有澄清问题，THE spec agent SHALL 基于已有信息直接生成需求文档（与当前行为一致）。
5. WHEN 用户回答了至少一个澄清问题，THE spec agent SHALL 将回答作为**需求输入**整合到正式需求文档中。
6. THE Clarification_Gate 的总耗时 SHALL 不超过 2 分钟（5 个问题，每个 ≤20 秒）。
7. THE Clarification_Gate SHALL 读取 `.tinkerman/charter.md`（如果存在）来避免提出 charter 已回答的问题（如"技术选型是什么"——charter 已记录）。

### Requirement 3: 轻量模式兼容

**User Story:** As a developer using `/forge decide` or `/forge spec` in Light tier, I don't want to be asked extra questions that slow down my workflow for small decisions.

#### 验收标准

1. WHEN tier 为 Light，THE Reframing_Gate 和 Clarification_Gate SHALL **完全跳过**，直接进入正式流程。
2. WHEN tier 为 Standard，THE Gates SHALL 默认启用，但可通过 `--no-reframe` flag 跳过。
3. WHEN tier 为 Full，THE Gates SHALL 强制启用，不可跳过（Full tier 本身就是"需求模糊"的信号）。
4. THE `--no-reframe` flag SHALL 同时适用于 `/forge decide` 和 `/forge spec`。

### Requirement 4: 重构反馈回路

**User Story:** As a Forge maintainer tracking the effectiveness of divergent thinking, I want to know how often reframing changes the outcome, so that I can calibrate the question quality.

#### 验收标准

1. WHEN Reframing_Gate 或 Clarification_Gate 被执行，THE 系统 SHALL 记录以下数据到 `.tinkerman/progress/<slug>-reframing.jsonl`：
   - `timestamp`：ISO 8601
   - `skill`：`decide` 或 `spec`
   - `questions_asked`：提出的问题数量
   - `questions_answered`：用户回答的问题数量
   - `questions_skipped`：用户跳过的问题数量
   - `outcome_changed`：用户回答是否导致了与"跳过时"不同的结果（`true` / `false` / `unknown`）
2. THE `outcome_changed` 字段 SHALL 由 AI 在 decide/spec 完成后回填——AI 评估"如果用户跳过了重构问题，结果会有实质不同吗？"
3. THE reframing 日志 SHALL 被 `/forge learn` 读取——如果某个重构问题的 `outcome_changed=true` 比例 > 50%，该问题模式可能值得提升为 evolved-rule。
