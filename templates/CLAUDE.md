# {{project_name}} — 项目宪法

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

在标准和全量路径下，`/forge build` 启动前必须通过两道门禁：

| 门禁 | 条件 | 未通过时 |
|------|------|---------|
| Spec 锁定 | `.forge/specs/` 中对应 Spec 的 status 为 `locked` | 阻断 build，提示先完成 `/forge spec` |
| Plan 批准 | `.forge/plans/` 中对应 Plan 的 status 为 `approved` | 阻断 build，提示先完成 `/forge plan` |

未通过门禁时，**禁止以任何理由绕过**。

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

标准/全量路径的 build 阶段需执行周期性 Restatement Checkpoint，对抗长任务注意力衰减。→ 完整规则（触发条件、N 值配置、摘要格式、异常处理）见 forge-build SKILL.md §3.2。

### 2.6 输出简洁性

> **原则**：代码编辑时沉默执行，决策点时简要说明。SKILL 定义的结构化输出永远不被压制。

#### 禁止的输出模式

代码编辑时禁止：操作预告、自我对话、逐步解说、步骤枚举、工具调用预告。→ 直接执行编辑，无 Narration。

#### 保留的输出

以下 Forge 结构化输出不受简洁性约束，必须完整保留：TDD 标记（🔴/🟢/🔵）、Closure-First 探针、Restatement 摘要、P5 证据链、评审报告（P0-P3）、路由分析、前置检查结果、进度更新。

#### Decision_Point 输出许可

设计选择、意外情况、计划调整、方向变更、阻塞报告时允许简要说明。模板：`[原因] → [选择] → [依据]`。

#### 优先级

SKILL 定义的输出格式 > 简洁性约束。SKILL 要求特定输出时，简洁性规则自动让步。

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

- 知识库文档数量上限：**{{knowledge_limit}}** 个（默认 20，可在 `.forge/config.md` 中配置）
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

- **项目名称**：{{project_name}}
- **技术栈**：{{tech_stack}}
- **安全级别**：{{security_level}}
- **初始化时间**：{{init_date}}

## Subagent 并行执行配置

`/forge decide` 和 `/forge review` 使用独立 Subagent（通过 Claude Code Agent tool 启动），不使用 Agent Teams。Subagent 类型引用 `.claude/agents/` 下的定义文件：

- **decide**: product、architect、security（默认），designer（UI 任务时动态加入）。两轮执行：Round 1 并行输出各自视角，Round 2 Critic 交叉审视。
- **review**: spec-check、quality-check、security-check（并行执行）。轻量模式省略 spec-check。

启动团队时，使用 subagent 定义名称生成队友。团队完成后清理资源。
