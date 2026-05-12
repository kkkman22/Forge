# 🔥 Forge — 统一 AI 编码工作流框架

[![CI](https://github.com/kkkman22/Forge/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/kkkman22/Forge/actions/workflows/ci.yml)
[![Security Audit](https://img.shields.io/badge/security--audit-npm%20audit%20%2B%20deps-blue)](./.github/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

> **18 个命令**覆盖完整开发生命周期，三维路由自动匹配任务复杂度，统一的 `.forge/` 状态系统实现跨命令状态感知，按需加载将每次会话的 token 开销控制在 **约 10K**。

---

## 为什么需要 Forge？

AI 辅助开发需要一套结构化的工作流：从需求分析到代码交付，每个阶段都有明确的输入、输出和质量门禁。Forge 提供了这样一套完整的框架。

Forge 的核心能力：

- **18 个命令**覆盖完整开发生命周期
- **三维路由**（复杂度 × 任务类型 × 项目阶段）自动匹配执行路径
- **统一状态**目录 `.forge/`，跨命令状态感知和会话恢复
- **按需加载**，单次会话约 10K tokens
- **流程门禁**，关键流程节点强制检查，冻结文件通过 PreToolUse Hook 保护
- **并行执行**，DAG 任务图支持多 Subagent 并行调度

---

## 🛡️ 安全与信任

Forge 从第一天起把安全视为工程纪律。防御分层落在代码、工具调用、输入解析、依赖管理四个面：

| 层级 | 机制 | 实现位置 |
|---|---|---|
| 1. 工具调用层 | PreToolUse Hook 冻结区硬阻断 | `hooks/hooks.json` + `scripts/check-frozen.sh` |
| 2. Shell 注入预防 | Git transaction 白名单构造器 | `src/git-transaction.ts` |
| 3. 输入威胁检测 | Prompt injection `scanInput` | `src/prompt-defense.ts` |
| 4. 依赖供应链 | 精确版本锁定 + npm audit CI | `package.json` + `.github/workflows/` |
| 5. 不变量验证 | 109 property-based test 文件 | `test/*.property.test.ts` |

**安全审计与 CVE 追溯**：

- [SECURITY.md](SECURITY.md) — 漏洞报告渠道、SLA、支持版本列表
- [CHANGELOG.md](CHANGELOG.md) — 所有安全修复以 `[SECURITY]` 前缀标注，每条关联至少一个 ADR
- `.forge/decisions/ADR-*.md` + `.forge/knowledge/adr-index.md` — 架构决策（含安全决策）可检索追溯

**CI AI 评审**：

- 每个 PR 自动触发 `claude ultrareview`，产出 AI 评审报告（`.forge/reviews/<PR>-ci.md`）
- P0 finding 阻断合并，P1-P3 记录但不阻断
- 需配置 GitHub Secret `ANTHROPIC_API_KEY`，未配置时自动跳过
- 详见 [CI UltraReview 操作手册](docs/ci-ultrareview-usage.md)

**最小权限默认**：`/forge` 使用 Claude Code `acceptEdits` 权限模式，命令执行可被 Hook 拦截，敏感区域（specs/plans/ADR）按"冻结"或"受保护"分级保护，详见 `.forge/config.md`。

**结构化冻结区反馈**：Forge 的冻结区保护已升级为结构化 JSON 反馈 middleware。当 AI 尝试修改锁定的 spec 或已批准的 plan 时，不再只是粗暴阻断——hook 返回精确诊断信息（哪个文件、为什么冻结、替代路径、解锁方式），帮助模型自我修正。PostToolUse hook 作为 defence-in-depth 兜底，即使 PreToolUse 被绕过也能检测并上报违规。所有命中事件记录到 `.forge/runs/` 供审计。

---

## 前置条件

- **Claude Code**：Forge 是 Claude Code 的 skill 包，需要 Claude Code 环境运行。**最低版本 2.1.121**（推荐 ≥2.1.138）。升级指南：https://docs.anthropic.com/en/docs/claude-code
- **Subagent**：`/forge build`、`/forge decide` 和 `/forge review` 使用 Claude Code 的 Agent tool 派发独立的 Subagent 并行执行任务。Forge 的 Agent 定义文件（`agents/*.md`）作为 Subagent 类型定义使用。

---

## 安装

### 方式一：Plugin 安装（推荐）

```bash
# 添加 Forge 官方 marketplace
claude plugin marketplace add https://github.com/kkkman22/Forge

# 安装 Forge plugin
claude plugin install forge
```

安装后 `/forge` 及 28 个子命令立即可用。支持 `claude plugin update forge` 自动更新和版本锁定。

> **适用场景**：所有新用户。只需 Claude Code，无需 git 或 Node.js。

### 方式二：直接克隆（Forge Loop 开发者）

```bash
git clone https://github.com/kkkman22/Forge.git ~/.claude/skills/forge
```

克隆安装包含完整功能：`/forge` 交互式命令 + Forge Loop 自主执行引擎。如需使用 Forge Loop，还需执行 `npm install && npx tsc`。

### 方式三：分发包安装（企业内网）

分发包只包含 `/forge` 交互式命令所需的文件（skills、agents、hooks、scripts、templates），不含 Forge Loop 及其依赖。适合只需要 `/forge` 命令的团队统一部署。

```bash
# 先克隆仓库到任意位置
git clone https://github.com/kkkman22/Forge.git /tmp/forge

# 构建分发包
bash /tmp/forge/scripts/build-dist.sh

# 安装到 Claude Code
bash /tmp/forge/scripts/install-dist.sh

# 清理临时文件（可选）
rm -rf /tmp/forge
```

安装脚本支持的选项：

- `--target <path>`：自定义安装路径（默认 `~/.claude/skills/forge`）
- `--dry-run`：预览将安装的文件，不实际复制
- `--backup`：安装前备份已有的同名目录

> **分发包同步校验**：每次 push 到 main 分支后，CI 会校验 dist 包是否与源码同步，不一致时 CI 失败。

### Plugin 迁移指南

从 clone/dist 安装迁移到 plugin 安装：

```bash
# 1. 移除旧安装
rm -rf ~/.claude/skills/forge

# 2. 添加 marketplace 并安装 plugin
claude plugin marketplace add https://github.com/kkkman22/Forge
claude plugin install forge

# 3. 验证安装
claude plugin list | grep forge

# 4. 在项目中测试
/forge status
```

**注意事项**：
- 项目级 `.forge/` 目录不受影响，无需迁移
- 已有的 hooks 配置和知识库保持不变
- Forge Loop 功能仍需 clone 安装方式

---

## 快速开始

### 30 秒体验：修复一个 Bug（轻量路径）

```bash
# 1. 初始化（仅首次）
~/.claude/skills/forge/scripts/init.sh

# 2. 描述任务，Forge 自动选择轻量路径
/forge 修复用户列表页面的排序 bug

# Forge 输出：
# 📋 路由分析
# 档位建议：轻量
# 判定理由：影响文件 1 个，改动约 10 行
# 命令序列：build → review

# 3. 确认后 Forge 自动执行：
#    build — TDD 修复 bug（写测试 → 改代码 → 验证）
#    review — 代码质量 + 安全快扫
# 4. 完成！
```

### 5 分钟体验：开发一个新功能（标准路径）

```bash
# 描述任务
/forge 为用户 API 添加分页功能

# Forge 输出：档位建议 → 标准路径
# 确认后按序执行：

/forge plan     # → 拆解为 3-5 个原子任务，每个 2-5 分钟
                #   生成完整的 TDD 步骤和代码

/forge build    # → 逐任务执行 RED → GREEN → REFACTOR
                #   每个任务独立 Subagent，原子提交

/forge review   # → 三层并行评审
                #   Layer 1: Spec 对齐 | Layer 2: 代码质量 | Layer 3: 安全

/forge test     # → 运行测试套件 + 7 项完成前清单

/forge ship     # → 门禁检查（Review ✅ Test ✅ Progress ✅）
                #   选择交付方式：merge / PR / 保留分支
```

### 初始化项目

```bash
# 在项目根目录运行
~/.claude/skills/forge/scripts/init.sh
```

初始化脚本会交互式收集项目名称、技术栈和安全级别，然后自动创建：

- `.forge/` 统一状态目录（含所有子目录和模板文件）
- `.claude/agents/` 下 7 个 Subagent 角色文件
- `.claude/commands/` 下 Forge Command 入口
- `.claude/settings.json` 中 Forge Hooks
- `CLAUDE.md` 项目宪法
- `.forge/config.md` 项目配置

### 常用命令示例

```bash
# 简单修复（轻量路径）
/forge 修复登录页面的拼写错误

# 新功能开发（标准路径）
/forge plan    # 拆解任务
/forge build   # TDD 实现
/forge review  # 三层评审
/forge test    # 验证
/forge ship    # 交付

# 复杂需求（全量路径）
/forge decide  # 四视角决策
/forge spec    # 锁定规格
/forge plan    # 拆解任务
/forge build   # 实现
/forge review  # 评审
/forge test    # 验证
/forge ship    # 交付
/forge learn   # 沉淀经验

# 从 PM 交付的 spec 导入（跳过 spec 生成，走标准路径）
/forge spec .forge/inbox/pm-notification-spec.md  # 导入并锁定
/forge plan    # 基于导入的 spec 拆解任务
/forge build   # 实现

# 辅助命令
/forge status  # 查看当前状态
/forge resume  # 恢复上次会话
/forge resume --from-pr https://github.com/org/repo/pull/42  # 从 PR 恢复上下文
/forge debug   # 结构化调试
/forge abort   # 安全中止当前任务
```

---

## 18 个命令速查表

| 命令 | 阶段 | 说明 | 适用路径 |
|------|------|------|---------|
| `/forge` | 入口 | 三维路由，分析任务复杂度并建议档位 | 所有 |
| `/forge decide` | 决策 | 四视角前置决策（产品/架构/安全/设计） | 全量 |
| `/forge spec` | 规格 | 将需求固化为可锁定的规格文档，支持从外部文件导入 | 全量 |
| `/forge plan` | 规划 | 将 Spec 拆解为含 TDD 步骤的原子任务 | 标准、全量 |
| `/forge build` | 执行 | 按计划以 TDD 方式逐任务实现 | 所有 |
| `/forge review` | 评审 | 三层独立评审（Spec 对齐/质量/安全），支持 `--canvas` 可视化模式 | 所有 |
| `/forge test` | 测试 | 三层验证（单元测试/浏览器 QA/清单），支持 `--cli`/`--ui` 模式 | 标准、全量 |
| `/forge ship` | 交付 | 门禁检查 + 四选项交付 | 标准、全量 |
| `/forge learn` | 知识 | 五维度经验提取和沉淀，支持 `--from-chats` 从历史对话提取 | 全量 |
| `/forge status` | 辅助 | 查看当前任务状态 | 所有 |
| `/forge resume` | 辅助 | 五问题恢复上次会话上下文，支持 `--from-pr` 跨会话恢复 | 所有 |
| `/forge debug` | 辅助 | 四阶段结构化根因分析 | 所有 |
| `/forge verify` | 验证 | 证据化三态验证（VERIFIED/NOT_VERIFIED/INCONCLUSIVE） | 所有 |
| `/forge control-cli` | 辅助 | CLI 控制面板交互 | 所有 |
| `/forge control-ui` | 辅助 | Web UI 控制面板交互 | 所有 |
| `/forge fix-conflicts` | 辅助 | 结构化冲突修复 | 所有 |
| `/forge recap` | 辅助 | 会话摘要与上下文回顾 | 所有 |
| `/forge abort` | 辅助 | 安全中止当前任务，归档状态并重置 | 所有 |

---

## 三维路由

Forge 路由器从三个维度分析任务：

| 维度 | 决定什么 | 可选值 |
|------|---------|--------|
| **复杂度（Tier）** | 运行**哪些**命令 | 轻量 / 标准 / 全量 |
| **任务类型（TaskType）** | 每个命令**怎么**执行 | frontend / backend / fullstack / data / infra / docs |
| **项目阶段（ProjectPhase）** | **强调**什么 | greenfield / iteration / refactor / bugfix |

复杂度决定命令序列。任务类型和项目阶段生成**行为提示（Hints）**，注入到命令序列中，让下游 skill 调整行为。同样是标准路径，一个"前端 + 重构"任务和一个"后端 + 新功能"任务会收到完全不同的行为提示。

### 轻量路径 — 小改动

**判定条件**：影响文件 ≤ 1 且改动 ≤ 20 行

**命令序列**：`build → review`

适用场景：修复拼写错误、调整配置、小 bug 修复。

### 标准路径 — 明确需求

**判定条件**：有明确需求或现成 Spec

**命令序列**：`plan → build → review → test → ship`

适用场景：新功能开发、已知范围的重构、有明确需求的改进。

### 全量路径 — 复杂任务

**判定条件**：涉及新服务/新数据库/认证体系变更，或需求描述模糊

**命令序列**：`decide → spec → plan → build → review → test → ship → learn`

适用场景：新服务搭建、架构变更、需求不明确的探索性任务。

### 用户覆盖

用户可以随时指定档位，覆盖 AI 建议：

```bash
/forge --tier=full 添加用户通知功能   # 强制全量路径
/forge --tier=light 修复样式问题      # 强制轻量路径
```

---

## 状态文件保护

`.forge/` 目录下的文件按修改权限分为三个区域，通过 PreToolUse Hook 技术强制执行：

| 区域 | 规则 | 文件 |
|------|------|------|
| 🔒 **冻结区** | 锁定/批准后 AI 不可修改，PreToolUse Hook 通过非零退出码阻断写入（覆盖 Write/Edit/Bash 工具路径） | `specs/`（locked）、`plans/`（approved）、`config.md` |
| 🛡️ **受保护区** | AI 可追加，不可删除或覆盖（建议性约束，后续将通过 diff 分析实现强制校验） | `progress/`、`reviews/`、`knowledge/instincts.md`、`knowledge/known-failures.md`、`knowledge/solutions/` |
| 🟢 **开放区** | AI 可自由修改 | `status.md`、`decisions/`、`findings/`、`debug/`、`inbox/`、`knowledge/sessions/` |

### Hook 行为说明

Forge 通过 Claude Code 的 [Hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) 机制实现状态保护和上下文注入：

- **执行上下文注入**：Write、Edit、Bash 工具触发前，PreToolUse Hook 自动打印 `.forge/plans/*.md` 前 30 行内容，为 AI 提供当前计划的执行上下文。
- **冻结文件保护**：Write/Edit 工具写入 `.forge/` 冻结区文件时，PreToolUse Hook 调用 `check-frozen.js`（TypeScript 编译产物，shell 脚本 `check-frozen.sh` 作为 fallback）检查文件的 frontmatter status，对 `locked`/`approved` 文件以非零退出码阻断写入。Bash 工具执行的命令中若涉及 `.forge/` 冻结区路径，同样触发保护。

---

## `.forge/` 目录结构

```
.forge/                          # 统一状态根目录
├── config.md                    # 项目配置（名称、技术栈、安全级别）
├── status.md                    # 当前状态快照（任务、档位、阶段）
├── .locks/                      # 并发写入锁文件（自动管理）
├── decisions/                   # /forge decide 输出
│   └── <date>-<topic>.md       #   决策文档
├── inbox/                       # 外部规格暂存区
│   └── *.md                    #   PM 交付的 spec 文档（供 /forge spec <file> 导入）
├── specs/                       # /forge spec 输出
│   └── <feature>/              #   功能规格
│       └── spec.md
├── plans/                       # /forge plan 输出
│   └── <topic>.md              #   任务计划（含 DAG 依赖关系）
├── findings/                    # 执行中发现
│   └── <topic>.md
├── progress/                    # 实时进度
│   └── <topic>.md
├── reviews/                     # /forge review 输出
│   └── <topic>.md              #   评审报告
├── handoffs/                    # 跨阶段决策传递
├── knowledge/                   # /forge learn 输出
│   ├── catalog.md              #   全景索引（Layer A，~50 行入口）
│   ├── solutions/              #   解决方案文档
│   │   └── <topic>.md
│   ├── sessions/               #   会话日志
│   │   └── <date>-<topic>.md
│   ├── patterns/               #   经验模式分类
│   ├── known-failures.md       #   已知失败模式
│   ├── instincts.md            #   经验模式库
│   ├── metrics.md              #   指标追踪
│   ├── tool-health.md          #   工具健康度
│   └── skill-feedback.md       #   SKILL 执行反馈（自进化数据源）
├── debug/                       # /forge debug 记录
│   └── <topic>.md
├── features/                    # 自动生成的功能索引（PostToolUse Hook 维护）
│   └── <topic>.md              #   派生视图，可随时重建
└── archive/                     # 已完成任务归档
```

所有状态文件统一使用 `.md` 格式 + YAML frontmatter，避免 AI 写纯 YAML 的缩进错误。

---

## 知识复利：越用越强

Forge 的知识系统不是静态文档库，而是一个自动化的复利引擎。每次 `/forge learn` 执行都会让后续工作流变得更聪明：

**自动沉淀**：每次开发完成后，`/forge learn` 从五个维度（问题模式、解决方案、踩坑记录、决策理由、可复用模式）提取知识，写入 `solutions/` 和 `instincts.md`。

**自动回流**：`/forge plan` 的 Research 步骤强制搜索知识库；`/forge build` 自动匹配 instinct 模式注入 Subagent 上下文；`/forge debug` 自动搜索历史踩坑记录。新工作流自动站在前人肩上。

**置信度生命周期**：每条知识携带 Beta 分布置信度（`successes / applications`）。被采用且有效 → 置信度上升；被采用但无效 → 置信度下降；长期未引用（60 天）→ 标记为陈旧候选。知识库自动保持健康。

**规则蒸馏**：高频模式（confidence ≥ 0.8）自动提升为 `evolved-rules.md` 中的错误预防规则，通过 SessionStart Hook 注入每次会话。被基础设施吸收后退役，腾出容量。

**完整性保障**：知识库 Lint 检查跨文件引用完整性（`instincts.md` 来源 → `solutions/` 文件是否存在）、孤儿文档检测、语义矛盾检测。`catalog.md` 提供 ~50 行的全景索引，让 Agent 以最低成本了解"知识库有什么"。

```
知识流动路径：

  /forge build → 踩坑 → /forge learn → solutions/ + instincts.md
       ↑                                        │
       └────── /forge plan Research ←───────────┘
```

---

## 并行执行

Forge 的 Plan 阶段支持为任务声明依赖关系（`dependsOn` 字段），形成有向无环图（DAG）。Build 阶段根据 DAG 调度并行 Subagent：

- **独立任务**自动并行派发，无需等待
- **并行度上限**可配置（默认 3），防止资源耗尽
- **失败传播**：任务失败时，所有传递依赖自动标记为 blocked
- **并发写入保护**：文件锁机制（30 秒超时）防止多 Subagent 同时写入状态文件

```
任务 DAG 示例：

  task-1 ──→ task-3 ──→ task-5
  task-2 ──→ task-4 ──↗

Wave 1: task-1, task-2（并行）
Wave 2: task-3, task-4（并行，task-1/2 完成后）
Wave 3: task-5（task-3/4 完成后）
```

---

## 团队协作：接手他人 PR

Forge 支持从 PR 一键恢复工作上下文，让团队成员无缝接手未完成的 PR：

```bash
# 从 PR URL 恢复（GitHub / GitLab / Bitbucket）
/forge resume --from-pr https://github.com/org/repo/pull/42

# 或用 PR 编号（自动推断 remote host）
/forge resume --from-pr 42
```

`--from-pr` 会自动：
1. 获取 PR 元数据（title、branch、description）
2. 从 PR 信息推断关联的 Forge spec slug
3. 加载 spec/plan/progress/reviews 等上下文
4. 更新 `.forge/status.md` 使后续 `/forge status` 可见

Slug 推断顺序：`[spec:slug]` title → `forge/slug` branch → `.forge/specs/slug/` in description → `.forge/decisions/` ADR → interactive prompt。

---

## Forge Loop — 自主执行引擎

> **注意**：Forge Loop 是独立于 `/forge` 命令的高级功能，需要完整仓库（克隆安装方式）。分发包安装方式不包含 Forge Loop。

Forge Loop 是基于 [Claude Agent SDK](https://docs.anthropic.com/en/docs/claude-agent-sdk) 构建的自主循环执行引擎。与 `/forge` 命令（在 Claude Code 对话中由 AI 解释执行）不同，Forge Loop 是一个独立的 Node.js CLI 程序，在系统终端中运行，通过 Agent SDK 驱动 Claude Code 自主迭代执行任务，无需人工逐步干预。

### 前置条件

- **完整仓库**：必须通过克隆方式安装（分发包不含 Forge Loop）
- **Claude Code**：Forge Loop 通过 Agent SDK 调用 Claude Code，需要已安装 Claude Code
- **依赖安装**：`npm install`（自动安装 `@anthropic-ai/claude-agent-sdk` 和 `commander`）
- **TypeScript 编译**：`npx tsc`（编译到 `dist/src/`）

### 核心架构

```
forge-loop <objective>
    │
    ├── SdkDriver          迭代循环驱动器
    │     ├── Orchestrator  纯函数状态机（idle → running → waiting → aborted/stopped）
    │     ├── EffectExecutor 副作用执行器（git commit/rollback/backoff）
    │     └── SdkAgentAdapter  Claude Agent SDK 适配层
    │
    ├── RunManager          运行生命周期管理（目录、分支、notes 持久化）
    ├── ContextAccumulator  跨迭代上下文累积（notes document）
    ├── FailureHandler      失败处理（指数退避 + 熔断器）
    └── WorktreeManager     Git Worktree 隔离执行
```

### 工作流程

1. **启动**：校验 Git 仓库状态 → 创建 `forge/<objective>` 分支 → 初始化运行目录
2. **迭代**：每轮调用 Agent SDK 执行任务 → Orchestrator 根据结果决定下一步
   - 成功 → `git commit` → 调度下一轮
   - 软失败 → `git rollback` → 重试
   - 硬失败 → `git rollback` → 指数退避等待后重试
3. **终止**：达到迭代/token 上限、满足停止条件、连续失败熔断、或用户中断（Ctrl+C）

### 安全机制

- **Git 事务**：每次成功迭代自动提交，失败自动回滚（回滚前 `git stash` 保底）
- **熔断器**：连续失败达到阈值（默认 3 次）自动中止，防止无限循环
- **指数退避**：硬失败后等待时间递增，避免频繁重试
- **Worktree 隔离**：`--worktree` 模式在独立工作树中执行，不影响主分支（并发上限可配置）
- **防休眠**：自动阻止系统休眠（macOS `caffeinate` / Linux `systemd-inhibit`）
- **优雅关闭**：SIGINT/SIGTERM 信号触发安全停止，清理所有资源

### 使用方式

```bash
# 基本用法
forge-loop "为用户 API 添加分页功能"

# 设置迭代上限
forge-loop "重构认证模块" --max-iterations 10

# 设置 token 上限
forge-loop "优化数据库查询" --max-tokens 500000

# 自然语言停止条件
forge-loop "修复所有 lint 错误" --stop-when "所有 lint 检查通过"

# 在独立 worktree 中执行
forge-loop "添加单元测试" --worktree

# 设置预算上限
forge-loop "实现搜索功能" --max-budget-usd 5.00

# 关闭防休眠
forge-loop "快速修复" --prevent-sleep off
```

### 构建与运行

```bash
# 1. 安装依赖
npm install

# 2. 编译 TypeScript
npx tsc

# 3. 运行（以下三种方式任选）
npx forge-loop "你的目标"                    # 通过 npx
node dist/src/forge-loop-cli.js "你的目标"   # 直接调用
npm link && forge-loop "你的目标"            # 全局链接后直接使用
```

> `/forge` 是在 Claude Code 对话中使用的交互式命令，`forge-loop` 是在系统终端中运行的自主循环程序。两者互补：前者适合人机协作，后者适合无人值守的批量任务。未来计划让 Forge Loop 的每轮迭代内部调用 Forge Skills，实现结构化流程 + 自主循环的深度融合（参见 [ROADMAP](ROADMAP.md)）。

---

## cmux 集成（可选）

> **Zero-Impact 不变量**：未安装 cmux 时，Forge 行为零变化。所有 cmux 集成代码在 `cmuxAvailable()` 返回 false 时立即短路退出。

[cmux](https://github.com/nickgnd/tmux-mcp) 是一个终端复用器，Forge 可选地将生命周期状态投射到 cmux 侧边栏和通知。

### 功能

| 功能 | 说明 |
|------|------|
| **Mirror_Daemon** | 守护进程，实时观察 `.forge/` 状态变化并投射到 cmux 侧边栏 |
| **sync-once** | Hook 触发的一次性状态同步（轻量级替代守护进程） |
| **Events_NDJSON** | 结构化事件流，服务多个消费者 |
| **Reviews Frontmatter** | 评审结果结构化存储（原子重写） |
| **Browser QA** | cmux browser 命令驱动的端到端 QA |
| **工作区布局** | 3 种 Forge 专属 cmux 布局模板 |

### 使用

```bash
# 安装 cmux 后，Forge 自动检测并启用集成
# 无需任何配置

# 安装 Forge 专属布局模板（可选）
bash scripts/cmux-mirror/install-template.sh .

# 安装 cmux 可选技能包（可选）
bash cmux-skills/install.sh --apply .claude/skills
```

### 卸载

```bash
# 移除布局模板
rm cmux.json

# 移除技能包
bash cmux-skills/install.sh --uninstall .claude/skills

# cmux 集成代码随 Forge 一起存在，但不产生任何运行时开销
```

### 新增文件

- `scripts/cmux-mirror/` — 4 个主脚本 + 14 个库模块
- `templates/cmux.json` — 工作区布局模板
- `cmux-skills/` — 3 个可选 SKILL.md + 安装器
- `test/cmux-mirror/` — 25 tests (including 10 property tests)

---

## Token 效率

| 方案 | Token 开销 | 说明 |
|------|-----------|------|
| Forge 全部 SKILL.md | **~42K** <!--approximate--> | 25 个 SKILL 文件总量（含 forge-verify、forge-control-cli、forge-control-ui、forge-fix-conflicts、forge-recap、forge-learn --from-chats） |
| Forge 单次会话（按需加载） | **~10K** <!--approximate--> | 只加载当前命令需要的 SKILL |

按需加载意味着轻量路径只加载 `build` + `review` 两个 SKILL，标准路径加载 5 个，全量路径加载 8 个。辅助命令（status/resume/debug/verify/control-cli/control-ui/fix-conflicts/recap）按需单独加载。

**进一步节省**：启用 [opusplan 模式](docs/opusplan-guide.md)（plan 用 opus，执行用 sonnet）可额外节省 20-40% token，与 Agent 级模型路由互补。

---

## .gitignore 建议

将以下内容添加到项目的 `.gitignore`：

```gitignore
# Forge 状态文件（建议纳入版本控制）
# .forge/config.md
# .forge/specs/
# .forge/plans/
# .forge/knowledge/

# Forge 临时文件（建议排除）
.forge/.locks/
.forge/debug/
.forge/archive/
.forge/findings/
.forge/progress/
.forge/reviews/
.forge/status.md
```

**建议**：`config.md`、`specs/`、`plans/`、`knowledge/` 纳入版本控制（团队共享知识资产）；`.locks/`、`debug/`、`archive/`、`progress/`、`reviews/` 排除（临时数据）。`.forge/features/` 可选纳入或排除：纳入则团队共享功能回顾索引；排除则作为本地派生状态。

### 归档与 CC Transcripts 清理

Forge 的归档脚本 (`scripts/archive-spec.sh`) 支持在归档完成后可选清理 Claude Code 的项目状态（transcripts、tasks、file history）：

```bash
# 交互模式（默认）：两次确认后执行
bash scripts/archive-spec.sh my-spec --purge-cc=ask

# 跳过 CC 清理
bash scripts/archive-spec.sh my-spec --purge-cc=skip

# 自动模式（CI 场景）
bash scripts/archive-spec.sh my-spec --purge-cc=auto
```

- CC purge 需要 Claude Code >= 2.1.126
- 每次 purge 都会生成 `purge-manifest.json` 记录操作详情
- CC purge 失败不影响文件归档（归档已完成，仅 warning）
- 安全保护：拒绝 `/`、`$HOME`、`/tmp` 等敏感路径

---

## Forge 库结构

```
forge/
├── skills/                      # 14 个 SKILL.md
├── rules/                       # 原子规则目录（TypeScript starter rules）
│   ├── forge-router/SKILL.md   #   入口路由（三维分析）
│   ├── forge-decide/SKILL.md   #   决策引擎（两轮 Subagent）
│   ├── forge-spec/SKILL.md     #   规格引擎（锁定机制）
│   ├── forge-plan/SKILL.md     #   规划引擎（DAG 任务图）
│   ├── forge-build/SKILL.md    #   执行引擎（TDD + Subagent）
│   ├── forge-review/SKILL.md   #   评审引擎（三层 Subagent）
│   ├── forge-test/SKILL.md     #   测试引擎（7 项清单）
│   ├── forge-ship/SKILL.md     #   交付引擎（三重门禁）
│   ├── forge-learn/SKILL.md    #   知识引擎（五维度 + 反馈分析）
│   ├── forge-status/SKILL.md   #   状态查询
│   ├── forge-resume/SKILL.md   #   会话恢复（五问题）
│   ├── forge-debug/SKILL.md    #   调试引擎（四阶段）
│   └── forge-abort/SKILL.md    #   任务中止（归档 + 重置）
├── agents/                      # 10 个 Subagent 角色
│   ├── product.md              #   产品视角（苏格拉底式提问）
│   ├── architect.md            #   架构视角（技术选型 + 风险）
│   ├── security.md             #   安全视角（OWASP + STRIDE）
│   ├── designer.md             #   设计视角（条件触发）
│   ├── critic.md               #   对抗性审查（最后发言）
│   ├── explore.md              #   代码库搜索专家（只读）
│   ├── debugger.md             #   根因分析与构建错误修复
│   ├── spec-check.md           #   Spec 对齐评审
│   ├── quality-check.md        #   代码质量评审
│   └── security-check.md       #   安全评审
├── hooks/hooks.json             # Claude Code Hooks
├── commands/forge.md            # Forge Command 入口
├── templates/                   # 文件模板（CLAUDE.md、config、状态文件）
├── scripts/
│   ├── init.sh                 #   项目初始化
│   ├── check-frozen.sh         #   冻结文件保护（PreToolUse Hook shell wrapper）
│   ├── auto-resume.sh          #   SessionStart Hook 自动恢复上下文
│   ├── persistent-loop.sh      #   Stop Hook 自动修复循环
│   ├── validate-knowledge.sh   #   知识库健康检查
│   ├── build-dist.sh           #   构建分发包
│   └── install-dist.sh         #   安装分发包
├── dist/                        # 分发包（CI 自动构建）
│   └── claude-code/bundles/forge/
├── src/                         # 核心逻辑（141 个 TypeScript 模块，含纯函数模块及有状态/运行时模块：CLI、SDK 适配器、副作用执行器、运行管理器等）<!--exact: 141 个 TypeScript 模块-->
│   ├── forge-loop-cli.ts       #   自主循环 CLI 入口（Commander 参数解析 + 信号处理）
│   ├── sdk-driver.ts           #   迭代循环驱动器（调度 Agent → 处理结果 → 执行副作用）
│   ├── orchestrator.ts         #   纯函数状态机（状态转换 + 副作用描述）
│   ├── effect-executor.ts      #   副作用执行器（git commit/rollback/backoff）
│   ├── sdk-agent-adapter.ts    #   Claude Agent SDK 适配层
│   ├── run-manager.ts          #   运行生命周期管理（目录、分支、worktree）
│   ├── context-accumulator.ts  #   跨迭代上下文累积（notes document）
│   ├── failure-handler.ts      #   失败处理（指数退避 + 熔断器）
│   ├── worktree-manager.ts     #   Git Worktree 隔离执行
│   ├── sleep-preventer.ts      #   防休眠命令构建（macOS/Linux）
│   ├── git-transaction.ts      #   Git 命令构建（注入安全）
│   ├── agent-output.ts         #   Agent 输出 schema 构建
│   ├── agent-adapter.ts        #   Agent 接口抽象
│   ├── loop-types.ts           #   类型定义（LoopConfig、RunLimits、OrchestratorState 等）
│   ├── router.ts               #   三维路由分类 + 行为提示
│   ├── decide.ts               #   Designer 条件触发 + 决策路径
│   ├── spec.ts                 #   Spec 生命周期 + 棕地验证
│   ├── plan.ts                 #   原子任务验证 + 占位符扫描
│   ├── build.ts                #   构建门禁 + 失败升级
│   ├── review.ts               #   置信度过滤 + 跨评审者一致性
│   ├── test-engine.ts          #   7 项完成前清单
│   ├── ship.ts                 #   三重交付门禁
│   ├── learn.ts                #   知识文档 + 维护 + 反馈分析
│   ├── debug.ts                #   假设验证 + 四阶段状态机
│   ├── check-frozen.ts         #   冻结文件保护（YAML frontmatter status 检查）
│   ├── resume.ts               #   五问题恢复
│   ├── state.ts                #   状态验证 + 保护区 + 文件锁
│   ├── task-graph.ts           #   DAG 调度 + 并行执行引擎
│   ├── handoff.ts              #   跨阶段决策传递
│   └── loop-index.ts           #   自主循环模块统一入口
├── package.json                 # Node.js ≥ 20，6 个 devDependencies
├── CONTRIBUTING.md              # 贡献指南
├── CHANGELOG.md                 # 版本变更记录
└── LICENSE                      # MIT
```

---

## Domain Packs

Forge 支持 Domain Pack 机制，为特定行业提供开箱即用的领域知识。

### PMS Domain Pack v1.0

酒店前台管理系统（Property Management System）领域包，包含：

- **8 个限界上下文**：Reservations、Front Desk、Housekeeping、Folio-Billing、Night Audit、Rate-Inventory、Channel-Integration、Reporting
- **分 Context 术语表**：每个上下文 12+ 术语，含中文别名
- **4 个状态机**：Reservation、Folio、RoomStatus、HousekeepingTask（YAML 定义 + 自动 property test 派生）
- **20 个 Gherkin 场景**：覆盖入住/退房/夜审/预订/账单核心流程
- **禁用词清单**：防止实现泄漏到规格文档
- **BusinessDayClock**：酒店营业日时钟（支持 DST）

```bash
# 启用 PMS Pack
/forge init --pack pms

# 场景可直接复制到 spec 的 ## Scenarios 部分
```

详见 `packs/pms/README.md`。

---

## 开发

```bash
# 安装依赖
npm install

# 完整检查（CI 使用此命令）
npm run check        # typecheck + lint + test

# 单独运行
npm run typecheck    # 类型检查
npm run lint         # Lint 检查
npm run lint:fix     # 自动修复
npm run test         # 运行测试
npm run test:coverage # 测试 + 覆盖率报告

# 构建分发包
bash scripts/build-dist.sh
```

**技术栈**：TypeScript 5.9（strict）、Vitest 3.2、fast-check 4.7（属性测试）、Biome 2.4（lint + format）。运行时依赖：`@anthropic-ai/claude-agent-sdk`、`commander`。

**测试策略**：5054 个测试（280 个测试文件，其中 133 个为 fast-check 属性测试文件）验证不变量（invariant），而非特定输入输出。覆盖率 ~89% statements。<!--exact: 测试数、文件数、属性测试数; approximate: 覆盖率-->

---

## 许可证

MIT
