---
id: "ADR-0009"
title: "Subtraction Strategy — Converge to External Brake + Organizational Memory"
status: accepted
date: "2026-08-11"
deciders:
  - "@maintainer"
related_adrs:
  - "ADR-0008"
---

# ADR-0009: Subtraction Strategy — Converge to External Brake + Organizational Memory

## Context

**背景矛盾**：模型能力（推理 / plan / 自我验证 / 上下文长度）持续增强，原生 Agent 运行时（Claude Code plan mode、Cursor、IDE 内 TDD 提示）正在吸收大量"曾经需要外部框架做的事"。而 Forge 的演进方向与之**对冲**——越加越厚：

| 指标 | 现状 |
|------|------|
| 命令数 | 38 |
| `scripts/` hook 脚本 | 100+（`inject-evolved-rules` / `stop-incomplete-tasks` / `stop-additional-context` / `forge-prompt-guard` / `forge-read-injection-scanner` / `record-evolved-rule-violation` …） |
| `.tinkerman/specs/` 历史 | 60+ 目录 |
| `.tinkerman/progress/` | 30+ 文件 |
| `evolved-rules.md` | 21KB（宪法 §5.2 规定上限 15 条，实际远超） |
| `tool-health.log` | 52KB |

**诊断**：Forge 已从"立规矩"滑向"用 hook 脚本重新造一个 Agent 运行时"——大量脚本的职责是 babysit 模型（防止偷懒、防止乱注入、防止违规）。这是运行时该干的事，不是方法论层该干的事。规则越加越多、hook 越写越厚 = 与模型变强的方向对冲。

**判定框架**（来自方法论层定位的外部参考）：一个机制只做三件事之一才有存在价值——

1. **钉决策输入**（逼 Agent 先问清楚再做）
2. **补反馈回路**（让它能自我验证）
3. **装刹车**（别在死胡同 / 错误方向上硬撞）

其中"可写成通用默认值"的部分会被变强的模型吸收；**需要外部性**的部分（品味偏好、纪律的强制力、跨会话/跨人的组织记忆）不会被吸收。

> 模型决定你能到多高，方法论决定你不会掉到多低。

ADR-0008（Code Slim）处理的是**代码层**精简（删死代码 / 合并同构函数），本 ADR 处理的是**定位层**精简——更高维：先回答"哪些机制根本该存在"，再谈代码。

## Decision

**重新定位**：Forge = AI 编码的「**外部刹车 + 组织记忆**」，不再是「AI 编码工作流框架」。

### 唯一存在标准（Existence Test）

一个机制必须满足**外部性**才保留 / 强化——即落在以下四类之一（厂商无法做成通用默认值，或做成则对另一半用户错）：

1. **纪律的强制力** ——模型在压力下会找台阶，外部写死、不参与协商的规则才有约束力
2. **品味与范围偏好** ——团队特异性（YAGNI 砍 vs 往大了做），厂商选任一默认对另一半用户都是错
3. **风险判断** ——业务 / 技术 / 成本权衡，依赖项目上下文
4. **跨会话 / 跨人的组织记忆** ——归属团队，不属于模型权重，也不属于某厂商云端

不满足（可写成通用默认值、可被模型能力吸收）则**砍掉或退化为建议**。

### 保留并强化（满足外部性）

1. **纪律的强制力（刹车）**：Verification 铁律（§2.3，反借口表）、Three-Strike 熔断（§2.4）、P0/P1 ship 阻断（§3.3）、执行 / 评审分离 + 三层 review（§3.1）——模型在沮丧 / 进度压力下会找台阶下，且无法对自己保持敌意；外部裁判不会。
2. **品味与范围偏好**：`/forge decide` 的 product / architect / security 多视角判定、Policy Profiles（solo / team / enterprise 流程成本选择）、`evolved-rules.md` 里的项目特定倾向（YAGNI 偏好、API 稳定性约束）——团队特异性，厂商无法做成默认。
3. **风险判断**：security-check 的权限 / 依赖 / 敏感数据审视、ADR frontmatter 的 `reversibility` / `surprising` 字段、Pre-build 分支隔离门禁——业务 / 技术 / 成本权衡依赖项目上下文。
4. **组织记忆**：决策档案（ADR）、项目特定陷阱（`evolved-rules.md` 砍到精华）、`known-failures.md`——归属团队 / 项目，不属于模型权重。

### 砍掉或退化为建议（不满足外部性）

