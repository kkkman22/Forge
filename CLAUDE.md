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

- **用户覆盖优先**：用户明确指定档位时，以用户为准。
- **宁重勿轻**：无法判定时，选择更重的档位。
- **不可跳步**：选定档位后，必须按序执行对应的命令序列。
→ 详见 docs/forge-constitution-detail.md §1

---

## 2. Execution Discipline

### 2.1 TDD Enforcement

所有实现任务必须遵循 **RED → GREEN → REFACTOR** 循环。

**铁律**：如果发现代码先于测试编写——删除代码，从测试开始。没有例外。
→ 详见 docs/forge-constitution-detail.md §2.1

### 2.2 Pre-build Checks

在标准和全量路径下，`/forge build` 启动前必须通过三道门禁：Spec 锁定、Plan 批准、分支隔离。

**分支隔离门禁**：每个功能在其对应的 feature 分支上开发，工作树不干净时阻断。
→ 详见 docs/forge-constitution-detail.md §2.2

### 2.3 Verification Iron Law

> **没有运行验证命令 = 不能声明通过。**

- 每个任务完成后，必须运行对应的验证命令。
- 验证必须基于**刚刚运行**的命令输出，拒绝引用之前的测试结果。
- 以下声明一律拒绝接受："应该可以了"、"看起来没问题"、"之前测试通过了"、"逻辑上没问题"。
- 每个完成的任务必须执行**原子提交**。
→ 详见 docs/forge-constitution-detail.md §2.3

### 2.4 Three-Strike Reroute

当同一修复连续失败 **3 次**时：立即停止当前修复尝试，进入 `/forge debug` 进行结构化根因分析，禁止第 4 次尝试同一方向的修复。

在 `/forge debug` 中，如果同一假设连续验证失败 3 次：停止修复，质疑架构，与开发者讨论重新评估方向。
→ 详见 docs/forge-constitution-detail.md §2.4

### 2.5 Context Refresh Discipline

在标准路径和全量路径的 build 阶段，主 Agent 必须执行周期性的 Restatement Checkpoint：每完成 N 个任务（N 由 config.md 配置，默认 3）重读 progress 和 status；Sub-Agent 返回异常状态时执行 Restatement；Restatement 不修改 System Prompt，只追加到对话尾部。
→ 详见 docs/forge-constitution-detail.md §2.5

### 2.6 Output Conciseness

> **原则**：代码编辑时沉默执行，决策点时简要说明。SKILL 定义的结构化输出永远不被压制。

- 禁止操作预告、自我对话、逐步解说、步骤枚举、工具调用预告。
- 保留所有 Forge 结构化输出：TDD 标记、Closure-First 探针结果、Restatement 摘要、P5 证据链、评审报告、路由分析、前置检查结果、进度更新。
- Decision_Point（设计选择、意外情况、计划调整、方向变更、阻塞报告）允许简要说明：`[原因] → [选择] → [依据]`。
→ 详见 docs/forge-constitution-detail.md §2.6

---

## 3. Review Discipline

### 3.1 Execution-Assessment Separation

- **写代码的 Agent 不评审自己的代码**
- `/forge review` 使用独立 Subagent（spec-check、quality-check、security-check）
- 评审者只对照 Spec 和代码质量标准，不受实现过程的上下文影响

### 3.2 Three-Layer Review

| Layer | Reviewer | Check Content |
|-------|----------|--------------|
| **Layer 1: Spec Alignment** | spec-check | 需求实现、场景覆盖、scope creep 检查 |
| **Layer 2: Code Quality** | quality-check | 命名一致性、错误处理、性能、测试覆盖率、代码重复、可维护性 |
| **Layer 3: Security & Risk** | security-check | 硬编码密钥、注入风险、不安全依赖、权限边界、敏感数据泄露 |

### 3.3 P0/P1 Must Fix

