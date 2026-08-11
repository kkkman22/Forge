---
status: completed
feature: skills-cross-pollination
layout: requirements
created: 2026-05-05
tier: standard
---
# 需求文档：借鉴 mattpocock/skills 的能力交叉授粉

## 简介

基于对 [mattpocock/skills](https://github.com/mattpocock/skills) 的深度对比分析，从中提取 7 项与 Forge 「流程 + 纪律」 定位互补、不破坏现有架构、可渐进落地的能力增强项。本 spec 将这 7 项能力作为一个整体的「轻量级工程技巧」包规划，**按价值从高到低排序**。

**价值评估维度**：投入产出比、对 token 节省的贡献、对命名一致性的贡献、与现有体系的正交性、阻塞关系、工程风险。

**目标**：让 Forge 在保持三维路由、冻结区、状态目录等重流程特性的前提下，补齐共享语言、决策质量门、skill 触发精度、质询机制、渐进披露纪律、整体视角回退、外部 issue 打通 7 块拼图。

**来源研究**：与用户在会话中完成的 mattpocock/skills 7 点对比分析（深度对比 README、5 个核心 SKILL.md、Forge 全局宪法与 SKILL 目录）。

## 术语表

- **Glossary（共享语言）**：以 `.tinkerman/glossary.md` 为单一事实来源的领域术语表，被 forge-spec / plan / learn 等多个 skill 消费
- **ADR 三问筛**：落盘决策文档前必须通过的三个硬门槛：Hard to reverse / Surprising without context / Real trade-off
- **Failure-mode description**：skill description 改写规范，要求 "Use when [具体触发条件]"，对齐用户痛点而非流水线位置
- **Grill（质询）**：苏格拉底式一次一个问题的对抗性追问循环，强制用户把决策树每个分支说清楚
- **Progressive Disclosure**：SKILL.md 主文件精简 + 大内容拆到 references/ 子目录的披露纪律
- **Zoom-out**：用户在某 skill 执行中途主动触发的「退后一步讲整体架构」辅助模式
- **External Issue Tracker Integration**：将本地 spec / plan 推送到 GitHub / GitLab / Linear 的对接能力
- **Vertical Slice**：一个可独立交付的最小功能切片，对应一条 issue 或一个子任务

## 需求

### 需求 1：共享语言机制（Glossary）⭐⭐⭐⭐⭐

**用户故事**：作为 Forge 用户，我希望项目有一个不断演进的领域术语表，以便 agent 在 spec / plan / build 的多次会话中使用一致的命名，减少 token 消耗、提升代码可导航性、避免术语漂移。

**价值理由**：mattpocock 称之为「这个仓库里最酷的单一技术」。压缩的是**概念层** token（以"materialization cascade"替代"lesson 被材料化进文件系统时出问题"），上限高于散文层压缩。Forge 现有的 caveman 压缩、知识库 instincts 都偏行为不偏词汇，本项填空白。

#### 验收标准

1. THE 项目 SHALL 在 `.tinkerman/glossary.md` 维护单一领域术语表，位于开放区（Open zone）
2. THE 每个术语条目 SHALL 包含字段：`term`（string）、`definition`（string，≤ 2 行）、`aliases`（string[]，可选）、`last_updated`（ISO 8601）、`source_session`（string，可选，指向 `.tinkerman/knowledge/sessions/` 中的文件）
3. WHEN `.tinkerman/glossary.md` 文件不存在时，THE `forge-spec` 或 `forge-plan` SHALL 在首次检测到新术语候选时懒创建该文件，写入表头与首个术语
4. WHEN `forge-spec` 生成 spec 文档时，THE spec SKILL SHALL 扫描文本中的名词短语，对照 glossary 识别未定义术语，在输出结尾打印 `[glossary-miss] 未定义术语：[...]` 提示
5. WHEN `forge-plan` 拆解任务时，THE plan SKILL SHALL 优先使用 glossary 中已定义的术语作为任务名的关键词，保持命名一致
6. WHEN `forge-learn` 收尾时，THE learn SKILL SHALL 从本次会话的 decisions / findings / reviews 中提取候选新术语（名词短语 + 上下文），生成建议列表，用户确认后追加到 glossary
7. WHEN 用户在 spec / decide 中使用的术语与 glossary 中已有定义冲突（同名不同义）时，THE 对应 SKILL SHALL 输出告警并要求用户二选一或新增别名
8. THE glossary 术语提取、冲突检测、merge 操作 SHALL 为纯函数，可单独通过 property-based test 验证
9. THE glossary SHALL 不包含以下类别：变量名、私有函数名、实现细节、时间敏感信息、个人偏好
10. THE 初始 glossary SHALL 至少预置 5 个 Forge 核心术语：Tier / Spec / Plan / Hint / Subagent，附带定义
11. WHEN 某术语在 glossary 中 30 天未被任何 skill 引用时，THE 维护命令（`/forge learn` 的可选子步骤）SHALL 提示是否归档该术语

---

### 需求 2：ADR 三问筛（Decision Quality Gate）⭐⭐⭐⭐⭐

**用户故事**：作为 Forge 维护者，我希望 `/forge decide` 在落盘 ADR 之前，必须通过三条硬门槛筛选，以便防止 `.tinkerman/decisions/` 变成灌水目录、每个决策都有真实价值。

**价值理由**：mattpocock 的 `grill-with-docs` 明确规定「三条全满足才写 ADR」。Forge 现有的 decide skill 输出所有决策，靠 confidence 阈值事后清理。事前筛选比事后清理成本低一个数量级。

**关系说明**：本需求与 `engineering-governance-hardening` spec 的「需求 1 ADR 制度化」互补——后者规范 ADR 编号、索引、supersession，本需求规范 ADR 是否应该被生成的前置判定。两者可独立实施，但建议本需求在前者之后落地。

#### 验收标准

1. WHEN `/forge decide` 生成决策候选时，THE decide SKILL SHALL 对每个候选执行三问筛判定：
   - 问题 A（Hard to reverse）：改变这个决定的成本是否有意义？
   - 问题 B（Surprising without context）：未来读者是否会问「为什么这样做」？
   - 问题 C（Real trade-off）：是否真的存在备选方案，而不是唯一自然选择？
2. THE 三问筛 SHALL 为纯函数 `evaluateAdrCriteria(decision: DecisionCandidate): CriteriaResult`，返回 `{ reversibility, surprising, tradeOff, alternatives, shouldBecomeAdr }`
3. WHEN 三个问题的答案均为 yes 时，THE decide SKILL SHALL 生成 ADR 文件，并在 frontmatter 中持久化：`reversibility: hard`、`surprising: true`、`trade_off_alternatives: string[]`（列出备选方案）
4. WHEN 任一问题的答案为 no 时，THE decide SKILL SHALL 不生成 ADR 文件，改为输出行内注释追加到对应 spec / plan / progress 文件，或直接丢弃
5. THE 三问筛的判定过程 SHALL 在 `forge-decide` 的 Critic 阶段结构化输出中显示，格式为：
   ```
   ADR Criteria Check:
     Reversibility: hard | soft
     Surprising: true | false
     Trade-off alternatives: [...] | none
     Verdict: WRITE ADR | INLINE NOTE | DISCARD
   ```
6. WHEN 用户对判定结果不认同时，用户 SHALL 可通过回复 `--force-adr` 或 `--no-adr` 覆盖决策
7. THE 三问筛 SHALL 对旧 ADR 无回溯影响——已存在于 `.tinkerman/decisions/` 的文件不需要补填 reversibility 等字段
8. THE 判定逻辑的 property-based test SHALL 覆盖：任一问题为 no 则不应生成 ADR、备选方案为空数组时 tradeOff 必为 false、verdict 与三个布尔的映射关系
9. WHEN decision 判定为 INLINE NOTE 时，对应的行内注释 SHALL 追加到触发本次 `/forge decide` 的上游文件（spec / plan / progress），格式为 `<!-- decision: [决策摘要] | reason: [判定原因] -->`
10. THE 三问筛的触发 SHALL 不破坏 `/forge decide` 的 Round 1（四视角并行）与 Round 2（Critic 交叉审视）结构，而是作为 Round 2 的内嵌步骤

---

### 需求 3：Skill Description 按失败模式重写 ⭐⭐⭐⭐

**用户故事**：作为使用 Forge 的开发者，我希望 `/forge` 路由器能基于用户痛点精准选择 skill，而不是基于流水线位置。我希望每个 skill 的 description 明确声明"当用户遇到什么问题时触发我"，提升路由精度与调用可解释性。

**价值理由**：mattpocock 的 skills description 统一采用 "Use when..." 模式（如 `diagnose` 触发于 "user says diagnose this / reports a bug / says something is broken/throwing/failing"）。Forge 现有 13 个 skill 的 description 偏"评审引擎""交付引擎"描述，缺乏触发信号。这是最便宜的路由精度提升。

#### 验收标准

1. THE 审计范围 SHALL 覆盖 13 个 `skills/forge-*/SKILL.md` 的 frontmatter `description:` 字段
2. THE 每个 description SHALL 遵循以下结构：
   - 第一句：第三人称描述 skill 做什么（what）
   - 第二句：以 "Use when" 开头的触发条件（when）
3. THE 每个 description SHALL ≤ 1024 字符（对齐 skills 项目规范）
4. THE 触发条件 SHALL 包含至少以下信号之一：
   - 关键词（如 "fix"、"bug"、"new feature"、"deploy"、"review"）
   - 上下文信号（如 "影响 ≤1 文件"、"有现成 spec"、"所有任务完成后"）
   - 用户明确动作（如 "/forge build"、"/forge review"）
5. THE description SHALL 不包含以下元素：
   - 时间敏感信息（如版本号、日期）
   - 对其他 skill 的具体实现细节引用
   - 营销性语言（如"最好的""革命性的"）
6. THE 验证脚本 `scripts/validate-skill-descriptions.sh` SHALL 扫描所有 `skills/forge-*/SKILL.md`，校验：
   - description 字段存在且非空
   - 字符数 ≤ 1024
   - 包含 "Use when" 字符串（大小写不敏感）
7. THE `npm run check` 或 CI pipeline SHALL 调用 `validate-skill-descriptions.sh`，校验失败则构建失败
8. THE 重写后的 description SHALL 不改变 skill 的实际行为，仅影响 forge-router 的 skill 选择逻辑
9. THE 每条 description 的 "Use when" 触发条件 SHALL 与 forge-router 的路由判定维度（tier / task_type / project_phase / hints）对齐
10. THE 示例（forge-debug）：改写前「调试引擎（四阶段）」→ 改写后「Disciplined four-phase root-cause analysis with hypothesis verification. Use when user says "debug this" / "not working" / reports a regression / after 3 consecutive build failures trigger three-strike reroute.」

---

### 需求 4：Grill 质询独立 skill ⭐⭐⭐

**用户故事**：作为启动复杂任务（全量档位）的用户，我希望有一个独立的质询 skill，通过苏格拉底式的一次一个问题追问，帮我在 decide 之前把决策树每个分支都说清楚，避免对齐缺失导致的返工。

**价值理由**：mattpocock 把"对齐不足"视为头号失败模式，两个最高频 skill（grill-me / grill-with-docs）都是质询循环。Forge 的 decide 是"四视角输出观点"，本质是 agent 在表达，不是逼用户澄清。本需求填补"用户侧澄清"的空白。

**依赖**：本需求依赖需求 1（共享语言），grill 产出的新术语应回写 glossary。

#### 验收标准

1. THE 新增 skill `skills/forge-grill/SKILL.md` SHALL 作为独立 skill 存在
2. THE skill 主文件 SHALL ≤ 150 行（遵守需求 5 的渐进披露），大内容迁移到 `skills/forge-grill/references/` 子目录
3. THE 触发方式 SHALL 支持以下三种：
   - 用户主动 `/forge grill [任务描述]`
   - 全量档位路由时作为 `decide` 之前的可选前置步骤（用户可跳过）
   - 用户在其他 skill 中回复 "grill me" 或 "再挖深点"
4. THE grill 工作流 SHALL 遵循以下循环：
   - Step 1：分析用户初始描述，生成决策树（至少覆盖：功能点、边界、依赖、假设、非目标）
   - Step 2：按决策树分支**一次一个问题**地追问
   - Step 3：每个问题附带 AI 推荐答案，用户可接受/覆盖/要求继续挖深
   - Step 4：能通过探索代码库回答的问题（已有实现、现存术语），直接查代码而非追问用户
   - Step 5：每轮问答后更新内存中的决策树状态
   - Step 6：所有分支解析完或用户主动停止时终止
5. THE 输出 SHALL 生成 `.tinkerman/findings/grill-<topic>.md`，包含字段：
   - `decision_tree`（决策树初始结构与最终结构）
   - `qa_pairs`（所有问答对）
   - `alignment_summary`（对齐摘要）
   - `new_glossary_terms`（提取出的新术语候选，供 learn 回写）
6. THE 决策树生成、问题选择、终止条件判定 SHALL 为纯函数
7. WHEN grill 过程中发现与 glossary 冲突的术语时，THE grill SHALL 按需求 1 的冲突处理规则处理
8. THE grill 的 property-based test SHALL 覆盖：
   - 任意初始描述 → 决策树非空
   - 决策树的所有叶节点最终状态为「已解析」
   - 同一问答序列的 replay 产出同一 alignment_summary
9. THE grill 与 forge-decide 的边界 SHALL 清晰：grill 产出「用户已经想清楚的东西」、decide 产出「四视角评估后的推荐方案」
10. WHEN 用户在 grill 中途关闭会话时，THE grill SHALL 将部分完成的决策树持久化到 findings 目录，下次 `/forge resume` 可继续
11. THE grill SKILL description SHALL 遵循需求 3 的 "Use when" 模式，如：「Socratic grilling loop driving one-question-at-a-time decision tree resolution. Use when user starts full-tier task / explicitly says "grill me" / replies "dig deeper" during decide phase / before locking an ambiguous spec.」

---

### 需求 5：Progressive Disclosure 严格化 ⭐⭐⭐

**用户故事**：作为 Forge 代码维护者与 SKILL.md 读者，我希望每个 SKILL.md 主文件精简到核心工作流，把阈值、格式规范、示例迁移到 references/ 子目录，以便降低主文件阅读负担、加速按需加载、为未来新 skill 提供模板。

**价值理由**：mattpocock 的 `write-a-skill` 规定主文件 ≤ 100 行。Forge 当前平均 170 行，最长 388 行（forge-learn）。严格化后 token 节省来自「冷知识懒加载」——SKILL.md 只读主体，references/ 按需 fetch。

#### 验收标准

1. THE 所有 `skills/forge-*/SKILL.md` 主文件 SHALL ≤ 150 行（放宽 skills 项目的 100 行规则 50%，适配 Forge 的结构化输出豁免清单）
2. THE 超出部分 SHALL 迁移到同目录 `references/` 子目录，命名规范示例：`references/format-rules.md`、`references/examples.md`、`references/edge-cases.md`
3. THE 引用语法 SHALL 统一使用：`→ references/<filename>.md`，引用深度不超过一层（references/ 下的文件不再引用其他 references）
4. THE 当前需要精简的 skill 清单（按超标量降序）：
   - `forge-learn`: 388 → 目标 ≤ 150，需削减 238 行
   - `forge-build`: 260 → 目标 ≤ 150，需削减 110 行
   - `forge-spec`: 253 → 目标 ≤ 150，需削减 103 行
   - `forge-ship`: 246 → 目标 ≤ 150，需削减 96 行
   - `forge-decide`: 245 → 目标 ≤ 150，需削减 95 行
   - `forge-loop`: 220 → 目标 ≤ 150，需削减 70 行
   - `forge-resume`: 168 → 目标 ≤ 150，需削减 18 行
   - `forge-router`: 167 → 目标 ≤ 150，需削减 17 行
   - `forge-refactor`: 158 → 目标 ≤ 150，需削减 8 行
5. THE 保留的共享目录 `skills/shared/next-step-protocol.md` SHALL 保持不变，作为跨 skill 的共享引用
6. THE 精简过程 SHALL 保留 SKILL.md 的以下必需元素在主文件中：
   - frontmatter（name、description）
   - 主工作流步骤（Step 1, 2, 3...）
   - 结构化输出格式定义
   - TDD / 评审 / 门禁等与本 skill 直接相关的铁律
7. THE 可以迁移到 references/ 的内容包括：
   - 详细的阈值表（如所有 hint 标签的完整列表）
   - 大量示例（3 条以上的示例）
   - 边界情况处理详细说明
   - 历史决策与设计理由
8. THE 验证脚本 `scripts/validate-skill-length.sh` SHALL 校验所有 SKILL.md 主文件 ≤ 150 行
9. THE `npm run check` 或 CI pipeline SHALL 调用该验证脚本，校验失败则构建失败
10. THE 精简 SHALL 不改变 skill 的实际行为——通过 before/after 的集成测试验证（运行同一任务，输出结构一致）
11. THE 精简后的 references/ 文件 SHALL 由下游 skill 或 agent 按需通过 readFile 工具加载，不预加载

---

### 需求 6：Zoom-out 退后一步模式 ⭐⭐

**用户故事**：作为在 skill 执行中途陷入细节的用户，我希望能用一句 "zoom out" 或 "/forge zoom-out" 让 agent 退后一步，用整体架构视角解释当前代码/决策，帮我重建全局观。

**价值理由**：mattpocock 的 zoom-out 是独立 skill，补足了 "钻太深" 的辅助出口。Forge 现有 debug 的 three-strike 重路由是重量级的架构质疑，缺乏轻量级的 "只想听个整体" 入口。

#### 验收标准

1. THE 新增 zoom-out 能力 SHALL 以以下任一形式存在（二选一，在 design 阶段决定）：
   - 独立 skill `skills/forge-zoom-out/SKILL.md`
   - `forge-status` 的子模式 `/forge status --zoom-out`
2. THE 触发条件 SHALL 支持以下输入：
   - 用户主动输入 `/forge zoom-out [可选话题]`
   - 用户在任意 skill 执行中途输入 `zoom out`、`放大视角`、`讲整体`
3. THE 工作流 SHALL：
   - Step 1：暂停当前 skill 的执行（保留状态快照）
   - Step 2：调用 explore agent 或直接读取 `.tinkerman/` 状态文件，构建整体视角
   - Step 3：输出三段式摘要
   - Step 4：询问用户是否继续原 skill
4. THE 输出 SHALL 采用固定三段式 Markdown，每段 ≤ 5 行：
   ```
   ## 整体位置
   [当前代码/决策在整个系统中的位置]

   ## 当前职责
   [当前关注点的单一职责]

   ## 与邻居的边界
   [与上下游模块的接口、不变量、职责边界]
   ```
5. THE zoom-out SHALL 不产生文件副作用（不写入 `.tinkerman/` 任何文件），仅输出到对话
6. THE zoom-out 的输出 SHALL 不被纳入命令序列——它是辅助 skill，调用后返回原上下文
7. THE SKILL.md 或子模式文档 SHALL ≤ 100 行
8. WHEN 用户在 zoom-out 输出后回复 "continue" 或无反应时，THE 原 skill SHALL 从暂停点恢复执行
9. THE zoom-out 的 description SHALL 遵循需求 3 的 "Use when" 模式
10. THE zoom-out 功能 SHALL 不影响现有 three-strike 重路由机制——它与 debug 的定位互补（zoom-out 是信息性，debug 是诊断性）

---

### 需求 7：Episode 结构化与 Confidence 生命周期 ⭐⭐⭐⭐

**用户故事**：作为 Forge 用户与维护者，我希望 `.tinkerman/knowledge/sessions/` 的会话记录是结构化的 episode（含结果、评分、关联 pattern），`instincts.md` 的每条模式都带 applications/successes/failures 计数和衰减阈值，以便 `/forge learn` 能自动聚合同类经验、自动识别高频问题升级为 instinct、自动剪枝陈旧规则。

**价值理由**：来自 zhaono1/agent-playbook 的 self-improving-agent skill 的**三层记忆 + Confidence 生命周期**设计。Forge 现有 sessions 是散文摘要、instincts 有 Confidence_Score 但无使用计数和衰减，导致知识库只增不减、无法机读聚合。结构化 episode 让 metrics.md 能自动统计，Confidence 生命周期让知识库自我清洁。本需求是 self-improving loop 的数据层基础，不做闭环也能独立落地。

**关系说明**：本需求与需求 1（glossary 归档机制）同家族——glossary 30 天未引用提示归档、instinct 衰减阈值剪枝，可共用 `.tinkerman/knowledge/` 的维护通道。与 engineering-governance-hardening 需求 3（Event Sourcing）互补——event log 是机器视图（jsonl 机读），episode 是人类视图（md 可读），两者不重复。

#### 验收标准

1. THE `.tinkerman/knowledge/sessions/<date>-<topic>.md` 的 frontmatter SHALL 扩展为结构化 episode 字段：
   - `id`（string，形如 `ep-YYYY-MM-DD-NNN`，单日递增三位数）
   - `date`（ISO 8601）
   - `skill`（string，触发本 episode 的 skill 名，如 `forge-review`）
   - `tier`（enum: light / standard / full）
   - `situation`（string，一句话描述发生了什么）
   - `root_cause`（string，可选）
   - `solution`（string，可选）
   - `lesson`（string，提炼出的可复用教训）
   - `outcome`（enum: success / partial / failure）
   - `user_rating`（integer 1-10，可选）
   - `related_pattern`（string，可选，指向 `knowledge/instincts.md` 或 `knowledge/solutions/*.md` 中的模式 id）
   - `related_skills`（string[]，受本 episode 启发可能需更新的 skill 列表）
2. THE 现有 session 文件 SHALL 不需要回溯填充——新增字段为可选，旧格式通过 `schema_version` 字段区分（缺失视为 v1）
3. THE `parseEpisode(content: string): Episode | null` SHALL 为纯函数，缺失字段返回默认值而非抛错
4. THE `renderEpisode(episode: Episode): string` SHALL 为纯函数，与 parseEpisode 构成 round-trip 等价
5. THE `.tinkerman/knowledge/instincts.md` 的每条模式 frontmatter SHALL 扩展为：
   - `pattern_id`（string，形如 `pat-YYYY-MM-DD-NNN`）
   - `confidence`（number，0-1）
   - `applications`（integer，被应用总次数）
   - `successes`（integer）
   - `failures`（integer）
   - `last_triggered`（ISO 8601，最近一次匹配到的日期）
   - `decay_threshold`（number，0-1，低于此值进入待归档队列，默认 0.5）
6. THE `updatePatternStats(pattern, outcome)` SHALL 为纯函数，返回更新后的 pattern：
   - outcome === "success" → applications++, successes++, confidence 向 1 移动（步长由公式决定）
   - outcome === "failure" → applications++, failures++, confidence 向 0 移动
   - 更新 last_triggered
7. THE confidence 更新公式 SHALL 为 Beta 分布均值近似：`confidence = (successes + α) / (applications + α + β)`，α=β=2（弱先验），保证极少样本时 confidence 不剧烈摆动
8. THE `findStaleOrDecayedPatterns(patterns, now, maxAgeDays=60): Pattern[]` SHALL 为纯函数，返回满足以下任一条件的 pattern 列表：
   - `confidence < decay_threshold` 且 `applications >= 3`（样本量够但效果不好）
   - `last_triggered` 距今 > maxAgeDays（陈旧）
9. WHEN `/forge learn` 扫描本次会话时，THE learn SKILL SHALL 自动生成新 episode 写入 `knowledge/sessions/`，字段根据会话过程推断（outcome 从 review/test/ship 结果判断，skill 从 status.md 的 phase 历史取）
10. WHEN `/forge learn` 收尾时，THE learn SKILL SHALL 调用 `findStaleOrDecayedPatterns`，产出待归档清单，用户确认后把对应 pattern 移到 `knowledge/instincts.md` 底部 `## Archived` 段落（不删除）
11. WHEN 同类 episode（同 skill + 同 root_cause 关键词）在过去 60 天出现 ≥3 次时，THE learn SKILL SHALL 提示"是否升级为 instinct"并给出 pattern 草稿
12. THE episode id 与 pattern id 的生成 SHALL 为幂等函数（相同输入产生相同 id，不依赖当前时间以外的随机性）
13. THE property-based test SHALL 覆盖：
    - parseEpisode(renderEpisode(e)) 等价于 e
    - updatePatternStats 对任意 (pattern, outcome) 序列的 confidence ∈ [0, 1]
    - findStaleOrDecayedPatterns 的输出是输入的子集
    - 同一输入序列的 renderEpisode / render​Instincts 产出稳定
14. THE `knowledge/sessions/*.md`、`knowledge/instincts.md` 保持原有保护区级别（Guarded zone，可追加不可删除）——归档操作只是把条目移到 `## Archived` 段落，不删除内容
15. THE `user_rating` 字段 SHALL 为可选——只有 `outcome === "failure"` 时才要求用户在 learn 阶段填写简短的失败原因（不强制 1-10 评分），`success` / `partial` 不强制评分

---

### 需求 8：Evolution 标记与失败自动沉淀 ⭐⭐⭐

**用户故事**：作为 Forge 维护者，我希望 `/forge review`、`/forge build`、`/forge ship` 在运行中识别到"某个 SKILL 的指导应该进化"时，能在 reviews/progress 文件里留下机读的 Evolution 标记，让 `/forge learn` 汇总产生一个"待进化清单"；同时希望 build/review/ship 的失败能自动生成 failure episode（不自动改 skill），让知识库有真实的失败样本供人类决策。

**价值理由**：来自 self-improving-agent 的 **Evolution/Correction inline markers** 和 **on_error → auto-sink** 设计。Forge 的 `/forge learn` 当前主要依赖用户主动回顾，缺乏"运行时自动产出进化候选"通道。本需求把"发现问题"和"沉淀问题"之间的人工桥梁自动化，同时**坚决不**自动修改 SKILL.md（冻结区保护），所有修改走人类审核的 PR 流程。与需求 7 的关系：需求 7 提供 episode 数据结构，需求 8 提供数据产生源（失败自动写 episode + Evolution 标记指向改进方向）。

**关系说明**：与 engineering-governance-hardening 需求 3（Event Sourcing）是"机读事件 → 人类视图"的两端——event log 自动记录所有 transition，Evolution 标记只记录"值得人工注意"的事件。与 engineering-governance-hardening 需求 1（ADR Registry）互补——ADR 是决策出口，Evolution 标记是"可能需要决策"的输入队列。

#### 验收标准

1. THE `.tinkerman/reviews/<topic>.md` 与 `.tinkerman/progress/<topic>.md` SHALL 支持 Evolution 标记行，格式为：
   ```markdown
   <!-- Evolution: YYYY-MM-DD | source: <episode_id | review_id | progress_id> | target: <skill_name>[#<section>] -->
   <具体描述：发现了什么模式，建议怎么改>
   ```
2. THE Evolution 标记 SHALL 只出现在 `.tinkerman/reviews/*.md`、`.tinkerman/progress/*.md`、`.tinkerman/findings/*.md` 三类受保护区文件——不允许出现在 `skills/**/SKILL.md`（冻结区）、`.tinkerman/config.md`、锁定的 spec
3. THE `parseEvolutionMarkers(content: string): EvolutionMarker[]` SHALL 为纯函数，解析 HTML 注释格式标记，返回 `{ date, source, target, description, filePath, lineNumber }` 列表
4. THE `validateEvolutionTarget(target: string, skillsRegistry): ValidationResult` SHALL 为纯函数，校验 target skill 在 `skills/forge-*/SKILL.md` 中真实存在（否则标记为 orphan）
5. WHEN `/forge review` 完成时，THE review SKILL SHALL 检查：
   - 本次 review 是否出现了与既有 `knowledge/solutions/*.md` 不同的新问题模式 → 如是，在 review 报告末尾追加一条 Evolution 标记指向 target skill
   - 本次 review 是否拦截了与 `knowledge/known-failures.md` 已有失败模式同类的问题 → 如是，更新对应 failure pattern 的 `occurrences` 计数（走需求 7 的 `updatePatternStats`）
6. WHEN `/forge build` 在同一任务中连续 3 次 TDD 失败（对齐现有 three-strike）时，THE build SKILL SHALL 自动写入 failure episode 到 `knowledge/sessions/` 并在 progress 文件追加 Evolution 标记 `target: forge-build` 描述"连续三次失败的任务特征"
7. WHEN `/forge ship` 的 gate 拦截时，THE ship SKILL SHALL 自动写入 partial/failure episode（outcome 根据拦截原因决定）
8. THE `aggregateEvolutionMarkers(markersByFile, adrs): EvolutionReport` SHALL 为纯函数，按 target skill 分组统计，返回每个 skill 的 Evolution 标记数量、来源 episode 列表、建议合并到 ADR 的提示
9. WHEN `/forge learn` 运行时，THE learn SKILL SHALL：
   - 扫描全仓 Evolution 标记（忽略 `.tinkerman/archive/`）
   - 产出 `knowledge/evolution-report.md`（开放区文件），列出按 target skill 分组的进化候选
   - 高频 target（≥3 条指向同一 skill 的 ≥ 同一 section）的候选 SHALL 被标记 `suggest_adr: true`，提示用户运行 `/forge decide` 走 ADR 三问筛（对齐需求 2）
10. THE Evolution 标记 SHALL **不触发** 对 SKILL.md 的自动修改——所有修改必须通过 `/forge decide` → ADR → 人类审核 PR 流程进行
11. THE `knowledge/evolution-report.md` SHALL 每次 learn 时重新生成（开放区允许覆盖），保留最近 30 天的 Evolution 标记聚合
12. THE 失败 episode 自动生成 SHALL 不阻断主流程——写入失败降级为警告而非抛错
13. THE property-based test SHALL 覆盖：
    - parseEvolutionMarkers 对任意文本不抛错
    - aggregateEvolutionMarkers 对空输入返回空报告
    - validateEvolutionTarget 对不存在 skill 返回 orphan
    - 同一 markers 集合的 aggregateEvolutionMarkers 产出稳定
14. THE Evolution 标记的 `source` 字段 SHALL 引用已有的 episode id 或 review/progress 文件路径，不允许悬空引用——校验失败时标记为 orphan 并在 evolution-report 中突出显示
15. WHEN 用户手动删除或修改 Evolution 标记所在的 reviews/progress 文件时（通过维护命令 `/forge learn --maintain`），THE 标记 SHALL 不再出现在下次 evolution-report 中，不保留历史（仅当前快照）

---

---


## 优先级与依赖关系

| 优先级 | 需求 | 价值 | 投入 | 依赖 |
|------|------|------|------|------|
| 必做 | 需求 1 共享语言 | ⭐⭐⭐⭐⭐ | 小 | 无 |
| 必做 | 需求 2 ADR 三问筛 | ⭐⭐⭐⭐⭐ | 极小 | 建议 engineering-governance-hardening 需求 1 在前 |
| 必做 | 需求 3 description 重写 | ⭐⭐⭐⭐ | 小 | 无 |
| 必做 | 需求 4 Grill skill | ⭐⭐⭐ | 中 | 需求 1（共享语言） |
| 必做 | 需求 5 渐进披露 | ⭐⭐⭐ | 中 | 无 |
| 必做 | 需求 6 Zoom-out | ⭐⭐ | 小 | 无 |


## 非目标（Not in Scope）

- 不废弃 Forge 现有的 `.tinkerman/` 状态系统换成 mattpocock 的 CONTEXT.md
- 不放弃 Forge 的流程编排特性（三维路由、门禁、冻结区）
- 不引入新的运行时依赖（所有需求均用内建能力实现）
- 不改动已锁定 spec 或已批准 plan 的格式
- 不替代 engineering-governance-hardening spec 的 ADR 编号与索引机制（本 spec 的需求 2 只做三问筛，与其互补）

## 向后兼容

- 所有需求均为增量新增，不修改现有 skill 的既有字段或行为语义
- `.tinkerman/glossary.md` 缺失时，forge-spec / plan / learn 行为与现状一致
- skill description 重写不影响 skill 实际执行路径
- SKILL.md 精简不改变 skill 输出结构
- 新增的 `/forge grill`、`/forge zoom-out`、`/forge publish` 均为独立入口，不影响现有 12 命令序列
