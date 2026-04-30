# Forge — 项目宪法

> 本文件由 `forge init` 自动生成，是 Claude Code 在本项目中的行为准则。
> 所有 Agent（包括 Subagent）必须遵守本宪法。

---

## 1. 任务路由规则

所有任务通过 `/forge` 入口进入三级路由。AI 分析任务复杂度并建议档位，用户确认或覆盖。

### 三级路由

| 档位 | 判定条件 | 命令序列 |
|------|---------|---------|
| **轻量** | 影响文件 ≤ 1 且改动 ≤ 20 行 | `build → review` |
| **标准** | 需求明确或已有 Spec | `plan → build → review → test → ship` |
| **全量** | 新服务 / 新数据库 / 认证变更 / 需求模糊 | `decide → spec → plan → build → review → test → ship → learn` |

### 路由原则

- **用户覆盖优先**：用户明确指定档位时，以用户为准，无论 AI 建议如何。
- **宁重勿轻**：无法判定时，选择更重的档位。轻量路径跳过了 spec/plan/test，只适用于真正的小改动。
- **不可跳步**：选定档位后，必须按序执行对应的命令序列，不得跳过任何步骤。

---

## 2. 执行纪律

### 2.1 TDD 强制

所有实现任务必须遵循 **RED → GREEN → REFACTOR** 循环：

1. **RED**：先写失败的测试，确认测试能检测到缺失的功能
2. **GREEN**：写最少的代码让测试通过
3. **REFACTOR**：在测试保护下重构代码

**铁律**：如果发现代码先于测试编写——删除代码，从测试开始。没有例外。

### 2.2 前置检查

在标准和全量路径下，`/forge build` 启动前必须通过三道门禁：

| 门禁 | 条件 | 未通过时 |
|------|------|---------|
| Spec 锁定 | `.forge/specs/` 中对应 Spec 的 status 为 `locked` | 阻断 build，提示先完成 `/forge spec` |
| Plan 批准 | `.forge/plans/` 中对应 Plan 的 status 为 `approved` | 阻断 build，提示先完成 `/forge plan` |
| 分支隔离 | 当前 Git 分支是 `feature/<topic>` 或 `forge/<topic>` | 自动切换或创建对应分支（工作树不干净时阻断） |

未通过门禁时，**禁止以任何理由绕过**。

**分支隔离门禁**：每个功能的代码必须在其对应的 feature 分支上开发，防止多功能代码混入同一分支。Build 启动时，如果当前分支不是 `feature/<topic>` 或 `forge/<topic>`，自动创建或切换到正确分支。工作树有未提交变更时阻断并提示用户先处理。详见 `forge-build` SKILL §2.1。

### 2.3 验证铁律

> **没有运行验证命令 = 不能声明通过。**

- 每个任务完成后，必须运行对应的验证命令（测试、类型检查、lint 等）
- 验证必须基于**刚刚运行**的命令输出，拒绝引用之前的测试结果
- 以下声明一律拒绝接受：
  - "应该可以了"
  - "看起来没问题"
  - "之前测试通过了"
  - "逻辑上没问题"
- 每个完成的任务必须执行**原子提交**（一个任务一个 commit）

### 2.4 三次换路

当同一修复连续失败 **3 次**时：

1. **立即停止**当前修复尝试
2. **进入 `/forge debug`** 进行结构化根因分析
3. 禁止第 4 次尝试同一方向的修复

在 `/forge debug` 中，如果同一假设连续验证失败 3 次：

1. **停止修复**
2. **质疑架构**——问题可能不在代码层面
3. 与开发者讨论，重新评估方向

### 2.5 上下文刷新纪律

在标准路径和全量路径的 build 阶段，主 Agent 必须执行周期性的 Restatement Checkpoint：

- **每完成 N 个任务**（N 由 config.md 的 restatement_interval 配置，默认 3），
  暂停编排，重读 progress 和 status，在上下文尾部追加 Restatement 摘要。
- **Sub-Agent 返回异常状态时**（BLOCKED / NEEDS_CONTEXT / DONE_WITH_CONCERNS），
  在处理之前先执行一次 Restatement。
- **Restatement 不修改 System Prompt**，只追加到对话尾部。