| Level | Meaning | Handling |
|-------|---------|----------|
| **P0** | 阻塞发布 | 必须立即修复，**阻断 `/forge ship`** |
| **P1** | 高影响 | 必须在发布前修复，**阻断 `/forge ship`** |
| P2 | 中影响 | 应该修复，可协商时间 |
| P3 | 低影响 | 建议改进，开发者自行决定 |

**铁律**：存在 P0 或 P1 问题时，`/forge ship` 被阻断。修复后必须重新评审。
→ 详见 docs/forge-constitution-detail.md §3

---

## 4. Knowledge Discipline

### 4.1 Capture on Completion

每次开发完成后，必须执行 `/forge learn` 从五个维度提取经验：问题模式、解决方案、踩坑记录、决策理由、可复用模式。

### 4.2 Knowledge Base Limit

- 知识库文档数量上限：**20** 个（默认 20，可在 `.forge/config.md` 中配置）
- 超出上限时，按置信度排序，清理最低置信度的文档
- **Confidence < 0.3 的模式自动清理**
- 高频模式写入 `instincts.md` 时附带 Confidence Score（0.3 - 0.9）

### 4.3 Knowledge Backflow

- `/forge plan` 执行时自动搜索 Knowledge Base 中的相关经验
- `/forge build` 执行时自动搜索 Knowledge Base 中的历史踩坑记录
→ 详见 docs/forge-constitution-detail.md §4

---

## 5. Self-Evolution Protocol

### 5.1 Evolved Rules

At session start, read `.forge/knowledge/evolved-rules.md` and treat its rules as project-specific error-prevention directives.

### 5.2 Updatable Knowledge Categories

Categories qualifying as rule candidates: Project-specific traps (known-failures.md, occurrence >= 3), Repeated correction patterns (instincts.md, confidence >= 0.8), Environment/tool quirks (skill-feedback.md, frequency >= 3), Cross-session behavior corrections (session journals, same issue in 3+ sessions), Rule friction adjustments (metrics.md, 3+ session degradation trend).

### 5.3-5.6

**Trigger Conditions**：Rules proposed only when knowledge entries meet numeric thresholds.
**Correction Protocol**：Propose → Declare → Approve → Log.
**Constraints**：15-rule cap, staleness policy (5 sessions), guarded zone, Sections 1–4 immutable.
**Exclusions**：Architecture descriptions, file path lists, general best practices, raw knowledge data, tool-enforced standards.
→ 详见 docs/forge-constitution-detail.md §5

---

## 6. Session Boundaries

每个 `/forge` 命令调用（plan、build、review、test、ship、learn）构成一个自然的 Session_Boundary。阶段间的上下文交接通过 `.forge/` 目录文件系统进行，而非通过对话历史。建议用户在 `/forge` 命令之间开启新的 Claude Code 会话，以避免上下文累积。

**Subagent 隔离**：每个 Subagent 有独立上下文，是防止阶段内上下文膨胀的主要机制。

**会话恢复**：`/forge resume` 是会话边界后恢复上下文的推荐方法，从 `.forge/progress/` 和 `.forge/knowledge/sessions/` 读取。

如果用户在单个会话中继续执行多个 `/forge` 命令，Agent 不应阻断执行，但当上下文大小超过 100K tokens 时应记录建议开启新会话的提示。

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

**并发控制**：通过 `.forge/config.md` 中的 `max_parallel_agents` 配置（默认 6）。收到 HTTP 429 限流响应时实施降级：第 1 次等待 30s 并将并发数减半（最小 1）；第 2 次等待 60s 并将并发数降至 2；第 3 次及以上等待 60s 并切换为串行执行（并发数 1）。每次降级记录到 `.forge/knowledge/tool-health.md`。新的 `/forge` 命令启动新会话时将并发数重置为配置的 `max_parallel_agents` 值。

启动团队时，使用 subagent 定义名称生成队友。团队完成后清理资源。
