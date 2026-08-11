---
status: completed
feature: output-bloat-control
layout: requirements
created: 2026-04-30
tier: standard
---
# 需求文档：输出膨胀控制

## 引言

输出膨胀——AI 自身生成的过量 token——是 Forge 开发会话中的第二大成本驱动因素。第一层优化（`context-bloat-control`，已完成规格）解决输入膨胀（工具输出、文件读取、过期上下文）。本功能作为第二层，通过四项优化措施（按 ROI 排序）控制 AI 输出端的 token 消耗：Agent 级模型路由、散文压缩规则、Restatement 摘要压缩、opusplan 模式推荐。

关键约束：用户使用 GLM 5.1 作为主模型（通过 Claude Code CLI），GLM 5.1 没有 thinking budget 参数；Claude Code CLI 不会根据任务复杂度自动路由模型（`opusplan` 别名除外）；Forge 必须绑定 Claude Code 的模型别名（`haiku`/`sonnet`/`opus`），不绑定具体模型名称，以支持任意 AI 提供商。

## 术语表

- **Model_Alias**：Claude Code 的模型别名系统（`haiku`、`sonnet`、`opus`），用户通过环境变量（`ANTHROPIC_DEFAULT_HAIKU_MODEL` 等）将别名映射到具体模型。Forge 绑定别名而非具体模型名称。
- **Agent_Frontmatter**：Agent 定义文件（`.claude/agents/*.md` 和 `agents/*.md`）顶部的 YAML 元数据块，包含 `name`、`description`、`model`、`maxTurns`、`tools`、`permissionMode` 等字段。
- **Model_Field**：Agent_Frontmatter 中的 `model` 字段，接受 `haiku`、`sonnet`、`opus`、`inherit` 值，决定该 Agent 使用哪个模型别名。`inherit` 表示继承主 Agent 的模型。
- **Effort_Field**：Agent_Frontmatter 中的 `effort` 字段，控制推理深度（`low`、`medium`、`high`），影响模型的思考 token 消耗。
- **Explore_Agent**：只读代码库搜索 Agent（`agents/explore.md`），由 Closure_First_Probe 用于文件和代码发现。
- **Review_Agent**：评审阶段的 Subagent（`spec-check`、`quality-check`、`security-check`），执行三层代码评审。
- **Decide_Agent**：决策阶段的 Subagent（`product`、`architect`、`security`），提供多视角决策评估。
- **Prose_Compression**：针对非结构化输出的散文压缩规则集，吸收 Caveman 项目的核心压缩理念，减少冗余词汇和不必要的语法完整性。
- **Structured_Output**：Forge 定义的必须保留的输出格式：TDD 标记、P5 证据链、Restatement 摘要、Closure_First_Probe 结果、评审报告、代码块、commit 消息、安全警告、不可逆操作确认。
- **Restatement_Checkpoint**：周期性上下文刷新机制（定义于 CLAUDE_MD §2.5 和 `forge-build/SKILL.md` §3.2），在上下文尾部追加摘要。
- **Restatement_Summary**：Restatement_Checkpoint 追加的摘要块，当前为 5 块格式，token 预算 1500。
- **Decision_Point**：需要用户或 AI 做出选择的节点，允许简要说明理由。非 Decision_Point 的回复应尽量简短。
- **Opusplan_Mode**：Claude Code 的内置模型别名，在 plan 模式使用 opus、在执行模式使用 sonnet，实现自动的推理/执行分层。
- **Caveman**：GitHub 上的开源项目（JuliusBrussee/caveman），提供极端散文压缩规则。Forge 不安装 Caveman，而是将其核心规则吸收到 §2.6。
- **CLAUDE_MD**：项目宪法文件（`CLAUDE.md`），定义所有 Agent 行为准则。
- **SKILL_File**：技能定义文件（`skills/*/SKILL.md`），定义各 `/forge` 命令的详细执行逻辑。

## 需求

### 需求 1：Agent 级模型路由