1. **hook 脚本帝国的 babysit 类**——`inject-*` / `stop-prevent-*` 系列（防止模型偷懒、乱注入、违规）随模型变强成纯开销；只保留做**外部刹车**的（`stop-phase-verify` 验证命令真跑过、ship-gate）。**图证**：参考框架明列「会被吸收」的 6 项（主动提问 / 自动计划 / 任务拆解 / 生成重构 / 自动测试 / 基础验证），其中 4 项（主动提问注入、计划落盘、任务拆解编排、生成重构）Forge 正在用 hook 强行做——正是砍除靶心。
2. **三级路由硬档位**（Light/Standard/Full 命令序列硬编排）——本质是替模型做调度决策；退化为「建议档位 + 几条不可跳铁律」。模型自己能判断 bug fix 不必走 decide→spec。
3. **阶段间状态落盘**——200K 上下文时代，`progress/` / `specs/` 历史多数不需要文件系统交接；只留**跨会话必须带走**的（decisions 精华、known-failures）。

### 执行约束

- 本 ADR **只定方向，不定具体删除清单**。每项实质减法需独立 spec / decision，逐项审计"是否真无外部性"+ 回归评估。
- 判定优先级排序：hook 脚本帝国 > 三级路由硬档位 > 阶段落盘 > evolved-rules 膨胀 > check 脚本链。
- **方向原则**：模型变强，Forge 应该越来越小，不是越来越大。任何新增机制必须通过 Existence Test。

### 分发形态归宿（plugin 是否保留）

**结论：plugin 形态保留，但定位从「工作流框架」重塑为「刹车 + 评审 + 记忆便携包」。**

砍 hook 不动 plugin 形态本身——plugin 的不可替代性来自三块硬依赖，均不在砍除范围：

1. **lifecycle hook 注入**：保留的 14 个刹车（frozen 系列 / `forge-prompt-guard` / `forge-read-injection-scanner` / `check-destructive` / `stop-phase-verify` / `postooluse-inject-warnings` / `prompt-injection-scan`）是 Claude Code 的 PreToolUse / PostToolUse / Stop hook，**只能通过 `plugin/hooks.json` 注册**。纯 AGENTS.md 文本拦不住 `git reset --hard` 等不可逆操作。
2. **MCP server 分发**：`forge-context`（review diff 截断）以自包含 bundle 随 plugin 零依赖分发，纯项目文件做不到。
3. **评审 subagent 标准化**：plugin 的 `agents/` 让多机 / 多项目拿到一致的 review 配置与版本。

**plugin 内容瘦身**（形态不变、内容收缩）：

| 维度 | 前（v3.9.0） | 后（减法后） |
|------|--------------|--------------|
| 定位 | Unified AI coding **workflow framework** | 外部刹车 + 评审 + 记忆便携包 |
| commands | 38 子命令编排 | 砍到几条不可跳铁律 |
| agents | 27 个 | 评审 subagent 为主 |
| hooks | ~31 runtime + 100 脚本 | 14 刹车 |
| `plugin.json` description | "Unified AI coding workflow framework ... 38 internal subcommands" | 须改为反映新定位 |

**终局二选一**（取决于项目定位为产品还是方法论沉淀）：

- **A. 产品**（marketplace 分发、版本管理、给多项目复用）→ plugin 做成**瘦刹车包**，核心价值「一次安装，任何项目获得一致刹车 + 评审」。当前定位。
- **B. 项目内嵌**（`AGENTS.md` + 几个 hook + `.claude/agents/` + `.tinkerman/`，不发行）→ plugin 是过度包装。

按本 ADR「模型变强、越变越小」方向，A 的正确演进 = **plugin 不消失，从框架收缩为刹车包**。可选进一步拆分：核心刹车包（必装）+ 流程包（可选）。

## Consequences

### Positive

- 方向与模型进化对齐，不再对冲；Forge 随模型变强而收缩，长期维护成本下降
- 精力聚焦在真正不可替代的「外部性」上，护城河变清晰
- 给后续所有减法（hook 审计、路由退化、落盘精简）提供统一判定依据，避免零敲碎打
- evolved-rules / known-failures 砍到精华后，上下文占用下降、规则互相冲突减少

### Negative

- 短期承担"哪些算外部性"的逐项判定成本（hook 审计工作量最大）
- 砍 hook 可能丢失部分防御纵深——每项删除需评估回归风险，不能一刀切
- 对外预期调整：Forge 不再营销为「全流程 AI 编码工作流框架」，README / docs / quick-start 需同步更新定位
- 既有 60+ specs / 30+ progress / 50+ decisions 的存量归档策略需单独决策（本 ADR 不涵盖）
