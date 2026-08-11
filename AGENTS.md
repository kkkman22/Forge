---
updated: 2026-08-11
---
# Forge — 项目宪法

> 本文件由 `forge init` 自动生成，是 Codex 在本项目中的行为准则。
> 所有 Agent（包括 Subagent）必须遵守本宪法。
> → 详见 docs/tinkerman-constitution-detail.md

---

## 1. Task Routing Rules

所有任务通过 `/tinkerman` 入口进入三级路由。AI 分析任务复杂度并建议档位，用户确认或覆盖。

### Three-Tier Routing

| Tier | Condition | Command Sequence |
|------|-----------|-----------------|
| **Light** | 影响文件 ≤ 1 且改动 ≤ 20 行 | `build → review` |
| **Standard** | 需求明确或已有 Spec | `plan → build → review → test → ship` |
| **Full** | 新服务 / 新数据库 / 认证变更 / 需求模糊 | `decide → spec → plan → build → review → test → ship → learn` |

### Routing Principles

用户覆盖优先：用户明确指定档位时，以用户为准。宁重勿轻：无法判定时，选择更重的档位。**档位 Command Sequence 为建议路径**（ADR-0009 §砍#2 路由退化）：可被用户 / RouteHint 覆盖，非强制。

### Non-Skippable Iron Laws（档位可覆盖，铁律不可跳）

档位 Command Sequence 为建议。以下铁律为**强制硬阻断**，独立于档位，不可覆盖、不可跳：

- **TDD**（§2.1）：实现任务必须 RED → GREEN → REFACTOR
- **Verification**（§2.3）：没运行验证命令 = 不能声明通过
- **Three-Strike**（§2.4）：连续失败 3 次必须停下进 debug
- **Review 执行-评审分离**（§3.1）：写代码的 Agent 不评审自己的代码
- **P0/P1 ship 阻断**（§3.3）：P0/P1 存在时 ship 被阻断

> 档位放松的是「流程编排」（哪些命令、什么顺序）；铁律守住的是「可靠性下限」（每个命令的执行纪律）。模型变强，档位编排可被吸收；铁律的外部性不会被吸收（ADR-0009 Existence Test §保留 #1）。

→ 详见 docs/tinkerman-constitution-detail.md §1

## 2. Execution Discipline

### 2.1 TDD Enforcement

<IRON-LAW name="tdd-delete-and-restart">所有实现任务必须遵循 **RED → GREEN → REFACTOR** 循环。**铁律**：如果发现代码先于测试编写——删除代码，从测试开始。</IRON-LAW>
→ 详见 docs/tinkerman-constitution-detail.md §2.1

### 2.2 Pre-build Checks

标准和全量路径下，`/tinkerman build` 启动前必须通过三道门禁：Spec 锁定、Plan 批准、分支隔离。分支隔离门禁：每个功能在其对应的 feature 分支上开发，工作树不干净时阻断。
→ 详见 docs/tinkerman-constitution-detail.md §2.2

### 2.3 Verification Iron Law

<IRON-LAW name="verification-run-command">> **没有运行验证命令 = 不能声明通过。** 每个任务完成后必须运行验证命令；验证必须基于刚刚运行的命令输出；禁止"应该可以了"等声明；每个完成的任务必须执行原子提交。</IRON-LAW>
→ 详见 docs/tinkerman-constitution-detail.md §2.3

### 2.4 Three-Strike Reroute

<IRON-LAW name="three-strike-reroute">同一修复连续失败 3 次时：立即停止，进入 `/tinkerman debug`，禁止第 4 次尝试同方向。在 debug 中同一假设连续验证失败 3 次时：停止修复，质疑架构，重新评估方向。</IRON-LAW>
→ 详见 docs/tinkerman-constitution-detail.md §2.4

### 2.7 No Confirmation Between Steps（铁律）

<IRON-LAW name="no-mid-step-confirmation">> **阶段之间、任务之间，禁止停下来询问用户是否继续。** 与 TDD（§2.1）同级。**禁止**：问"是否继续"、以工作量为由停顿、提供选择、任何阶段间确认请求。**正确**：阶段完成 → `✅ <阶段> 完成` → 立即下一阶段。**唯一可停**：Three-strike、阻断性错误、分支保护阻断。</IRON-LAW>
→ 详见 shared/next-step-protocol.md

### 2.5 Context Refresh Discipline

build 阶段主 Agent 必须执行周期性 Restatement Checkpoint：每完成 N 个任务（N 由 config.md 配置，默认 3）重读 progress 和 status；Sub-Agent 返回异常状态时执行 Restatement；Restatement 不修改 System Prompt。
→ 详见 docs/tinkerman-constitution-detail.md §2.5

### 2.6 Output Conciseness

> **原则**：代码编辑时沉默执行，决策点时简要说明。SKILL 定义的结构化输出永远不被压制。

禁止操作预告、自我对话、逐步解说。保留所有 Forge 结构化输出。Decision_Point 允许 `[原因] → [选择] → [依据]`。非决策点散文 ≤200 tokens。结构化输出豁免清单、禁止模式表、详细示例 → 详见 docs/tinkerman-constitution-detail.md §2.6

