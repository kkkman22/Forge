# Forge — 项目宪法

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

---

## 2. Execution Discipline

### 2.1 TDD Enforcement

所有实现任务必须遵循 **RED → GREEN → REFACTOR** 循环。**铁律**：如果发现代码先于测试编写——删除代码，从测试开始。
→ 详见 docs/forge-constitution-detail.md §2.1

### 2.2 Pre-build Checks

标准和全量路径下，`/forge build` 启动前必须通过三道门禁：Spec 锁定、Plan 批准、分支隔离。分支隔离门禁：每个功能在其对应的 feature 分支上开发，工作树不干净时阻断。
→ 详见 docs/forge-constitution-detail.md §2.2

### 2.3 Verification Iron Law

> **没有运行验证命令 = 不能声明通过。**

每个任务完成后必须运行验证命令；验证必须基于刚刚运行的命令输出；禁止"应该可以了"等声明；每个完成的任务必须执行原子提交。
→ 详见 docs/forge-constitution-detail.md §2.3

### 2.4 Three-Strike Reroute

同一修复连续失败 3 次时：立即停止，进入 `/forge debug`，禁止第 4 次尝试同方向。在 debug 中同一假设连续验证失败 3 次时：停止修复，质疑架构，重新评估方向。
→ 详见 docs/forge-constitution-detail.md §2.4

### 2.5 Context Refresh Discipline

build 阶段主 Agent 必须执行周期性 Restatement Checkpoint：每完成 N 个任务（N 由 config.md 配置，默认 3）重读 progress 和 status；Sub-Agent 返回异常状态时执行 Restatement；Restatement 不修改 System Prompt。
→ 详见 docs/forge-constitution-detail.md §2.5

### 2.6 Output Conciseness

> **原则**：代码编辑时沉默执行，决策点时简要说明。SKILL 定义的结构化输出永远不被压制。

禁止操作预告、自我对话、逐步解说。保留所有 Forge 结构化输出：TDD 标记、Closure-First 探针结果、Restatement 摘要、P5 证据链、评审报告、路由分析、前置检查结果、进度更新。Decision_Point 允许简要说明：`[原因] → [选择] → [依据]`。

#### 词汇压缩

省略冠词（a/an/the）、填充词（just/really/basically/actually/simply）。省略客套话（sure/certainly/of course/happy to）。使用短同义词（big 而非 extensive，fix 而非 implement a solution for）。允许句子片段。模式：`[事物] [动作] [原因]。[下一步]。`

#### 行为规则

- 文件编辑后输出变更摘要（如 `+5 lines in src/config.ts`），不回显文件内容
- 非 Decision_Point 直接给推荐方案并执行，不列备选
- 非 Decision_Point 散文输出 ≤200 tokens
- Decision_Point 格式：`[原因] → [选择] → [依据]`
- Subagent 返回结构化摘要，不含过程叙述

#### Structured_Output 豁免清单

以下格式完全豁免于散文压缩规则，不得压缩或省略：TDD 标记（🔴 RED / 🟢 GREEN / 🔵 REFACTOR）、P5 证据链、Restatement 摘要、Closure-First 探针结果、评审报告（P0/P1/P2/P3 表格）、代码块、commit 消息、安全警告、不可逆操作确认、路由分析、前置检查结果。

#### 安全阀

散文压缩让步于信息完整性。错误诊断、安全警告优先保留完整细节。
→ 详见 docs/forge-constitution-detail.md §2.6

---

## 3. Review Discipline

### 3.1 Execution-Assessment Separation

写代码的 Agent 不评审自己的代码。`/forge review` 使用独立 Subagent（spec-check、quality-check、security-check）。评审者只对照 Spec 和代码质量标准。

### 3.2 Three-Layer Review

| Layer | Reviewer | Check Content |
|-------|----------|--------------|
| **Layer 1** | spec-check | 需求实现、场景覆盖、scope creep |
| **Layer 2** | quality-check | 命名、错误处理、性能、测试覆盖率、代码重复、可维护性 |
| **Layer 3** | security-check | 硬编码密钥、注入风险、不安全依赖、权限边界、敏感数据 |