**用户故事：** 作为 Forge 用户，我希望不同角色的 Agent 自动使用与其任务复杂度匹配的模型，以在不降低关键决策质量的前提下降低 30-50% 的 token 成本。

#### 验收标准

1. WHEN Explore_Agent 被调度执行 Closure_First_Probe 时，Explore_Agent 的 Agent_Frontmatter 应将 Model_Field 设置为 `haiku`，因为 Explore_Agent 仅执行文件搜索和 grep 操作，不需要强推理能力。
2. WHEN Review_Agent（`spec-check`、`quality-check`、`security-check`）被调度执行代码评审时，每个 Review_Agent 的 Agent_Frontmatter 应将 Model_Field 设置为 `sonnet`，因为代码评审需要中等推理能力。
3. WHEN Decide_Agent（`product`、`architect`、`security`）被调度执行决策评估时，每个 Decide_Agent 的 Agent_Frontmatter 应将 Model_Field 保持为 `inherit`，因为架构决策需要强推理能力。
4. WHEN `designer` Agent 被动态加入 decide 团队时，`designer` Agent 的 Agent_Frontmatter 应将 Model_Field 保持为 `inherit`。
5. WHEN `critic` Agent 被调度执行对抗性审查时，`critic` Agent 的 Agent_Frontmatter 应将 Model_Field 保持为 `inherit`，因为对抗性审查需要强推理能力。
6. WHEN `debugger` Agent 被调度执行根因分析时，`debugger` Agent 的 Agent_Frontmatter 应将 Model_Field 保持为 `inherit`，因为调试需要强推理能力。
7. THE Model_Field 应仅接受 Claude Code 的模型别名值（`haiku`、`sonnet`、`opus`、`inherit`），不接受具体模型名称（如 `glm-5.1`、`claude-sonnet-4-20250514`）。
8. WHEN 用户通过 `CLAUDE_CODE_SUBAGENT_MODEL` 环境变量设置全局 Subagent 模型覆盖时，该环境变量应覆盖 Agent_Frontmatter 中的 Model_Field 设置。
9. THE Agent_Frontmatter 的 Model_Field 变更应同时应用于 `.claude/agents/` 和 `agents/` 两个目录下的对应文件，保持两处定义一致。
10. WHEN Explore_Agent 的 Model_Field 从 `inherit` 变更为 `haiku` 后，Explore_Agent 应继续正确执行文件搜索和 grep 操作，返回结果的结构和格式不变。

### 需求 2：散文压缩规则

**用户故事：** 作为 Forge 用户，我希望 AI 的非结构化输出遵循散文压缩规则，以减少 15-25% 的输出 token 消耗，同时保留所有 Forge 结构化输出格式不受影响。

#### 验收标准

1. CLAUDE_MD §2.6 Output Conciseness 应定义以下散文压缩规则，适用于所有非 Structured_Output 的文本输出：
   - 省略冠词（a/an/the）、填充词（just/really/basically/actually/simply）
   - 省略客套话（sure/certainly/of course/happy to）和模棱两可的措辞
   - 使用短同义词（big 而非 extensive，fix 而非 implement a solution for）
   - 允许句子片段，不要求完整语法
   - 模式：`[事物] [动作] [原因]。[下一步]。`
2. WHEN AI 完成文件编辑操作后，AI 应输出变更摘要（如 `+5 lines in src/config.ts`），不应回显整个文件内容。
3. WHEN AI 面对非 Decision_Point 的任务时，AI 应直接给出推荐方案并执行，不应列出多个备选方案供选择。
4. WHEN AI 面对 Decision_Point 时，AI 应允许简要说明理由，格式为 `[原因] → [选择] → [依据]`。
5. WHEN Subagent 返回执行结果时，返回内容应为结构化摘要，不应包含过程叙述。
6. WHILE 非 Decision_Point 回复中，AI 的散文输出不应超过 200 tokens。
7. THE 以下 Structured_Output 格式应完全豁免于散文压缩规则，无论 token 限制如何均不得压缩或省略：
   - TDD 标记（🔴 RED / 🟢 GREEN / 🔵 REFACTOR）
   - P5 证据链（`[Command] → [Output] → [Claim]`）
   - Restatement 摘要（进度 + 下一步 + 活跃提示格式）
   - Closure_First_Probe 结果（Probe #1、Probe #2、Verify #1）
   - 评审报告（P0/P1/P2/P3 严重度表格）
   - 代码块和 commit 消息
   - 安全警告和不可逆操作确认
   - 路由分析和前置检查结果
