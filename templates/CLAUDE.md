# {{project_name}} — 项目宪法

> 本文件由 `forge init` 自动生成，是 Claude Code 在本项目中的行为准则。
> 所有 Agent（包括 Subagent）必须遵守本宪法。
> → 详见 docs/forge-constitution-detail.md

---

## 1. Task Routing Rules

所有任务通过 `/forge` 入口进入三级路由。AI 分析任务复杂度并建议档位，用户确认或覆盖。

### Three-Tier Routing

| Tier | Condition | Command Sequence |
|------|-----------|-----------------|
| **Light** | 影响文件 ≤ 1 且改动 ≤ 20 行 | `build → review` |
| **Standard** | 需求明确或已有 Spec | `plan → build → review → test → ship` |
| **Full** | 新服务 / 新数据库 / 认证变更 / 需求模糊 | `decide → spec → plan → build → review → test → ship → learn` |

### Routing Principles

用户覆盖优先：用户明确指定档位时，以用户为准。宁重勿轻：无法判定时，选择更重的档位。不可跳步：选定档位后，必须按序执行对应的命令序列。
→ 详见 docs/forge-constitution-detail.md §1

## 2. Execution Discipline

### 2.1 TDD Enforcement

<important if="executing /forge build or /forge plan">
<IRON-LAW name="tdd-delete-and-restart">所有实现任务必须遵循 **RED → GREEN → REFACTOR** 循环。**铁律**：如果发现代码先于测试编写——删除代码，从测试开始。</IRON-LAW> → 详见 docs/forge-constitution-detail.md §2.1

### 2.1.1 Vertical Slice Only（铁律）
每个 TDD 周期必须是一个 **Vertical Slice**：一条测试 → 一段实现 → 重复。禁止 Horizontal Slicing（先写全部测试再写全部实现）。垂直切片让每个测试响应上一轮的实际实现，测试描述的是"代码做了什么"而非"我想让它做什么"。详见 `.forge/glossary.md`。
</important>

### 2.2 Pre-build Checks
标准和全量路径下，`/forge build` 启动前必须通过三道门禁：Spec 锁定、Plan 批准、分支隔离。分支隔离门禁：每个功能在其对应的 feature 分支上开发，工作树不干净时阻断。
→ 详见 docs/forge-constitution-detail.md §2.2

### 2.3 Verification Iron Law

<important if="completing any implementation task">
<IRON-LAW name="verification-run-command">> **没有运行验证命令 = 不能声明通过。** 每个任务完成后必须运行验证命令；验证必须基于刚刚运行的命令输出；禁止"应该可以了"等声明；每个完成的任务必须执行原子提交。</IRON-LAW> → 详见 docs/forge-constitution-detail.md §2.3
</important>

### 2.4 Three-Strike Reroute

<IRON-LAW name="three-strike-reroute">同一修复连续失败 3 次时：立即停止，进入 `/forge debug`，禁止第 4 次尝试同方向。在 debug 中同一假设连续验证失败 3 次时：停止修复，质疑架构，重新评估方向。</IRON-LAW>
→ 详见 docs/forge-constitution-detail.md §2.4

### 2.7 No Confirmation Between Steps（铁律）

<important if="completing a task or phase">
<IRON-LAW name="no-mid-step-confirmation">> **阶段之间、任务之间，禁止停下来询问用户是否继续。** 与 TDD（§2.1）同级。**禁止**：问"是否继续"、以工作量为由停顿、提供选择、任何阶段间确认请求。**正确**：阶段完成 → `✅ <阶段> 完成` → 立即下一阶段。**唯一可停**：Three-strike、阻断性错误、分支保护阻断。</IRON-LAW>
</important>
→ 详见 shared/next-step-protocol.md

### 2.5 Context Refresh Discipline

build 阶段主 Agent 必须执行周期性 Restatement Checkpoint：每完成 N 个任务（N 由 config.md 配置，默认 3）重读 progress 和 status；Sub-Agent 返回异常状态时执行 Restatement；Restatement 不修改 System Prompt。
→ 详见 docs/forge-constitution-detail.md §2.5

### 2.6 Output Conciseness

> **原则**：代码编辑时沉默执行，决策点时简要说明。SKILL 定义的结构化输出永远不被压制。

禁止操作预告、自我对话、逐步解说。保留所有 Forge 结构化输出。Decision_Point 允许 `[原因] → [选择] → [依据]`。非决策点散文 ≤200 tokens。结构化输出豁免清单、禁止模式表、详细示例 → 详见 docs/forge-constitution-detail.md §2.6

### 2.8 Scripts as Black Box（铁律）
> scripts/ 中 user-facing 脚本必须先 `--help` 再调用。未尝试 `--help` 前不得 cat 源码。internal-only（记录在 `scripts/.help-exempt`）无此约束。需修改时允许读源码。→ 详见 docs/forge-constitution-detail.md §2.8

---

## 3. Review Discipline

