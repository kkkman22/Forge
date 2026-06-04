---
name: decide-auto-dispatch
status: approved
created: "2026-05-30"
updated: "2026-05-30"
tier: standard
---

# Decide 双模式自动分发 — 需求文档

## 引言

Forge `/forge decide` 支持两种执行模式：**inline**（主 agent 内直接执行 3 视角 review）和 **Agent Teams**（使用 `forge-decide-lead` + 5 视角 teammate 协作）。当前配置 `decide_dispatch_mode: inline` 固定使用 inline 模式。

Agent Teams 模式提供更高质量的决策分析（product、architect、security、cost、ops 五个独立视角 + critic 交叉审视），但 token 成本是 inline 的 ~5 倍。对于 Light/Standard tier 的简单需求，inline 足够；对于 Full tier 的复杂需求（新服务、认证变更、需求模糊），Agent Teams 更合适。

本特性新增 `decide_dispatch_mode: auto` 选项，根据路由 tier 自动选择最优模式。

**来源**：Claude Code CHANGELOG §38 Agent Teams 双模式并行 `[2.1.154]`。

**设计决策**：双模式并行（auto）——Full tier → Agent Teams，Standard/Light → inline。

## 术语

- **Inline Mode**：主 agent 内直接以 product/architect/security 三视角串行/并行分析，不 spawn team。
- **Agent Teams Mode**：spawn `forge-decide-lead` 作为协调者，再 spawn 5 个 teammate（product/arch/cost/ops/sec）+ critic 交叉审视。
- **Decide Dispatch Mode**：`.forge/config.md` 中的 `decide_dispatch_mode` 字段，取值：`inline`、`agents`、`auto`（新增）。
- **Tier**：Forge 的三级路由档位——Light（≤1 文件 ≤20 行）、Standard（需求明确）、Full（新服务/认证/模糊需求）。
- **Fallback Ladder**：Agent Teams 不可用时按 L0→L1→L2→L3 降级，L3 阻断 ship。

## 需求

### Requirement 1: `auto` 模式自动选择

**User Story:** 作为 Forge 用户，我希望 decide 阶段自动根据任务复杂度选择最优执行模式，以在简单需求节省 token、复杂需求获得高质量分析。

#### 验收标准

1. THE `.forge/config.md` 的 `decide_dispatch_mode` SHALL 支持新值 `auto`（除现有的 `inline` 和 `agents`）。
2. WHEN `decide_dispatch_mode` 为 `auto` 且 tier 为 `full`，THE decide skill SHALL 使用 Agent Teams 模式（`forge-decide-lead` + 5 视角 teammate）。
3. WHEN `decide_dispatch_mode` 为 `auto` 且 tier 为 `standard` 或 `light`，THE decide skill SHALL 使用 inline 模式。
4. WHEN `decide_dispatch_mode` 为 `inline`，THE decide skill SHALL 始终使用 inline 模式（不论 tier）。
5. WHEN `decide_dispatch_mode` 为 `agents`，THE decide skill SHALL 始终使用 Agent Teams 模式（不论 tier）。
6. THE `decide_dispatch_mode` 的默认值 SHALL 更改为 `auto`（当前默认 `inline`）。

### Requirement 2: Tier 信息传递

**User Story:** 作为 Forge 开发者，我希望 decide skill 能准确获取当前 tier 信息，以正确判断执行模式。

#### 验收标准

1. THE router skill（`skills/forge/lib/router/instructions.md`） SHALL 在分派到 decide 时传递 tier 信息。
2. THE tier 信息 SHALL 通过 `.forge/status.md` 的 `tier` 字段传递（当前已有）。
3. THE decide skill SHALL 从 `.forge/status.md` 读取 `tier` 字段。
4. WHEN `.forge/status.md` 不存在或无 `tier` 字段，THE decide skill SHALL 默认为 `standard` tier。

### Requirement 3: Agent Teams 降级处理

**User Story:** 作为 Forge 用户，我希望 Agent Teams 模式不可用时自动降级到 inline，而不是阻断工作流。

#### 验收标准

1. WHEN `auto` 模式选择 Agent Teams 但 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` 未设置或 Agent Teams 不可用，THE decide skill SHALL 自动降级到 inline 模式。
2. THE 降级事件 SHALL 输出警告：`⚠️ Agent Teams 不可用，降级到 inline 模式。设置 CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 可启用。`
3. THE 降级 SHALL 不阻断 decide 流程，最终决策结果仍然有效。
4. THE `.claude/rules/workflow-fallback-ladder.md` SHALL 更新 L1 触发条件，包含 `decide_dispatch_mode: auto` 的降级场景。

### Requirement 4: forge init 模板更新

**User Story:** 作为新 Forge 用户，我希望 `forge init` 生成的配置文件包含 `auto` 模式。

#### 验收标准

1. THE `forge init` 模板中的 `.forge/config.md` SHALL 将 `decide_dispatch_mode` 默认设为 `auto`。
2. THE `forge init` 模板 SHALL 确保 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 出现在推荐的 `.claude/settings.json` 环境变量配置中。

### Requirement 5: 向后兼容

**User Story:** 作为现有 Forge 用户，我希望升级后行为不变（如果保持 `inline` 配置）。

#### 验收标准

1. WHEN 现有项目的 `.forge/config.md` 中 `decide_dispatch_mode: inline`，THE 行为 SHALL 与升级前完全一致。
2. WHEN `.forge/config.md` 无 `decide_dispatch_mode` 字段，THE 默认值 SHALL 为 `auto`（新行为）。
3. ALL 现有测试 SHALL 在变更后继续通过。