8. WHEN `templates/CLAUDE.md` 被更新以包含散文压缩规则时，模板文件应与 `CLAUDE.md` 保持同步，使 `forge init` 生成的新项目包含相同的压缩规则。
9. IF AI 在散文压缩后的输出导致关键信息丢失（如错误诊断、安全警告），THEN AI 应优先保留关键信息的完整性，散文压缩规则让步于信息完整性。

### 需求 3：Restatement 摘要压缩

**用户故事：** 作为 Forge 用户，我希望 Restatement_Checkpoint 的摘要更精简，以减少 5-10% 的周期性 token 开销，同时保留上下文刷新的核心价值。

#### 验收标准

1. THE Restatement_Summary 的 token 预算应从 1500 tokens 降低到 800 tokens。
2. THE Restatement_Summary 应从 5 块格式简化为 3 块格式：
   - 第 1 块：进度（已完成任务列表 + 下一个任务）
   - 第 2 块：下一步（完整标题和文件路径）
   - 第 3 块：活跃提示（从 status.md hints 字段提取的当前活跃提示）
3. THE Restatement_Summary 应移除"执行纪律重申"块，因为这些规则已在 CLAUDE_MD 和 SKILL_File 中定义，重复输出浪费 token。
4. THE Restatement_Summary 的"匹配的直觉模式"块应合并到"活跃提示"块中，仅保留 1 个最相关的匹配模式（而非所有匹配）。
5. WHEN `forge-build/SKILL.md` §3.2 的 Restatement Summary Format 被更新时，新格式应替换现有的 5 块格式定义。
6. WHEN 异常触发的 Restatement（Subagent 返回 BLOCKED/NEEDS_CONTEXT/DONE_WITH_CONCERNS）执行时，异常块应追加在 3 块格式之后，异常块本身不受 800 token 预算限制。
7. THE `forge-build/SKILL.md` §3.2 中的 Token Cost Constraint 应从"单次 Checkpoint ≤1,500 tokens"更新为"单次 Checkpoint ≤800 tokens"。

### 需求 4：opusplan 模式推荐

**用户故事：** 作为 Forge 用户，我希望了解 opusplan 模式的成本优化效果和启用方法，以便在需要时选择使用，获得 20-40% 的额外 token 节省。

#### 验收标准

1. THE Forge 用户指南（`README.md` 或 `docs/` 下的专门文档）应包含 opusplan 模式的说明章节。
2. THE opusplan 说明应解释其工作原理：plan 模式使用 opus（复杂推理），执行模式使用 sonnet（代码生成），实现自动的推理/执行分层。
3. THE opusplan 说明应记录启用方法：在 Claude Code 会话中输入 `/model opusplan`，或启动时使用 `claude --model opusplan`。
4. THE opusplan 说明应记录预期的成本节省范围（20-40%），并说明实际节省取决于任务中推理与执行的比例。
5. THE opusplan 模式应作为用户自愿选择的推荐，Forge 不应在任何配置文件或脚本中强制启用 opusplan。
6. IF 用户启用 opusplan 模式，THEN Forge 的所有工作流（plan、build、review、test、ship、learn）应正常运行，不因模型切换而中断。
7. THE opusplan 说明应注明该模式与需求 1 的 Agent 级模型路由是互补关系：opusplan 控制主 Agent 的推理/执行分层，Agent 级路由控制 Subagent 的模型选择。
