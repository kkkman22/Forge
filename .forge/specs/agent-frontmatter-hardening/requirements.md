---
status: completed
feature: agent-frontmatter-hardening
layout: requirements
created: 2026-05-30
tier: light
---
# Agent Frontmatter 安全隔离与能力增强 — 需求文档

## 引言

Forge 定义了 19 个 agent（`.claude/agents/`），用于不同阶段的 subagent 分派。Claude Code 2.1.x 系列引入了多项 agent frontmatter 增强：`disallowed-tools`（工具限制）、`memory`（持久记忆）、`initialPrompt`（自动启动提示）、`effort`（思考深度）。

当前仅 6/19 个 agent 使用了部分 frontmatter。本特性对全部 agent 进行 frontmatter 加固，强化安全隔离（§3.1）、提升 agent 启动效率、优化思考深度分配。

**涵盖优化项**：§1 `disallowed-tools`、§28 `memory`、§29 `initialPrompt`、§30 `Task(agent_type)`、§81 `effort: xhigh`。

## 术语

- **disallowed-tools**：Agent frontmatter 字段，列出该 agent 禁止使用的工具名称。强化 §3.1 "写代码的 Agent 不评审自己的代码" 隔离性。
- **memory**：Agent frontmatter 字段，值 `project` 表示 agent 可访问项目级持久记忆。当前 6 个 forge-decide-* agent 已配置。
- **initialPrompt**：Agent frontmatter 字段，agent 启动时自动执行的提示文本。当前 6 个 forge-decide-* agent 已配置。
- **effort**：Agent frontmatter 字段，控制模型思考深度。取值 `low`/`medium`/`high`/`xhigh`。`xhigh` 适合决策分析。
- **Task(agent_type)**：Agent frontmatter 或 spawn 时限制该 agent 只能 spawn 特定类型的 subagent。

## 需求

### Requirement 1: Review Agent 工具隔离（§1）

**User Story:** 作为 Forge 用户，我希望 review agent（spec-check、quality-check、security-check）不能执行写操作和 spawn 子 agent，以强化 §3.1 隔离性。

#### 验收标准

1. THE `spec-check.md`、`quality-check.md`、`security-check.md` agent 的 frontmatter SHALL 包含 `disallowed-tools: [Bash, Write, Edit, Agent]`。
2. WHEN review agent 尝试调用被禁止的工具，THE Claude Code runtime SHALL 拒绝该调用。
3. THE review agent SHALL 仍可使用 Read、Grep、Glob 等只读工具。

### Requirement 2: Agent 持久记忆扩展（§28）

**User Story:** 作为 Forge 用户，我希望关键 agent 能访问项目级持久记忆，以跨会话保留上下文。

#### 验收标准

1. THE 以下 agent SHALL 在 frontmatter 中添加 `memory: project`：
   - `forge-build`（build 阶段需记忆上次 build 状态）
   - `forge-plan`（plan 阶段需记忆历史 plan 模式）
   - `forge-review`（review 阶段需记忆历史 review 发现模式）
   - `security`（安全评审需记忆已知安全模式）
2. THE 已有 `memory: project` 的 6 个 forge-decide-* agent SHALL 不变。
3. THE 无需持久记忆的 agent（explore、debugger 等）SHALL 不添加此字段。

### Requirement 3: Agent 自动启动提示（§29）

**User Story:** 作为 Forge 用户，我希望关键 agent 启动时自动进入工作状态，无需额外指令。

#### 验收标准

1. THE 以下 agent SHALL 在 frontmatter 中添加 `initialPrompt`：
   - `forge-build`：`initialPrompt: "读取 .forge/plans/ 中的当前 plan，从 TaskList 获取下一个未完成 task，开始 RED→GREEN→REFACTOR 循环。"`
   - `forge-plan`：`initialPrompt: "读取 .forge/specs/ 中的当前 spec，分析代码库，生成原子化 TDD-ready task 列表。"`
   - `forge-review`：`initialPrompt: "读取当前 diff，启动三层 review（spec-check、quality-check、security-check）。"`
2. THE 已有 `initialPrompt` 的 6 个 forge-decide-* agent SHALL 不变。

### Requirement 4: Decide Agent 高深度思考（§81）

**User Story:** 作为 Forge 用户，我希望 decide 阶段的 agent 使用最高思考深度，以产出更高质量的决策分析。

#### 验收标准

1. THE 以下 agent SHALL 在 frontmatter 中添加 `effort: xhigh`：
   - `forge-decide-lead`（决策协调者）
   - `forge-decide-arch`（架构视角）
   - `forge-decide-product`（产品视角）
   - `forge-decide-sec`（安全视角）
2. THE `forge-decide-cost` 和 `forge-decide-ops` SHALL 使用 `effort: high`（成本和运维分析不需要最高深度）。
3. THE 非 decide 类 agent SHALL 不添加 effort 字段（使用默认值）。

### Requirement 5: Subagent 类型限制（§30）

**User Story:** 作为 Forge 维护者，我希望某些 agent 只能 spawn 特定类型的 subagent，以防止意外的 agent 链。

#### 验收标准

1. THE `forge-review` agent 在 spawn subagent 时 SHALL 限制为 review 类 agent（spec-check、quality-check、security-check）。
2. THE `forge-build` agent SHALL 不被允许 spawn decide 类 agent。
3. THE 此限制通过 agent frontmatter 或 SKILL instructions 中的指导实现（Claude Code 可能尚不支持 frontmatter 级 agent_type 限制，需验证）。

### Requirement 6: 不影响已有行为

**User Story:** 作为现有 Forge 用户，我希望 frontmatter 变更不改变 agent 的核心行为。

#### 验收标准

1. ALL 已有 `memory`、`initialPrompt` 的 agent SHALL 行为不变。
2. ALL 现有测试 SHALL 在变更后继续通过（`npm run check`）。
3. THE review agent 添加 `disallowed-tools` 后 SHALL 仍能正常完成三层 review（只需只读工具）。