### 3.1 Execution-Assessment Separation
写代码的 Agent 不评审自己的代码。`/forge review` 使用独立 Subagent。评审者只对照 Spec 和代码质量标准。**不允许**主 Agent 顶替评审。Subagent 不可用时按 fallback ladder 处理（L0→L1→L2→L3），L3 阻断 ship。详见 `.forge/decisions/2026-05-18-review-fallback-ladder.md`。

### 3.2 Three-Layer Review

| Layer | Reviewer | Check Content |
|-------|----------|--------------|
| **Layer 1** | spec-check | 需求实现、场景覆盖、scope creep |
| **Layer 2** | quality-check | 命名、错误处理、性能、测试覆盖率、代码重复、可维护性 |
| **Layer 3** | security-check | 硬编码密钥、注入风险、不安全依赖、权限边界、敏感数据 |

### 3.3 P0/P1 Must Fix

<important if="running /forge review or /forge ship">
| Level | Meaning | Handling |
|-------|---------|----------|
| **P0** | 阻塞发布 | 立即修复，**阻断 ship** |
| **P1** | 高影响 | 发布前修复，**阻断 ship** |
| P2 | 中影响 | 应该修复，可协商 |
| P3 | 低影响 | 建议改进，开发者决定 |

**铁律**：存在 P0/P1 时 ship 被阻断。修复后须重新评审。→ 详见 docs/forge-constitution-detail.md §3
</important>

---

## 4. Knowledge Discipline

### 4.1 Capture on Completion

每次开发完成后，必须执行 `/forge learn` 从五个维度提取经验：问题模式、解决方案、踩坑记录、决策理由、可复用模式。

### 4.2 Knowledge Base Limit

知识库文档数量上限 **{{knowledge_limit}}** 个（可在 `.forge/config.md` 配置）。超出上限时按置信度排序清理。**Confidence < 0.3 的模式自动清理**。高频模式写入 `instincts.md` 时附带 Confidence Score（0.3 - 0.9）。

### 4.3 Knowledge Backflow

`/forge plan` 执行时自动搜索 Knowledge Base 中的相关经验。`/forge build` 执行时自动搜索 Knowledge Base 中的历史踩坑记录。
→ 详见 docs/forge-constitution-detail.md §4

---

## 5. Charter（项目宪章）

`.forge/charter.md` 工程策略锚定（架构边界、技术基线、不可变量）。`/forge charter init/update/check/show` 管理生命周期。`status: active` 时下游 skill（decide/spec/plan/build/review）自动读取摘要（≤500 tokens）作为 grounding 约束；不存在或 `draft` 时正常执行不阻断。build 阶段在 §2.5 Charter Grounding 注入，知情不裁决（裁决仍由 review 的 spec-check 负责）。

## 6. Self-Evolution Protocol

### 6.1 Evolved Rules

会话开始时读取 `.forge/knowledge/evolved-rules.md`，将其规则视为项目特定的错误预防指令。

### 6.2-6.6

**Categories**：Project traps、correction patterns、tool quirks、behavior corrections、friction adjustments。**Trigger**：Knowledge entries 达阈值时提出。**Protocol**：Propose → Declare → Approve → Log。**Constraints**：15-rule cap、staleness (5 sessions)、Sections 1–4 immutable。**Exclusions**：Architecture descriptions、file path lists、general best practices、raw knowledge data、tool-enforced standards。→ 详见 docs/forge-constitution-detail.md §5

## 7. Session Boundaries

每个 `/forge` 命令调用构成 Session_Boundary。阶段间上下文交接通过 `.forge/` 目录文件系统进行，而非对话历史。建议 `/forge` 命令之间开启新会话。

**Subagent 隔离**：每个 Subagent 有独立上下文。**会话恢复**：`/forge resume` 从 `.forge/progress/` 和 `.forge/knowledge/sessions/` 读取。**并发控制**：`max_parallel_agents` 默认 6。HTTP 429 降级：减半 → 降至 2 → 串行。**上下文预算（强制）**：Read >100KB → ⚠️ `/clear`；>150KB → ⛔ `/clear + /forge resume`。<important if="context exceeds 100k tokens or session runs long">上下文超 100K tokens 时，考虑 `/clear` + `/forge resume`。`.forge/` 目录在会话间传递状态。</important>

---
## 项目信息

**{{project_name}}** | {{tech_stack}} | 安全级别 {{security_level}} | {{init_date}}

## Subagent 并行执行配置

`/forge decide` 和 `/forge review` **默认**使用独立 Subagent（Agent tool）。Agent Teams 为可选 Tier-1 模式（`decide-teams` 子命令）。Subagent 类型引用 `.claude/agents/`。详见 `.claude/rules/workflow-fallback-ladder.md`。

- **decide**: product、architect、security（+ designer UI 时）。两轮：Round 1 并行，Round 2 Critic 交叉审视。
- **review**: spec-check、quality-check、security-check 并行。轻量模式省略 spec-check。