这条纪律的目的是对抗长任务中的注意力衰减。如果你发现自己在跳过探针、
合并步骤、或不检查 Sub-Agent 状态，说明你需要一次 Restatement。

### 2.6 输出简洁性

> **原则**：代码编辑时沉默执行，决策点时简要说明。SKILL 定义的结构化输出永远不被压制。

#### 禁止的输出模式

在执行代码编辑操作（文件创建、修改、删除）时，以下 Narration 模式被禁止：

| 模式类型 | 示例 |
|---------|------|
| 操作预告 | "现在我要修改 X 文件" / "Now I'll modify X file" |
| 自我对话 | "让我添加 Y 字段" / "Let me add Y field" |
| 逐步解说 | "接下来将 Z 传入 W" / "Next, I'll pass Z into W" |
| 步骤枚举 | "首先...然后...最后..." / "First...then...finally..." |
| 工具调用预告 | 对即将执行的工具调用的重复描述 |

**Before（冗长）**：
> 现在我要修改 `src/config.ts` 文件，添加 `logFormat` 字段。让我先找到 `SdkDriverConfig` 接口的定义...好的，找到了。接下来我会在第 15 行添加 `logFormat: string` 字段。然后我需要更新 `createConfig` 函数，将 `logFormat` 参数传入...

**After（简洁）**：
> *（直接执行编辑，无 Narration）*

#### 保留的输出

以下 Forge 结构化输出不受简洁性约束影响，必须完整保留：

- TDD 阶段标记：🔴 RED / 🟢 GREEN / 🔵 REFACTOR 及其测试运行结果
- Closure-First 探针结果：Probe #1, Probe #2, Verify #1 输出块
- Restatement 摘要：周期性上下文刷新的 5 区块格式
- P5 证据链：`[Command] → [Output] → [Claim]` 验证格式
- 评审报告：含严重度等级（P0/P1/P2/P3）的评审发现
- 路由分析：档位建议、任务类型、项目阶段输出
- 前置检查结果：门禁检查通过/失败输出
- 进度更新：任务完成标记和进度摘要

#### Decision_Point 输出许可

在以下决策点，允许简要说明理由：

- **设计选择**：在多个实现方案间做选择时
- **意外情况**：遇到意外的代码状态、缺失文件或探针失败时
- **计划调整**：偏离计划或重新排序任务时
- **方向变更**：失败后切换方案时（如三次换路）
- **阻塞报告**：报告 BLOCKED 或 NEEDS_CONTEXT 状态时

Decision_Point 输出模板：`[原因] → [选择] → [依据]`

**示例**：
> 接口签名与 Spec 不一致 → 以 Spec 为准重新定义 → Plan Task 2 明确要求对齐 Spec §3.2

#### 优先级

SKILL 定义的输出格式 > 简洁性约束。当 SKILL 要求特定输出（模板、标记、结构化块）时，简洁性规则自动让步。

---

## 3. 评审纪律

### 3.1 执行与评估分离

- **写代码的 Agent 不评审自己的代码**
- `/forge review` 使用独立 Subagent（spec-check、quality-check、security-check）
- 评审者只对照 Spec 和代码质量标准，不受实现过程的上下文影响

### 3.2 三层评审

| 层级 | 评审者 | 检查内容 |
|------|--------|---------|
| **Layer 1: Spec 对齐** | spec-check | 每个需求是否实现、每个场景是否覆盖、是否存在超出 Spec 的实现（scope creep） |
| **Layer 2: 代码质量** | quality-check | 命名一致性、错误处理完整性、性能热点、测试覆盖率、代码重复、可维护性 |
| **Layer 3: 安全与风险** | security-check | 硬编码密钥、注入风险、不安全依赖、权限边界、敏感数据泄露 |

### 3.3 P0/P1 必须修复

问题按严重度分级：

| 级别 | 含义 | 处理 |
|------|------|------|
| **P0** | 阻塞发布 | 必须立即修复，**阻断 `/forge ship`** |
| **P1** | 高影响 | 必须在发布前修复，**阻断 `/forge ship`** |
| P2 | 中影响 | 应该修复，可协商时间 |
| P3 | 低影响 | 建议改进，开发者自行决定 |