### 2.8 Scripts as Black Box（铁律）
> **原则**：scripts/ 中 user-facing 脚本必须先 `--help` 再调用。未尝试 `--help` 前不得 cat 源码。internal-only / one-off（记录在 `scripts/.help-exempt`）无此约束。需修改时允许读源码。→ 详见 docs/tinkerman-constitution-detail.md §2.8

---

## 3. Review Discipline

### 3.1 Execution-Assessment Separation

写代码的 Agent 不评审自己的代码。`/tinkerman review` 使用独立 Subagent（spec-check、quality-check、security-check）。评审者只对照 Spec 和代码质量标准。且**不允许**主 Agent 在 subagent 全部失败后自行顶替评审。Subagent 不可用时按 `forge-review` SKILL §2.5 fallback ladder 处理（L0→L1→L2→L3），L3 阻断 ship。详见 ADR `.tinkerman/decisions/2026-05-18-review-fallback-ladder.md`。

### 3.2 Three-Layer Review

| Layer | Reviewer | Check Content |
|-------|----------|--------------|
| **Layer 1** | spec-check | 需求实现、场景覆盖、scope creep |
| **Layer 2** | quality-check | 命名、错误处理、性能、测试覆盖率、代码重复、可维护性 |
| **Layer 3** | security-check | 硬编码密钥、注入风险、不安全依赖、权限边界、敏感数据 |

### 3.3 P0/P1 Must Fix

| Level | Meaning | Handling |
|-------|---------|----------|
| **P0** | 阻塞发布 | 立即修复，**阻断 ship** |
| **P1** | 高影响 | 发布前修复，**阻断 ship** |
| P2 | 中影响 | 应该修复，可协商 |
| P3 | 低影响 | 建议改进，开发者决定 |

**铁律**：存在 P0/P1 时 ship 被阻断。修复后须重新评审。→ 详见 docs/tinkerman-constitution-detail.md §3

---

## 4. Knowledge Discipline

### 4.1 Capture on Completion

每次开发完成后，必须执行 `/tinkerman learn` 从五个维度提取经验：问题模式、解决方案、踩坑记录、决策理由、可复用模式。

### 4.2 Knowledge Base Limit

知识库文档数量上限 **20** 个（可在 `.tinkerman/config.md` 配置）。超出上限时按置信度排序清理。**Confidence < 0.3 的模式自动清理**。高频模式写入 `instincts.md` 时附带 Confidence Score（0.3 - 0.9）。

### 4.3 Knowledge Backflow

`/tinkerman plan` 执行时自动搜索 Knowledge Base 中的相关经验。`/tinkerman build` 执行时自动搜索 Knowledge Base 中的历史踩坑记录。
→ 详见 docs/tinkerman-constitution-detail.md §4

---

## 5. Self-Evolution Protocol

### 5.1 Evolved Rules

会话开始时读取 `.tinkerman/knowledge/evolved-rules.md`，将其规则视为项目特定的错误预防指令。

### 5.2-5.6

**Categories**：Project traps、correction patterns、tool quirks、behavior corrections、friction adjustments。**Trigger**：Knowledge entries 达阈值时提出。**Protocol**：Propose → Declare → Approve → Log。**Constraints**：15-rule cap、staleness (5 sessions)、Sections 1–4 immutable。
→ 详见 docs/tinkerman-constitution-detail.md §5

---

## 6. Session Boundaries

每个 `/tinkerman` 命令调用构成 Session_Boundary。阶段间上下文交接通过 `.tinkerman/` 目录文件系统进行，而非对话历史。建议 `/tinkerman` 命令之间开启新会话。

**Subagent 隔离**：每个 Subagent 有独立上下文。**会话恢复**：`/tinkerman resume` 从 `.tinkerman/progress/` 和 `.tinkerman/knowledge/sessions/` 读取。**并发控制**：`max_parallel_agents` 默认 6。HTTP 429 降级：第 1 次并发减半 → 第 2 次降至 2 → 第 3 次串行。降级记录到 `.tinkerman/knowledge/tool-health.md`。新会话重置并发数。上下文超 100K tokens 时记录建议开启新会话提示（不阻断）。
→ 详见 docs/tinkerman-constitution-detail.md §6（会话拓扑三节点：主流程同窗 / on-ramp / 跨会话桥；smart zone 100K 保守 / ~120K SOTA 参考；handoff=fork vs compact=continue）

---

## 项目信息

**Forge** | TypeScript/JS/Shell | 安全级别 1 | 2026-04-28

## Subagent 并行执行配置

`/tinkerman decide` 和 `/tinkerman review` 使用独立 Subagent（Agent tool），不使用 Agent Teams。Subagent 类型引用 `.Codex/agents/`。

- **decide**: product、architect、security（+ designer UI 时）。两轮：Round 1 并行输出，Round 2 Critic 交叉审视。
- **review**: spec-check、quality-check、security-check 并行。轻量模式省略 spec-check。