### 3.3 P0/P1 Must Fix

| Level | Meaning | Handling |
|-------|---------|----------|
| **P0** | 阻塞发布 | 立即修复，**阻断 `/forge ship`** |
| **P1** | 高影响 | 发布前修复，**阻断 `/forge ship`** |
| P2 | 中影响 | 应该修复，可协商 |
| P3 | 低影响 | 建议改进，开发者决定 |

**铁律**：存在 P0/P1 问题时，`/forge ship` 被阻断。修复后必须重新评审。
→ 详见 docs/forge-constitution-detail.md §3

---

## 4. Knowledge Discipline

### 4.1 Capture on Completion

每次开发完成后，必须执行 `/forge learn` 从五个维度提取经验：问题模式、解决方案、踩坑记录、决策理由、可复用模式。

### 4.2 Knowledge Base Limit

知识库文档数量上限 **20** 个（可在 `.forge/config.md` 配置）。超出上限时按置信度排序清理。**Confidence < 0.3 的模式自动清理**。高频模式写入 `instincts.md` 时附带 Confidence Score（0.3 - 0.9）。

### 4.3 Knowledge Backflow

`/forge plan` 执行时自动搜索 Knowledge Base 中的相关经验。`/forge build` 执行时自动搜索 Knowledge Base 中的历史踩坑记录。
→ 详见 docs/forge-constitution-detail.md §4

---

## 5. Self-Evolution Protocol

### 5.1 Evolved Rules

会话开始时读取 `.forge/knowledge/evolved-rules.md`，将其规则视为项目特定的错误预防指令。

### 5.2-5.6

**Categories**：Project-specific traps、Repeated correction patterns、Environment/tool quirks、Cross-session behavior corrections、Rule friction adjustments。**Trigger**：Knowledge entries 满足数值阈值时提出规则。**Protocol**：Propose → Declare → Approve → Log。**Constraints**：15-rule cap、staleness policy (5 sessions)、guarded zone、Sections 1–4 immutable。**Exclusions**：Architecture descriptions、file path lists、general best practices、raw knowledge data、tool-enforced standards。
→ 详见 docs/forge-constitution-detail.md §5

---

## 6. Session Boundaries

每个 `/forge` 命令调用构成一个自然的 Session_Boundary。阶段间上下文交接通过 `.forge/` 目录文件系统进行，而非对话历史。建议在 `/forge` 命令之间开启新的 Claude Code 会话。

**Subagent 隔离**：每个 Subagent 有独立上下文，是防止阶段内上下文膨胀的主要机制。**会话恢复**：`/forge resume` 是会话边界后恢复上下文的推荐方法，从 `.forge/progress/` 和 `.forge/knowledge/sessions/` 读取。**并发控制**：通过 `.forge/config.md` 中的 `max_parallel_agents` 配置（默认 6）。HTTP 429 降级：第 1 次等待 30s 并发减半（最小 1）；第 2 次等待 60s 并发降至 2；第 3 次及以上等待 60s 切换串行。降级记录到 `.forge/knowledge/tool-health.md`。新会话重置并发数。**上下文阈值提示**：如果用户在单个会话中继续执行多个 `/forge` 命令，当上下文大小超过 100K tokens 时，Agent 应记录建议开启新会话的提示（不阻断执行）。

---

## 项目信息

- **项目名称**：Forge
- **技术栈**：TypeScript, JavaScript, Shell
- **安全级别**：标准（Level 1）
- **初始化时间**：2026-04-28

## Subagent 并行执行配置

`/forge decide` 和 `/forge review` 使用独立 Subagent（通过 Claude Code Agent tool 启动），不使用 Agent Teams。Subagent 类型引用 `.claude/agents/` 下的定义文件。

- **decide**: product、architect、security（默认），designer（UI 任务时动态加入）。两轮执行：Round 1 并行输出各自视角，Round 2 Critic 交叉审视。
- **review**: spec-check、quality-check、security-check（并行执行）。轻量模式省略 spec-check。

启动团队时，使用 subagent 定义名称生成队友。团队完成后清理资源。