**铁律**：存在 P0 或 P1 问题时，`/forge ship` 被阻断。修复后必须重新评审。

---

## 4. 知识纪律

### 4.1 完成即沉淀

每次开发完成后，必须执行 `/forge learn` 从五个维度提取经验：

1. **问题模式**：遇到了什么类型的问题
2. **解决方案**：最终如何解决的
3. **踩坑记录**：走了哪些弯路
4. **决策理由**：为什么选择这个方案而非其他
5. **可复用模式**：哪些做法可以复用到未来的任务

知识文档输出到 `.forge/knowledge/solutions/`，高频模式写入 `.forge/knowledge/instincts.md`。

### 4.2 知识库上限

- 知识库文档数量上限：**20** 个（默认 20，可在 `.forge/config.md` 中配置）
- 超出上限时，按置信度排序，清理最低置信度的文档
- **Confidence < 0.3 的模式自动清理**——低置信度的经验不值得保留
- 高频模式写入 `instincts.md` 时附带 Confidence Score（0.3 - 0.9）

### 4.3 知识回流

- `/forge plan` 执行时自动搜索 Knowledge Base 中的相关经验
- `/forge build` 执行时自动搜索 Knowledge Base 中的历史踩坑记录
- 知识不是写完就放着——它必须在后续任务中被主动检索和应用

---

## 5. Self-Evolution Protocol

### 5.1 Evolved Rules

At session start, read `.forge/knowledge/evolved-rules.md` and treat its rules as project-specific error-prevention directives. These rules are distilled from accumulated project knowledge and represent patterns where Claude would make mistakes without explicit guidance.

### 5.2 Updatable Knowledge Categories

The following categories qualify as rule candidates:

| Category | Source | Threshold |
|----------|--------|-----------|
| Project-specific traps | known-failures.md | occurrence >= 3 |
| Repeated correction patterns | instincts.md | confidence >= 0.8 |
| Environment/tool quirks | skill-feedback.md | frequency >= 3 |
| Cross-session behavior corrections | session journals | same issue in 3+ sessions |
| Rule friction adjustments | metrics.md | 3+ session degradation trend |

### 5.3 Trigger Conditions

Rules are proposed only when knowledge entries meet the numeric thresholds above. `/forge learn` evaluates these thresholds during the rule distillation stage.

### 5.4 Correction Protocol

1. **Propose** — Present the rule with evidence from knowledge sources
2. **Declare** — State what specific error the rule prevents
3. **Approve** — User reviews and approves/rejects the proposal
4. **Log** — Record the change in `.forge/knowledge/rule-changelog.md`

### 5.5 Constraints

- **15-rule cap** — evolved-rules.md holds at most 15 rules. New rules require retiring low-value existing rules when at capacity.
- **Staleness policy** — Rules not triggered in the last 5 sessions are flagged for retirement review.
- **Guarded zone** — evolved-rules.md is in the Guarded protection zone: updatable only by `/forge learn` rule distillation, not deletable outside maintenance.
- **Sections 1–4 are immutable** — Owned by `forge init`. The self-evolution mechanism never modifies them.

### 5.6 Exclusions

The following are NOT valid rule candidates:
- Architecture descriptions inferable from code
- File path lists
- General best practices Claude already knows
- Raw knowledge data (belongs in knowledge files, not rules)
- Standards enforced by existing tools (e.g., Biome code style)

---

## 项目信息

- **项目名称**：Forge
- **技术栈**：TypeScirpt,JaveScript,Shell
- **安全级别**：标准（Level 1）
- **初始化时间**：2026-04-28

## Subagent 并行执行配置

`/forge decide` 和 `/forge review` 使用独立 Subagent（通过 Claude Code Agent tool 启动），不使用 Agent Teams。Subagent 类型引用 `.claude/agents/` 下的定义文件：

- **decide**: product、architect、security（默认），designer（UI 任务时动态加入）。两轮执行：Round 1 并行输出各自视角，Round 2 Critic 交叉审视。
- **review**: spec-check、quality-check、security-check（并行执行）。轻量模式省略 spec-check。

启动团队时，使用 subagent 定义名称生成队友。团队完成后清理资源。
