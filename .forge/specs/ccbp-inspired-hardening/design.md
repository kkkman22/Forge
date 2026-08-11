---
feature: ccbp-inspired-hardening
layout: design
created: 2026-05-12
---

# Design Document: CCBP-Inspired Hardening

## Overview

本设计把 11 条借鉴模式（10 条来自 CCBP + 1 条来自 Claude Code 源码深读后新补）落地为 Forge 仓库的**可见形态变更**——每条模式都对应一组具体文件的增、删、改。设计的核心视角不是"实施策略列表"，而是"**目标态蓝图 + 迁移契约**"：

1. 先描绘改造完成后的仓库形态（Target State Blueprint）
2. 为每条变更定义**迁移契约**（Migration Contract）：不变量、验证点、回滚路径
3. 把变更按"**harness 层 vs prompt 层**"正交分组，决定推进节奏

harness 层变更（agent 化、`tools` 白名单、`.claude/rules/`、hooks dispatcher、`Stop` hook 结构化输出）一次落地影响面大但独立性强，适合批量推进；prompt 层变更（Execution Contract 段落、Learnings 迁入 `agent-memory/`、文档拆分）可逐文件渐进。

## Source of Truth

本设计的每个机制都有明确的源码锚点，引用自 `ericshang98/claude-code-source` 仓库（Claude Code 的 TypeScript 源码）：

| 设计机制 | 源码锚点 |
|---|---|
| Agent frontmatter schema | `src/tools/AgentTool/loadAgentsDir.ts:75–98`（Zod schema）、`:370–500`（markdown 解析） |
| `tools` / `disallowedTools` 字段解析 | `src/tools/AgentTool/agentToolUtils.ts:resolveAgentTools` |
| Agent memory `memory: project` | `src/tools/AgentTool/agentMemory.ts`（目录路径）、`src/memdir/memdir.ts:33,100–200`（MEMORY.md 截断） |
| 四类记忆 + 不该存清单 | `src/memdir/memoryTypes.ts:MEMORY_TYPES` + `WHAT_NOT_TO_SAVE_SECTION` |
| Skill frontmatter 字段 | `src/skills/loadSkillsDir.ts:parseSkillFrontmatterFields`（字段名用 `allowed-tools` 连字符） |
| Skill `paths:` 条件激活 | `src/skills/loadSkillsDir.ts:156–178,986–1035` |
| Skill `context: fork` 执行隔离 | `src/tools/SkillTool/SkillTool.ts:executeForkedSkill` |
| `.claude/rules/` 懒加载规则 | `src/utils/claudemd.ts:250–280,1354–1402`（`paths:` 匹配用 `ignore()` 库） |
| `@path` include 指令 | `src/utils/claudemd.ts:18–26,457–501` |
| CLAUDE.md 字符上限 | `src/utils/claudemd.ts:93`（`MAX_MEMORY_CHARACTER_COUNT = 40000`） |
| 27 个 hook 事件 | `src/entrypoints/sdk/coreTypes.ts:HOOK_EVENTS` |
| 4 种 hook 类型 | `src/schemas/hooks.ts`（`command` / `prompt` / `agent` / `http`） |
| `if:` 条件预过滤 | `src/schemas/hooks.ts:IfConditionSchema` |
| `Stop` hook 结构化输出兜底 | `src/utils/hooks/hookHelpers.ts:registerStructuredOutputEnforcement` + `src/tools/SyntheticOutputTool/SyntheticOutputTool.ts` |
| `criticalSystemReminder` 每轮再注入 | `src/tools/AgentTool/loadAgentsDir.ts:BuiltInAgentDefinition`（`criticalSystemReminder_EXPERIMENTAL` 字段） |
| `disable-model-invocation` / `user-invocable` | `src/skills/loadSkillsDir.ts:parseSkillFrontmatterFields` |
| `requiredMcpServers` agent 可见性 | `src/tools/AgentTool/loadAgentsDir.ts:hasRequiredMcpServers` |
| Settings 合并顺序 | `src/utils/settings/constants.ts:SETTING_SOURCES` |
| 工具集默认黑白名单 | `src/constants/tools.ts:ALL_AGENT_DISALLOWED_TOOLS` / `CUSTOM_AGENT_DISALLOWED_TOOLS` / `ASYNC_AGENT_ALLOWED_TOOLS` |

所有改动在 contract test（`test/contract.test.ts` + `test/contract.skills.test.ts`）保护下进行。

---

## Target State Blueprint

改造完成后，`.claude/` 目录结构如下（**加粗** = 本 spec 新增或显著改动）：

```
.claude/
├── settings.json                         # 团队共享配置
├── settings.local.json.example           # 新增 — 个人覆盖示例
├── agents/
│   ├── forge-plan.md                     # 新增 — 从 skill 迁移而来
│   ├── forge-build.md                    # 新增 — 从 skill 迁移而来
│   ├── forge-review.md                   # 新增 — 从 skill 迁移而来
│   └── forge-ship.md                     # 新增 — 从 skill 迁移而来
├── commands/
│   └── forge.md                          # 改动 — 子命令映射表新增 agent 调用分支
├── skills/
│   ├── forge-router/                     # 保留
│   ├── forge-plan/                       # 废弃 — 改动为 stub，指向 agent
│   │   └── SKILL.md                      # 10 行 stub
│   ├── forge-build/
│   │   └── SKILL.md                      # 10 行 stub
│   ├── forge-review/
│   │   └── SKILL.md                      # 10 行 stub
│   ├── forge-ship/
│   │   └── SKILL.md                      # 10 行 stub
│   ├── forge-verify/                     # 改动 — 加 paths:；加 Stop hook 示范
│   ├── forge-fix-conflicts/              # 改动 — 加 paths:
│   ├── forge-test/                       # 改动 — 加 paths:
│   ├── forge-grill/                      # 改动 — 加 context: fork
│   ├── forge-storm/                      # 改动 — 加 context: fork
│   ├── forge-ship-stub, pack, abort/     # 改动 — disable-model-invocation: true
│   └── ...其他 skill（含 progressive disclosure 拆分）/
│       ├── SKILL.md                      # 入口 ≤150 行
│       ├── reference.md                  # 新增 — 规范表
│       └── examples.md                   # 新增 — 范例（可选）
├── rules/                                # 新增目录
│   └── spec-editing.md                   # 新增 — 懒加载规则示例
├── hooks/                                # 新增目录
│   ├── HOOKS-README.md                   # 新增 — dispatcher 使用说明 + 27 事件参考
│   ├── scripts/
│   │   └── dispatcher.sh                 # 新增 — 统一入口脚本骨架
│   └── config/                           # 见 §5 — 仅在必要时创建，优先复用 settings 分层
└── agent-memory/                         # 新增目录（被 memory: project + Req 7 Learnings 共用）
    ├── forge-plan/
    │   ├── MEMORY.md                     # 索引文件（≤200 行 / ≤25K 字节）
    │   ├── feedback_xxx.md               # 具体 learning（4 类之一：user/feedback/project/reference）
    │   ├── project_yyy.md
    │   └── archive/                      # 归档子目录（超过 3 个月的 learning 迁这里）
    ├── forge-build/
    ├── forge-review/
    └── forge-ship/

CLAUDE.md                                 # 改动 — 瘦身 ≤200 行 + 每文件提交规则 + @path 引用附属规则
.gitignore                                # 改动 — 新增 .claude/settings.local.json 条目
.forge/docs/living/
└── ccbp-patterns-p2.md                   # 新增 — P2 参考文档
```

改造前后的**文件数量差**：
- 新增文件：~16 个（4 agents、1 rules 示例、1 dispatcher、1 hooks readme、4 reference.md、1 example.md、1 settings.local.example、1 P2 文档、1–2 个 Stop hook 演示配套文件）
- 改动文件：`CLAUDE.md`、`.gitignore`、`.claude/commands/forge.md`、4 个 skill 降级为 stub、若干 skill 被拆分/加 `paths:`/加 `context: fork`、3 个破坏性 skill 加 `disable-model-invocation`
- 删除文件：**无**（所有迁移都是"搬家 + 留引用"，不是删除）

---

## Eleven Patterns → Migration Contracts

下表把 11 条模式映射为**可审计的迁移契约**。每行回答三个问题：这条模式在 Forge 里长什么样？它的不变量是什么？怎么回滚？

| # | 模式 | Forge 落地形态 | 不变量（必须保持） | 回滚路径 |
|---|---|---|---|---|
| 1 | Command → Agent → Skill 三层编排 | `.claude/agents/forge-{plan,build,review,ship}.md` + 4 个 skill 降为 stub + `forge.md` 添加 agent 分支 | Contract test 通过；`/forge build` 的输入输出格式不变；Restatement / P5 证据链语义不变；`tools` 白名单字段名对齐源码；需要 subagent 的 agent 必须显式列 `Agent` | 删除 4 个 agent 文件；skill stub 恢复为原 SKILL.md；`forge.md` 回到 `Skill(forge-build)` 调用 |
| 2 | Execution Contract + 运行时 fail-closed | 4 个 agent 开头新增 `## Execution Contract (non-negotiable)` 段落；`forge-verify` 示范 `Stop` hook + `SyntheticOutputTool` | 契约只列 agent 已有行为的强化表达，**不**引入新行为；`tools` 白名单与契约列出的"禁止 X"一一对应；`Stop` hook 阻塞语义来自源码 `registerStructuredOutputEnforcement` | 删除 Execution Contract 段落；恢复 `tools` 为宽松集合；取消 `Stop` hook 注册 |
| 3 | Progressive Disclosure + 条件激活 + fork 隔离 | 行数 >150 的 SKILL.md 拆出 `reference.md` / `examples.md`；部分 skill 加 `paths:` 条件激活；部分 skill 加 `context: fork` | 拆分后总字符数不显著增加；SKILL.md 保留所有行为指令的引用；拆分在 `skill-document-optimization` spec 之**后**执行；`paths:` 格式对齐源码 `parseSkillPaths` | 把 `reference.md` 内容回搬到 SKILL.md；删除 `paths:` / `context: fork` frontmatter |
| 4 | 懒加载 rules | `.claude/rules/spec-editing.md`（带 `paths: .forge/specs/**`）+ 设计文档列出后续迁移候选；`paths:` 匹配使用 gitignore 语义 | 初版只交付 1 个示例规则文件 + 设计文档；**不**从 CLAUDE.md 迁出任何现有规则；`paths:` 格式对齐源码 `parseFrontmatterPaths` | 删除 `.claude/rules/` 目录 |
| 5 | Hooks Dispatcher | `.claude/hooks/scripts/dispatcher.sh` 骨架 + 只迁移 2 类事件（SessionStart、UserPromptSubmit）；HOOKS-README 列出 27 个事件清单 + 4 种 hook 类型参考；支持 `if:` 条件预过滤 | `settings.json` 其余 4 类事件保持原样；dispatcher 按事件语义返回正确 exit code（`0` 通过 / `2` 阻塞 / 其他显示 stderr）；不是盲目 `exit 0` | 删除 `.claude/hooks/` 目录；`settings.json` 恢复 2 类事件的原内联命令 |
| 6 | CLAUDE.md 瘦身 + 每文件提交 + `@path` 引用 | CLAUDE.md ≤200 行；`## Git Commit Rules` 新增每文件提交条款；`forge-ship` 契约补引用；文件顶部用 `@path/to/rule.md` 引用附属规则 | **零信息损失**——所有被移出的内容必须能在 `.claude/rules/` 或 `.forge/docs/living/` 或 skill 的 `reference.md` 中找到；`@path` 必须写在正文 leaf text node（不能在代码块里） | 从备份恢复原 CLAUDE.md |
| 7 | Agent Learnings（迁入 `.claude/agent-memory/`） | 每个 agent 的 learning 以独立 `.md` 文件（按 4 类分类）放在 `.claude/agent-memory/<name>/`；`MEMORY.md` 只当索引；agent workflow 加"执行完追加条目"指令 + 不该存清单 | `MEMORY.md` 不存内容；每条 learning 带 `type:` frontmatter；相对日期转绝对；team 禁敏感信息；既记失败也记成功 | 删除 `.claude/agent-memory/<name>/` 下本 spec 创建的 learning 文件；移除 workflow 新增指令 |
| 8 | settings.local.json 分离 | `.gitignore` 加 `.claude/settings.local.json`；新增 `.claude/settings.local.json.example`；CLAUDE.md 加说明注明合并优先级 `local < flag < policy` | 不迁移任何现有 `settings.json` 条目；只提供覆盖机制 | 从 `.gitignore` 移除对应行；删除示例文件 |
| 9 | 验证通道（P2） | `.forge/docs/living/ccbp-patterns-p2.md` 记录（按 change-type 分 10 小节，对齐 verificationAgent 源码） | 仅文档，不添加代码；不安装任何 MCP | 删除文档 |
| 10 | Session 五选一（P2） | 同上——并入 `ccbp-patterns-p2.md`；引用源码 `coordinator/coordinatorMode.ts:260–290` 的 continue vs spawn 表 | 同上 | 同上 |
| 11 | 源码新增能力补遗（`disable-model-invocation` / `user-invocable` / `requiredMcpServers` / `effort` / `criticalSystemReminder`） | 破坏性 skill 加 `disable-model-invocation: true`；plan/review agent 加 `effort: high`；verify/ship agent 加 `criticalSystemReminder` 字段或退化方案 | 字段名严格对齐源码（连字符 / 驼峰 / 枚举值）；`criticalSystemReminder` 长度 ≤200 字符；有 `requiredMcpServers` 的 agent 在 MCP 未连接时必须隐藏 | 移除各字段恢复默认行为 |

**迁移契约解读**：每条的"不变量"列出**最重要的守护条件**，是 contract test 或人工 review 必须验证的；"回滚路径"描述当某条迁移发现问题时如何回退——这些都是真的"单变更回滚"而非需要整体撤回。

---

## Harness Layer vs Prompt Layer

10 条模式按改造层正交分组，决定推进节奏。

### Harness 层（一次性结构变更，改动面大）

| 变更 | 文件数 | 影响半径 | 何时推进 |
|---|---|---|---|
| skill → agent 迁移（#1） | +4 新建、-0 删除、4 个 stub 改写、1 个 forge.md 改写 | 调用路径改变 | **第一批**——所有其他变更依赖于 agent 的存在 |
| settings.local.json 分离（#8） | 2 文件改动 | 无行为变更 | 第一批——几乎零风险 |
| 懒加载 rules 基础设施（#4） | +1 目录、+1 文件 | 零现状影响（目录当前不存在） | **第二批**——独立于其他变更 |
| Hooks Dispatcher 基础设施（#5） | +1 目录、+3 文件、2 类事件改写 | 只影响 SessionStart / UserPromptSubmit 事件 | 第二批 |

### Prompt 层（逐 agent / skill 内容变更，改动面小）

| 变更 | 影响文件 | 何时推进 |
|---|---|---|
| Execution Contract（#2） | 4 个 agent 各加 1 段 | 在 #1 完成后，逐 agent 追加 |
| Progressive Disclosure（#3） | 受影响的 skill / agent 内部拆分 | 建议在 `skill-document-optimization` spec 完成**之后**启动 |
| Agent Learnings（#6） | 4 个 agent 各加 1 段 | 跟 #2 同一批完成，两个段落合并一次改动 |
| CLAUDE.md 瘦身（#7） | CLAUDE.md 单文件 | 可任意时机；建议在 #4 有至少 1 个懒加载规则示例之后 |
| P2 参考文档（#9、#10） | `.forge/docs/living/ccbp-patterns-p2.md` 单文件 | 最后；或者任何独立时机 |

---

## Pattern-by-Pattern Design

### 1. Command → Agent → Skill 三层编排

**为什么是 plan/build/review/ship 四个升级**：
- 这四个是"重活"：多步探索、大量文件读写、长输出——独立 context 收益最大。
- router/status/resume/abort/spec/learn 是"轻活"或"需主会话上下文"：agent 化会引入不必要的 context 切换开销。
- `forge-decide` 单列：既需要分析也需要主会话历史，保持 skill 形态；在 Req 3 AC7 的 `context: fork` 机制成熟后可评估切换。

**Agent 文件骨架**（以 `forge-build.md` 为例；字段名严格对齐 Claude Code 源码 `loadAgentsDir.ts` 的 Zod schema）：

```markdown
---
name: forge-build
description: Use this agent PROACTIVELY when the user invokes /forge build. TDD-driven implementation with Subagent parallelism and P5 evidence chain.
tools:                     # 注意是 tools（不是 allowedTools），源码字段名
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - Skill
  - Agent                  # 必须显式列出，否则无法 spawn subagent（CUSTOM_AGENT_DISALLOWED_TOOLS 默认禁用 Agent）
  - TodoWrite
  - ToolSearch
  - EnterWorktree
  - ExitWorktree
# disallowedTools: []      # 可选，反向黑名单
model: sonnet              # sonnet / opus / haiku / inherit
maxTurns: 50
permissionMode: acceptEdits
memory: project
color: blue
---

# Forge Build Agent

## Execution Contract (non-negotiable)
... (见 #2)

## Workflow
... (从原 SKILL.md 迁移而来)

<!-- 不再把 Learnings 作为段落放在这里 —— 经验迁入 .claude/agent-memory/forge-build/（见 #6） -->
```

**各 agent 的 `tools` 白名单**（对齐 Req 2 AC2；不含 `WebFetch`/`WebSearch`）：

| Agent | 白名单 | `permissionMode` | 说明 |
|---|---|---|---|
| forge-plan | `Read, Glob, Grep, Bash, Skill, AskUserQuestion` | `plan` | plan 模式下写操作被运行时拒绝 |
| forge-build | `Read, Write, Edit, Glob, Grep, Bash, Skill, Agent, TodoWrite, ToolSearch, EnterWorktree, ExitWorktree` | `acceptEdits` | 必须显式 `Agent` |
| forge-review | `Read, Glob, Grep, Bash, Skill, Agent` | `default` | review 不写文件；`Agent` 用于并行子 review |
| forge-ship | `Read, Edit, Bash, Skill` | `acceptEdits` | 只能对有限范围做 edit（例如 CHANGELOG），不用 subagent |

**Skill stub**（原 `.claude/skills/forge-build/SKILL.md` 降为，字段名对齐 skill 源码——注意 skill 用连字符 `allowed-tools` / `disable-model-invocation` / `user-invocable`）：

```markdown
---
name: forge-build
description: (deprecated — use Agent tool to call forge-build agent instead)
disable-model-invocation: true
user-invocable: false
---

# forge-build (moved to agent)

This skill has been migrated to an agent. Invoke via:

    Agent(subagent_type: "forge-build", description: "...", prompt: "...")

See `.claude/agents/forge-build.md`.
```

**Commands/forge.md 改动**：子命令映射表的 `build` 行从"直接调用 Skill(forge-build)"改为"通过 Agent 工具调用 forge-build agent"。router 路由到 build 的分支同样更新。

**风险与守护**：
- 风险 A：已有调用方（hook、其他 skill）通过 `Skill(forge-build)` 调用。缓解：skill stub 保留，且 stub 在 description 里指向 agent，模型即使拿到 stub 也会看到迁移提示。
- 风险 B：`model: inherit` 的 agent 可能继承到 haiku 模式下的弱模型。缓解：`forge-build` / `forge-review` 显式设 `model: sonnet`（或 opus，按 Forge 现有配置），其他保留 inherit。
- 风险 C：`forge-build` 忘了把 `Agent` 放进 `tools` 白名单。缓解：contract test（Req 10 AC1）加断言——`forge-build.md` 的 `tools` 字段必须包含 `Agent`。

### 2. Execution Contract（三层强化）

**核心思想**：从弱到强叠三层，让契约既是 prompt 指令，又是 harness 硬切，还是运行时 fail-closed。

**Layer A — Prompt 层**（每个 agent 都有）：

```markdown
## Execution Contract (non-negotiable)

You MUST <核心职责的一句话>. You are forbidden from:

- <禁止行为 1，对应 tools 白名单中被排除的工具>
- <禁止行为 2>
- <禁止行为 3>

Your tool allowlist intentionally excludes <X>. If you find yourself needing
a tool that is not in the allowlist, that is a signal you are on the wrong
path — stop and report to the caller.

**Fail-closed guardrail**: If <关键依赖> does not return the expected output
(<具体字段>), DO NOT attempt to work around it. Stop and report the failure.
```

**Layer B — Per-turn 再注入**（契约强度高的 agent，如 `forge-verify` / `forge-ship`）：

源码 `src/tools/AgentTool/loadAgentsDir.ts` 的 `BuiltInAgentDefinition` 有 `criticalSystemReminder_EXPERIMENTAL` 字段——每个用户 turn 都把这段短文本（≤200 字符）再注入一次 prompt。Claude Code 自己的 `verificationAgent.ts` 用它塞了：

> "CRITICAL: This is a VERIFICATION-ONLY task. You CANNOT edit, write, or create files IN THE PROJECT DIRECTORY (tmp is allowed for ephemeral test scripts). You MUST end with VERDICT: PASS, VERDICT: FAIL, or VERDICT: PARTIAL."

**两个落地路径**：

- **方案 A（推荐）**：Forge 扩展自己的 agent loader，支持 `criticalSystemReminder` 字段
- **方案 B（退化）**：不改 loader，把同样的文本在 prompt 内写两次（`# Agent Name` 下紧接 + `## Workflow` 开头再来一次），没有 per-turn 再注入的严格度但同 prompt 内二次出现能显著降低遗忘

**Layer C — 运行时 fail-closed**（对输出格式有硬约束的 agent / skill，如 `forge-verify`）：

源码 `src/utils/hooks/hookHelpers.ts:registerStructuredOutputEnforcement` 的机制：

```typescript
// 伪代码，源码原型
registerStructuredOutputEnforcement(setAppState, sessionId);
// 在 Stop 事件上注册一个 function hook：
// - 检查会话是否成功调用过 SyntheticOutputTool
// - 没调用就阻塞会话结束并返回 "You MUST call the StructuredOutput tool to complete this request"
// - 这样模型只能在结构化输出后才能退出
```

**`forge-verify` 的运行时契约示范**：

```yaml
# .claude/agents/forge-verify.md frontmatter（如果 forge-verify 升级为 agent）
# 或 .claude/skills/forge-verify/SKILL.md frontmatter（保持 skill）

# 启动时注册 Stop hook
hooks:
  Stop:
    - type: command
      command: bash ${CLAUDE_PROJECT_DIR}/.claude/hooks/scripts/check-structured-output.sh
      # exit 2 阻塞会话结束；exit 0 通过

# 或者通过 Forge 的 loader 在 agent 启动时代码注册 registerStructuredOutputEnforcement
```

搭配 `SyntheticOutputTool` 的 JSON schema：

```json
{
  "type": "object",
  "required": ["verdict"],
  "properties": {
    "verdict": { "enum": ["VERIFIED", "NOT_VERIFIED", "INCONCLUSIVE"] },
    "evidence": { "type": "array", "items": { "type": "object" } },
    "reason": { "type": "string" }
  },
  "additionalProperties": false
}
```

这把"verify 必须以三态 verdict 结束"从 prompt 约束升级为**运行时硬闭环**——不按格式调用就出不去会话。

**四个 agent 的契约要点**：

| Agent | Layer A 禁令 | Layer B 是否上 | Layer C 是否上 |
|---|---|---|---|
| forge-plan | 未批准前进入 build；跳过 AskUserQuestion | 否 | 否 |
| forge-build | 未写测试就写实现；跳过前置门禁；WebFetch（不在白名单） | 否 | 否 |
| forge-review | 降级 P0/P1 严重度；未读完变更出结论 | 否 | 可选（要求 `{approved: bool, blockers: [...]}`） |
| forge-ship | 批量提交；绕过 CI；commit 未落盘就 push | 是（`criticalSystemReminder` 或 prompt 二次出现） | 可选 |
| forge-verify（若未来升级） | 字段缺失；伪造证据 | 是 | **是**（三态 verdict fail-closed） |

### 3. Progressive Disclosure + Conditional Paths + Fork Context

本节有三层机制，从粗到细：

**层 1 — 文件拆分（当前 spec 重点）**

拆分决策树：

```
SKILL.md 当前行数是多少？
├── ≤150 行 → 不拆分
├── 151–300 行 → 拆出 reference.md（模板/表格/规范部分）
└── >300 行 → 拆出 reference.md + examples.md（范例单独一个文件）
```

**执行前提**：`skill-document-optimization` spec 的压缩策略先跑完。跑完后再决定哪些 skill 还需要拆分——很多 skill 压缩后就 ≤150 行了，不需要走这一步。

**拆分时的 SKILL.md 收尾模板**：

```markdown
## Additional resources

- For templates, schemas, and design specs, see [reference.md](reference.md)
- For input/output examples, see [examples.md](examples.md)
```

**契约**：拆分**必须**是无损迁移——把段落原样搬到附属文件 + 在 SKILL.md 留引用；不在拆分时顺带删减内容（那是 `skill-document-optimization` 的职责）。

**层 2 — `paths:` 条件激活（Req 3 AC6 引入）**

Skill frontmatter 支持 `paths:` 字段（源码 `src/skills/loadSkillsDir.ts:156–178,986–1035`）。未匹配当前 touch 路径的 skill **完全不进 context**——比 reference.md 拆分更彻底。

```markdown
---
name: forge-verify
description: ...
paths:
  - "src/**"
  - "test/**"
# 纯文档改动（docs/**、.forge/**）不触发 forge-verify 加载
---
```

**候选 skill 与 `paths:` 建议**：

| Skill | `paths:` 建议 | 理由 |
|---|---|---|
| forge-verify | `["src/**", "test/**", "forge/src/**", "forge/test/**"]` | 纯文档改动不需要 verify |
| forge-fix-conflicts | `[".git/**", "**/*.orig"]` | 只在冲突态出现 |
| forge-test | `["test/**", "**/*.test.ts", "**/*.spec.ts", "vitest.config.ts"]` | 测试改动时才激活 |

**`paths:` 格式规范**（对齐源码 `parseSkillPaths` + `parseFrontmatterPaths`）：
- 键名是 `paths`（小写复数）
- 值可以是字符串或数组；字符串支持 brace 展开（`"src/*.{ts,tsx}"`）
- 支持 brace 交叉展开（`"{a,b}/{c,d}"` → 4 个模式）
- `/**` 后缀会被加载器剥掉
- 全 `**` 视为"无 paths"——无条件加载
- 使用 `ignore()` 库做 gitignore 语义匹配

**层 3 — `context: fork` 执行隔离（Req 3 AC7 引入）**

Skill frontmatter 的 `context: fork` 字段（源码 `SkillTool.ts:executeForkedSkill`）——skill 被调用时在一个**继承父 context 但独立 token budget** 的 forked subagent 里跑。

**候选 skill**：

| Skill | `context: fork` 建议 | 理由 |
|---|---|---|
| forge-grill | 是 | 大量探索和生成会污染主 context，但 skill 的轻量结构比 agent 更合适 |
| forge-storm | 是 | 同上，头脑风暴的中间产物不必进主 context |
| forge-debug（重活路径） | 可选 | 深度调试时有效；轻量调试不需要 |

本 spec 至少开启 1 个 skill 的 `context: fork`；另外列入候选评估。

### 4. Lazy-Loaded Rules（最小示例）

**本 spec 只交付一个示例规则文件 `.claude/rules/spec-editing.md`**：

```markdown
---
paths:
  - ".forge/specs/**"
  - ".forge/specs/**"
---

# Spec Editing Rules

When editing spec files under `.forge/specs/` or `.forge/specs/`:

- Requirements 文件必须保留 Glossary 段落
- Tasks 文件每条子任务必须显式引用 _Requirements: X.Y_
- 在 spec 被冻结（frozen）状态下修改需要先走 /forge decide 流程
```

**`paths:` 格式对齐源码**（`src/utils/claudemd.ts:250–280` + `processConditionedMdRules`）：

- 键名是 `paths`（不是 `globs` / `pathMatch`）
- 值是字符串或数组；字符串可用 brace 展开
- `/**` 后缀会被加载器剥掉
- 全 `**` 视为"无 paths"——当无条件规则加载
- 匹配使用 `ignore()` 库（gitignore 语义）
- 路径**相对于包含 `.claude` 的目录**（Project 规则）或 cwd（User/Managed 规则）

**为什么只交付 1 个示例**：避免本 spec 的改动面爆炸。真正的规则迁移（把 CLAUDE.md 和 `.forge/features/*.md` 里的路径专属条款拆到 `.claude/rules/`）是下一个 spec 的职责，本 spec 只验证基础设施可用。

**后续 spec 的候选规则**（记录在设计中，不在本 spec 实施）：
- `.claude/rules/forge-src.md`（paths: `forge/src/**`）— TypeScript 风格
- `.claude/rules/skill-editing.md`（paths: `.claude/skills/**/SKILL.md`）— frontmatter 不变量
- `.claude/rules/branch-protection.md`（paths: `**/*.ts`, `**/*.md`）— 分支保护检查

### 5. Hooks Dispatcher（最小示例）

**Claude Code Hook 能力全景**（本 spec 设计必须建立在这个全景上，即使只迁移 2 类事件）：

**27 个 Hook 事件**（源码 `src/entrypoints/sdk/coreTypes.ts:HOOK_EVENTS`）：

| 分类 | 事件 | 对 Forge 的价值 |
|---|---|---|
| 已使用 | `PreToolUse`、`PostToolUse`、`PostToolUseFailure`、`UserPromptSubmit`、`SessionStart`、`Stop`、`TeammateIdle` | 当前 Forge 已在用 |
| **高价值候选**（后续 spec 迁入） | `PreCompact`、`PostCompact` | compact 前后保护 progress / plan / knowledge 状态 |
| 高价值候选 | `InstructionsLoaded` | CLAUDE.md 或 rule 加载时审计触发路径，帮助调试 `paths:` 匹配 |
| 高价值候选 | `FileChanged` | 文件变动自动更新 `.forge/progress/` |
| 高价值候选 | `TaskCreated`、`TaskCompleted` | 任务队列全流程审计 |
| 高价值候选 | `SubagentStart`、`SubagentStop` | 监控 agent spawn 行为，配合 Req 1 的升级 |
| 可选 | `SessionEnd`、`StopFailure`、`Notification`、`Setup`、`PermissionRequest`、`PermissionDenied`、`Elicitation`、`ElicitationResult`、`ConfigChange`、`WorktreeCreate`、`WorktreeRemove`、`CwdChanged` | 按需 |

**4 种 Hook 类型**（源码 `src/schemas/hooks.ts`）：

| 类型 | 用途 | 关键字段 |
|---|---|---|
| `command` | bash 命令 | `command`、`timeout`、`async`（后台）、`asyncRewake`（后台错误唤醒模型）、`once`（运行一次后删除）、`shell: bash\|powershell\|pwsh` |
| `prompt` | LLM 评估条件 | `prompt`（含 `$ARGUMENTS` 占位）、`model`（默认 Haiku） |
| `agent` | agentic verifier | `prompt`、`model`（默认 Haiku）；常用于 PostToolUse 后核查 |
| `http` | POST JSON 到 URL | `url`（须 URL 验证）、`headers`、`allowedEnvVars`（环境变量白名单） |

所有 hook 都支持 `if:` 字段做**条件预过滤**（源码 `IfConditionSchema`）——格式 `if: "Bash(git *)"`（permission-rule 语法），只有匹配的 tool 调用才 spawn 该 hook 的处理函数。**这是 Claude Code 官方推荐的性能优化**，避免每次 Bash 都触发所有 hooks。

**正确的 Exit Code 语义**（源码 `src/utils/hooks/hooksConfigManager.ts:getHookEventMetadata`）：

| 事件 | exit 0 | exit 2 | 其他 |
|---|---|---|---|
| PreToolUse | stdout/stderr 不显示 | **阻塞工具调用**（stderr 返给模型） | stderr 给用户但继续 |
| PostToolUse | stdout 显示在 transcript 模式 | 立即把 stderr 返给模型 | stderr 给用户 |
| UserPromptSubmit | stdout 传给 Claude | **抹掉原 prompt**（stderr 给用户） | stderr 给用户 |
| SessionStart | stdout 传给 Claude | 阻塞错误被忽略 | stderr 给用户 |
| Stop | stdout/stderr 不显示 | **阻塞会话结束**（stderr 返给模型，会话继续） | stderr 给用户 |
| PreCompact | stdout 作为自定义 compact 指令 | **阻塞 compaction** | stderr 给用户但继续 |

**Dispatcher 必须按事件语义返回正确的 exit code，而不是盲目 exit 0**。

**骨架脚本 `.claude/hooks/scripts/dispatcher.sh`**（注意：按 Req 6 AC4 建议，**配置优先复用 `.claude/settings.json` + `.claude/settings.local.json` 的分层**；仅当有 Forge 专属开关时才引入独立配置文件。下例展示两种写法——上半段用独立 config，下半段用 settings 分层的改写注释）：

```bash
#!/usr/bin/env bash
# Forge Hooks Dispatcher — 统一入口
# 从 stdin 读 JSON，按 hook_event_name 分派；按事件语义返回正确 exit code

set -u  # 不用 -e；事件处理函数内部再按语义控制
STDIN=$(cat || true)
EVENT=$(echo "$STDIN" | jq -r '.hook_event_name // empty' 2>/dev/null || true)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 方案 A（独立 config）：
CONFIG_DIR="$SCRIPT_DIR/../config"
CONFIG_DEFAULT="$CONFIG_DIR/hooks-config.json"       # 团队共享（可选）
CONFIG_LOCAL="$CONFIG_DIR/hooks-config.local.json"   # 个人覆盖（git-ignored）
# 方案 B（推荐 — 复用 settings 分层）：从 .claude/settings.local.json / settings.json
# 用 jq 读 forge.hooks 下的开关。仅在新增 Forge 专属开关时才必须用方案 A。

is_disabled() {
  local key="disable${1}Hook"
  if [[ -f "$CONFIG_LOCAL" ]]; then
    local v=$(jq -r ".${key} // empty" "$CONFIG_LOCAL" 2>/dev/null || echo "")
    [[ "$v" == "true" ]] && return 0
  fi
  if [[ -f "$CONFIG_DEFAULT" ]]; then
    local v=$(jq -r ".${key} // empty" "$CONFIG_DEFAULT" 2>/dev/null || echo "")
    [[ "$v" == "true" ]] && return 0
  fi
  return 1
}

if [[ -n "$EVENT" ]] && is_disabled "$EVENT"; then
  exit 0
fi

# 注意：case 分支内部**按事件语义**决定 exit code
# - SessionStart: stdout 传给 Claude；阻塞错误被忽略 → exit 0
# - UserPromptSubmit: stdout 传给 Claude；exit 2 抹掉 prompt → 正常路径 exit 0
case "$EVENT" in
  SessionStart)
    bash forge/scripts/auto-resume.sh 2>/dev/null || true
    if [[ -f .forge/knowledge/evolved-rules.md ]]; then
      echo '=== Evolved Rules ==='
      cat .forge/knowledge/evolved-rules.md
    fi
    exit 0
    ;;
  UserPromptSubmit)
    if [[ -f .forge/status.md ]]; then
      echo '=== Forge Context ==='
      head -50 .forge/plans/*.md 2>/dev/null || true
      echo '=== Recent Progress ==='
      tail -20 .forge/progress/*.md 2>/dev/null || true
    fi
    exit 0
    ;;
  # 未来的事件迁移在这里添加，按上面的 exit-code 表决定合适返回值
  *)
    exit 0
    ;;
esac
```

**`.claude/settings.json` 的改动**（只涉及 SessionStart 和 UserPromptSubmit 两类）：

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ${CLAUDE_PROJECT_DIR}/.claude/hooks/scripts/dispatcher.sh",
            "timeout": 5,
            "async": true
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ${CLAUDE_PROJECT_DIR}/.claude/hooks/scripts/dispatcher.sh"
          }
        ]
      }
    ],
    "PreToolUse": [ /* 保持原样；未来迁移示例会用 if: "Bash(git *)" 做条件过滤 */ ],
    "PostToolUse": [ /* 保持原样 */ ],
    "Stop": [ /* 保持原样 */ ],
    "TeammateIdle": [ /* 保持原样 */ ]
  }
}
```

**`hooks-config.json`（可选）示例**——仅在引入 Forge 专属开关时创建：

```json
{
  "disableSessionStartHook": false,
  "disableUserPromptSubmitHook": false,
  "disableLogging": true
}
```

**HOOKS-README.md 必须覆盖**：

1. dispatcher 的职责和调用路径
2. 27 个事件的全清单（分已用 / 高价值候选 / 可选三组）
3. 4 种 hook 类型（command / prompt / agent / http）的使用场景
4. exit code 语义表（对齐源码 `hooksConfigManager.ts`）
5. `if:` 条件预过滤的示例（避免所有 Bash 调用都 spawn dispatcher）
6. 如何添加新事件的分派分支（修改 `case "$EVENT"` + 按事件 exit code 语义编写）
7. 如何禁用某事件（settings.local 或 `hooks-config.local.json`）
8. log 文件位置（`.claude/hooks/logs/hooks-log.jsonl`，当 `disableLogging: false` 时启用）

**为什么只迁 2 类事件**：这 2 类是 hook 里最简单的（打印上下文，不涉及 frozen-check 等业务逻辑）。PreToolUse 有 `check-frozen.js` 等复杂调用，一次全迁风险太大。本 spec 证明 dispatcher 模式跑得通，剩余事件留给下一个 spec。未来迁移 PreToolUse 时，记得利用 `if:` 条件预过滤，只在 `Bash(git *)` 等特定模式才进 dispatcher。

### 6. Agent Learnings — 迁入 `.claude/agent-memory/` 目录

**关键设计决定**：本 spec 的 Learnings 不再 inline 到 agent 定义文件里。理由在 Req 7 AC1 已说明——agent 定义保持稳定、learning 独立审查归档、和 `memory: project` 零冲突。

**物理结构**：

```
.claude/agent-memory/<agent-name>/
├── MEMORY.md                        # 索引文件（≤200 行 / ≤25K 字节；双层截断）
├── user_role.md                     # type: user
├── feedback_no_batch_commits.md     # type: feedback
├── project_flaky_tests.md           # type: project
├── reference_forge_changelog.md     # type: reference
└── archive/                         # 归档目录（超过 3 个月的 learning）
    └── ...
```

**四类分类**（源码 `src/memdir/memoryTypes.ts:MEMORY_TYPES`）：

| type | 内容 | 示例文件名 |
|---|---|---|
| `user` | 用户角色、偏好、技能深浅 | `user_role.md`、`user_frontend_expert.md` |
| `feedback` | 用户纠正或确认的做法；body 必须含 Rule + Why + How to apply | `feedback_no_batch_commits.md`、`feedback_prefer_inline_test.md` |
| `project` | 项目动态状态：deadline、flaky 列表、incident | `project_flaky_tests.md`、`project_release_freeze.md` |
| `reference` | 外部系统指针 | `reference_forge_changelog.md`、`reference_ci_dashboard.md` |

**Learning 文件 frontmatter**：

```yaml
---
type: feedback              # user | feedback | project | reference
title: "Never batch commits in forge-ship"
created: 2026-05-12
---

Rule: forge-ship 严格按每文件一次 commit；禁止批量提交。

**Why**: 团队在 2025-12 有一次批量提交事故，回滚时无法单独回退某个文件的改动。

**How to apply**: 当 `git diff` 显示多个文件变动时，逐文件执行 `git add <single-file>` + `git commit`；commit message 针对该文件独立描述。仅当用户显式要求批量提交时例外。
```

**`MEMORY.md`（索引）格式**：

```markdown
# forge-build Agent Memory Index

## User
- [User role](user_role.md) — senior backend engineer, prefers terse responses

## Feedback
- [No batch commits](feedback_no_batch_commits.md) — one file per commit unless explicit
- [Prefer inline tests](feedback_prefer_inline_test.md) — same-file vitest blocks

## Project
- [Flaky test list](project_flaky_tests.md) — currently tracking 3 known flakes
- [Release freeze 2026-05-15](project_release_freeze.md) — no non-critical merges after 2026-05-15

## Reference
- [Forge changelog](reference_forge_changelog.md) — CHANGELOG.md + scripts/bump-version.sh
```

索引只一行 ≤150 字符，不含内容本身（源码硬要求）；双层截断保护（≤200 行 ≤25K 字节，超限后末尾追加警告说明）。

**Workflow 追加指令**（加到每个 agent 的 Workflow 末段或 Output Summary 后）：

```markdown
### Self-evolution (after every execution)

如果本次执行过程中发现了值得记录的新约定、边界情况或工程决策，追加/更新
`.claude/agent-memory/<agent-name>/` 下对应 type 的 `.md` 文件，并在 `MEMORY.md`
补索引行。

**每条 learning 的 body 格式**：
- `feedback` 类：必须含 `Rule` + `**Why**:` + `**How to apply**:` 三段
- 相对日期转绝对日期（"Thursday" → 具体日期）
- Team scope 禁写 API keys / credentials
- 既记失败也记成功（只记 correction 会让 agent 越来越谨慎）

**不该存清单**（源码 WHAT_NOT_TO_SAVE_SECTION）：
- 代码模式 / 架构 / 文件路径 / 项目结构——可从当前项目状态推导
- Git 历史 / 最近变更——`git log` 权威
- 调试解决方案 / fix 食谱——修复在代码里、commit message 有上下文
- 已在 CLAUDE.md 里的内容
- 瞬时任务细节（in-progress 工作、临时状态）

**归档**：当 `MEMORY.md` 行数 >200 或字节 >25K 时，把超过 3 个月的 learning
文件移到 `.claude/agent-memory/<agent-name>/archive/`，同步从 `MEMORY.md`
删除索引项。
```

**Learnings vs 自动 MEMORY.md 注入的分工**：

| 维度 | 本 spec 的 Learnings | 源码的自动 MEMORY.md 注入 |
|---|---|---|
| 物理位置 | `.claude/agent-memory/<agent>/` 下的独立文件 + MEMORY.md | 同 |
| 内容来源 | agent 执行后主动写入 | 同 |
| 加载方式 | MEMORY.md 首 200 行自动注入到 agent 系统提示 | 同（`memory: project` 触发） |
| 分类 | 四类（user/feedback/project/reference） | 四类 |
| 编辑频率 | agent 每次运行发现新经验时追加 | 同 |

**这两套其实是同一套**——本 spec 的 Learnings 就是 Claude Code `memory: project` 的正确用法。Req 7 只是把它从"inline 段落"这个错误位置挪到正确位置。

### 7. CLAUDE.md 瘦身 + 每文件提交 + `@path` 引用

**瘦身步骤**：

1. 测量当前行数（`wc -l CLAUDE.md`）——设计文档无法预判具体行数，tasks 里加一步基准测量
2. 按主题打标，识别"路径专属"条款（可迁 `.claude/rules/`）vs"跨项目长文档"条款（可迁 `.forge/docs/living/`）vs"全局核心"条款（留下）
3. 迁出路径专属条款，在 CLAUDE.md 保留一行 `@path/to/rule.md` 引用
4. 迁出长文档条款，在 CLAUDE.md 保留一行 `@path/to/doc.md` 引用
5. 复核行数 ≤200

**为什么 200 行**：Claude Code 源码 `claudemd.ts:93` 的 `MAX_MEMORY_CHARACTER_COUNT = 40000`（约 800 行）是硬兜底。**本 spec 选 200 行是主动更严**——CLAUDE.md 每轮都加载且进 prompt cache，越严越能降 cache_creation token 成本、同时让规则密度更高。

**`@path` 语法规范**（源码 `src/utils/claudemd.ts:18–26,457–501`）：

| 用法 | 语义 |
|---|---|
| `@path` | 相对路径（等同 `@./path`） |
| `@./relative/path` | 相对路径 |
| `@~/home/path` | 用户家目录 |
| `@/absolute/path` | 绝对路径 |

**注意事项**（源码行为）：

- **只在 leaf text node 里生效**——代码块内的 `@path` 不会被识别
- 被 include 的文件作为独立条目插在 including 文件之前
- 循环引用自动检测
- 不存在的文件**静默忽略**（不会 fail）
- 支持的文件扩展名见源码 `TEXT_FILE_EXTENSIONS`（`.md`, `.txt`, `.text` 等）

**警告：Kiro 的 `#[[file:<path>]]` 语法在 Claude Code 会话中不生效**。本 spec 的 AC3 明确要求使用 `@path` 语法；任何迁到 `.claude/rules/` 的规则在 CLAUDE.md 里用 `@.claude/rules/<name>.md` 引用。

**CLAUDE.md 顶部示例**：

```markdown
# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

<!-- 附属规则（路径专属、懒加载） -->
<!-- 注意：@path 只在正文 leaf text node 生效，不能放在 HTML 注释或代码块里 -->

@.claude/rules/spec-editing.md
@.claude/rules/forge-src.md
@.forge/docs/living/branch-protection.md

## Core Principles
...
```

**新增的每文件提交条款**（加在现有 `## Git Commit Rules` 章节）：

```markdown
### Separate Commits Per File

除非用户显式请求批量提交，否则每个文件一次提交：

- `git add <single-file>` + `git commit -m "<对该文件的具体描述>"`
- 不同文件的改动不合并到同一个 commit 中
- 这让 git 历史可按文件回滚、cherry-pick、review

示例：README、SKILL.md、rule.md 都改动 →
  Commit 1: git add README.md → "README: 更新……"
  Commit 2: git add .claude/skills/.../SKILL.md → "SKILL: ……"
  Commit 3: git add .claude/rules/....md → "rules: ……"
```

**保留源码 `commands/commit.ts` 的三条硬约束**（若当前 CLAUDE.md 没有，瘦身时补上）：
- NEVER skip hooks（`--no-verify` / `--no-gpg-sign`）除非用户明示
- NEVER `--amend`（pre-commit hook 失败时更要 NEW commit，避免覆盖前一个 commit）
- NEVER commit files that likely contain secrets（`.env`、`credentials.json` 等）

**`forge-ship` 契约补引用**：契约中新增一行"遵循 CLAUDE.md 的每文件提交规则，除非用户显式请求批量提交"。

### 8. settings.local.json 分离

**`.gitignore` 追加**：

```
# Personal Claude Code overrides
.claude/settings.local.json
.claude/hooks/config/hooks-config.local.json
```

**`.claude/settings.local.json.example` 内容**：

```jsonc
{
  // 个人配置覆盖示例 — 复制为 settings.local.json 后修改
  // 本文件不被 git 追踪；优先级高于 .claude/settings.json，但低于 flagSettings / policySettings

  "spinnerVerbs": {
    "mode": "replace",
    "verbs": ["Forging", "Refining", "Crafting"]
  },
  "outputStyle": "Explanatory",
  "permissions": {
    "allow": [
      // 在此添加你个人常用的允许规则（将与团队共享规则合并）
    ]
  }
}
```

**Settings 合并顺序**（源码 `src/utils/settings/constants.ts:SETTING_SOURCES`）：

```
userSettings ← projectSettings ← localSettings ← flagSettings ← policySettings
                                   ↑
                    本 spec 引入的 settings.local.json
```

`localSettings` 覆盖 `projectSettings`，但 `flagSettings`（命令行 `--settings`）和 `policySettings`（企业托管配置）还能进一步覆盖 local——**local 不是最高优先级**。CLAUDE.md 的"个人配置覆盖"小节必须明确写出这个合并顺序，避免用户误以为 settings.local.json 是最高。

**CLAUDE.md 新增一小节**"个人配置覆盖"（约 10 行）说明用法 + 合并优先级。

### 9/10. P2 参考文档

单文件 `.forge/docs/living/ccbp-patterns-p2.md`，两节：

**验证通道（Verification Lane）**——按 change-type 分 10 小节（对齐源码 `verificationAgent.ts` 的 playbook）：

| Change Type | 验证策略 | 依赖项 |
|---|---|---|
| Frontend | Browser automation：`mcp__claude-in-chrome__*` / `mcp__playwright__*` 点击截图读 console；curl 子资源（`/_next/image`、同源 API、静态资源） | Playwright MCP 或 Chrome DevTools MCP |
| Backend/API | 启服务 → curl/fetch 端点 → 验响应 schema → 测错误处理 → 测边界 | 无 |
| CLI/Script | 运行样本输入 → 验 stdout/stderr/exit → 测边界（空、malformed） → 验 `--help` | 无 |
| Infra/Config | 语法检查 → dry-run（`terraform plan`、`kubectl apply --dry-run=server`） → 检查 env | terraform / kubectl / docker |
| Library/Package | Build → 全量测试 → 从 fresh 环境 import → 验导出类型 | 无 |
| Bug fix | 复现原 bug → 验 fix → 跑 regression → 查相关功能副作用 | 无 |
| Mobile | Clean build → install 到 simulator → dump 无障碍 tree → 按 label 找元素 → tap → 重新 dump → 查 logcat/device console | idb / uiautomator |
| Data/ML pipeline | 样本输入运行 → 验输出 schema/types → 测边界（空、单行、NaN/null） → 查 silent 数据丢失 | 无 |
| DB migration | up 运行 → 验 schema → down 可逆 → 对现存数据测 | 数据库客户端 |
| Refactoring | 既有测试必须全过 → diff 公开 API（无增减 exports） → 抽查可观察行为不变 | 无 |

最多 50 行；引用 `verificationAgent.ts` 作为源码参考。

**Session 五选一**（引自 Thariq 表 + 源码 `coordinator/coordinatorMode.ts:260–290` 的 continue vs spawn 决策表）：

| 场景 | 选择 | 原因 |
|---|---|---|
| 同一任务、context 还相关 | Continue（`SendMessage` to agent id） | 内容仍在负载 |
| 走错路了 | Rewind（双击 Esc；源码 `/rewind` 命令） | 保留有用的 file reads、抹掉失败尝试 |
| 任务中途但 session 被无关调试污染 | `/compact <hint>` | 低成本、带提示引导总结；源码 direction=`from` |
| 真正开始新任务 | `/clear` | 零污染、你决定带什么 |
| 下一步产生大量只要结论的输出 | Subagent（`Agent(subagent_type="...")`） | 中间噪音留在子 context |

≤20 行；引用源码的 7 行 continue-vs-spawn 决策表作为进阶参考。

### 11. 源码新增能力补遗

本节落地 Req 11 的 5 项能力，每项对应具体文件改动：

**11.1 `disable-model-invocation` 保护破坏性 skill**

目标 skill（至少 3 个）：`forge-ship` stub、`forge-pack`、`forge-abort`。

frontmatter 改动：

```yaml
---
name: forge-ship
description: ...
disable-model-invocation: true     # 模型不能"主动决定去 ship"，只有用户显式调用才触发
user-invocable: true               # 用户可以 /forge ship 触发（保持）
---
```

对应到`forge-grill`、`forge-storm` 等探索类 skill，若判断用户很少主动调用、几乎都是模型内部使用，可考虑 `user-invocable: false`（默认 `true`）把它们从用户的 `/` 补全里隐藏。

**11.2 `requiredMcpServers` 控制 agent 可见性**

若 Forge 有依赖可选 MCP 的 agent，frontmatter 用：

```yaml
---
name: forge-jira-sync
description: Sync forge specs to Jira tickets
requiredMcpServers:
  - "jira"                         # 子串匹配，大小写不敏感
  - "atlassian"
---
```

agent 只在这些 MCP 连接成功时出现在 `subagent_type` 列表里。若 Forge 当前没有这类 agent，本节退化为文档说明 + 未来使用注意事项。

**11.3 `effort: high` 深度思考**

`forge-plan` 和 `forge-review`：

```yaml
effort: high                       # EFFORT_LEVELS 枚举：low/medium/high/... 或正整数
```

**11.4 `Stop` hook + `SyntheticOutputTool` 运行时 fail-closed（落地到 `forge-verify`）**

方案一（推荐——Forge 自建 loader 如果支持 Stop hook 注册）：

```yaml
# .claude/skills/forge-verify/SKILL.md frontmatter
---
name: forge-verify
description: ...
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
  - SyntheticOutput                # 必须在白名单
  - Skill
hooks:
  Stop:
    - type: command
      command: bash ${CLAUDE_PROJECT_DIR}/.claude/hooks/scripts/check-verify-verdict.sh
      # exit 2 阻塞会话结束；exit 0 通过
---
```

配合 check-verify-verdict.sh：

```bash
#!/usr/bin/env bash
# 检查本会话是否调用过 SyntheticOutput 并返回了合法 verdict
# 通过读 transcript（stdin 里有 transcript_path）
STDIN=$(cat || true)
TRANSCRIPT=$(echo "$STDIN" | jq -r '.transcript_path // empty')
if [[ -z "$TRANSCRIPT" ]] || [[ ! -f "$TRANSCRIPT" ]]; then
  exit 0       # 没 transcript 就不阻
fi
# 检查最后一个 assistant 消息是否调用了 SyntheticOutput 且返回三态之一
HAS_VERDICT=$(jq -s '... complex jq expression ...' "$TRANSCRIPT" 2>/dev/null || echo "false")
if [[ "$HAS_VERDICT" != "true" ]]; then
  echo "CRITICAL: forge-verify must end with SyntheticOutput tool returning {verdict: 'VERIFIED'|'NOT_VERIFIED'|'INCONCLUSIVE'}" >&2
  exit 2        # 阻塞会话结束，stderr 返给模型
fi
exit 0
```

方案二（退化——不动 loader，用 prompt 强化）：

```markdown
## Execution Contract

**CRITICAL**: Your response MUST end with a SyntheticOutput tool call returning
`{verdict: "VERIFIED" | "NOT_VERIFIED" | "INCONCLUSIVE", evidence: [...]}`. Any
other response format will be rejected by the verifier harness.
```

本 spec 至少示范方案二；方案一留到下一个 spec。

**11.5 `criticalSystemReminder` 每轮再注入**

落地到 `forge-verify` 和 `forge-ship`：

**方案 A（若 Forge 自建 loader）**——扩展 agent frontmatter：

```yaml
criticalSystemReminder: "CRITICAL: forge-ship must commit file-by-file unless user explicitly requests batch. NEVER push without CI pass."
```

**方案 B（退化）**——在 prompt body 两处重复关键禁令：

```markdown
# Forge Ship Agent

**CRITICAL REMINDER**: commit file-by-file, never skip CI. (repeated below)

## Execution Contract (non-negotiable)
...

## Workflow

**Reminder**: commit file-by-file, never skip CI.

... (workflow 正文)
```

本 spec 至少示范方案 B；方案 A 等 Forge loader 升级后启用。

---

## Contract Test Update Strategy

改造会同时改动文件位置（skill → agent）和文件结构（SKILL.md 拆分）。contract test 需要对应更新：

```typescript
// test/contract.skills.test.ts 的改动点（伪代码）

// 1. 双形态识别：同时查 skill 文件 OR agent 文件
const locateSubcommand = (name: string) => {
  const agentPath = `.claude/agents/${name}.md`;
  const skillPath = `.claude/skills/${name}/SKILL.md`;
  if (existsSync(agentPath)) return { kind: 'agent', path: agentPath };
  if (existsSync(skillPath)) return { kind: 'skill', path: skillPath };
  throw new Error(`Neither agent nor skill found for ${name}`);
};

// 2. 迁移到 agent 的 4 个子命令改查 agent 文件
const MIGRATED_TO_AGENT = ['forge-plan', 'forge-build', 'forge-review', 'forge-ship'];

// 3. Progressive Disclosure 拆分识别
const SPLIT_SKILLS = [/* 行数 >150 拆分后的 skill 名 */];
for (const name of SPLIT_SKILLS) {
  expect(existsSync(`.claude/skills/${name}/SKILL.md`)).toBe(true);
  expect(existsSync(`.claude/skills/${name}/reference.md`)).toBe(true);
}

// 4. Agent frontmatter 不变量 —— 注意字段名是 tools（不是 allowedTools）
for (const name of MIGRATED_TO_AGENT) {
  const fm = parseFrontmatter(`.claude/agents/${name}.md`);
  expect(fm).toMatchObject({
    name,
    description: expect.stringContaining('PROACTIVELY'),
    tools: expect.any(Array),                      // 源码字段名是 tools
    memory: 'project',
  });

  // 特别校验 forge-build：必须显式含 Agent（否则 spawn subagent 会失败）
  if (name === 'forge-build') {
    expect(fm.tools).toContain('Agent');
  }

  // WebFetch/WebSearch 必须排除
  expect(fm.tools).not.toContain('WebFetch');
  expect(fm.tools).not.toContain('WebSearch');
}

// 5. Skill frontmatter 不变量 —— 字段名用连字符（allowed-tools 等）
for (const name of ['forge-verify', 'forge-fix-conflicts', 'forge-test']) {
  const fm = parseFrontmatter(`.claude/skills/${name}/SKILL.md`);
  // paths 字段存在且是合法 list
  if (fm.paths) {
    expect(Array.isArray(fm.paths) || typeof fm.paths === 'string').toBe(true);
  }
}

// 6. 破坏性 skill 必须有 disable-model-invocation
for (const name of ['forge-ship', 'forge-pack', 'forge-abort']) {
  const fm = parseFrontmatter(`.claude/skills/${name}/SKILL.md`);
  expect(fm['disable-model-invocation']).toBe(true);
}

// 7. Execution Contract 段落存在
for (const name of MIGRATED_TO_AGENT) {
  const content = readFileSync(`.claude/agents/${name}.md`, 'utf-8');
  expect(content).toContain('## Execution Contract (non-negotiable)');
}

// 8. @path 引用的目标文件必须存在
const claudeMd = readFileSync('CLAUDE.md', 'utf-8');
const atPathMatches = claudeMd.matchAll(/^@([^\s]+)/gm);
for (const m of atPathMatches) {
  // 跳过代码块内的匹配（需要先剥代码块）
  expect(existsSync(resolveAtPath(m[1]))).toBe(true);
}
```

具体的 contract 断言集合在 tasks 里细化——本设计只给策略。

---

## Risks & Mitigations

| 风险 | 影响 | 缓解 |
|---|---|---|
| skill → agent 迁移导致调用路径断裂 | 高 — 可能阻断 `/forge build` | skill stub 保留 + description 指向 agent；contract test 同时覆盖两种形态 |
| agent 的 `tools` 白名单漏掉 `Agent` 导致无法 spawn subagent | 高 — 源码默认禁用 `AgentTool`（`CUSTOM_AGENT_DISALLOWED_TOOLS`） | contract test 断言 `forge-build.tools` 必须含 `Agent`；设计文档明确写入 |
| Execution Contract 过严导致 agent 卡死在正常操作 | 中 — agent 误判为"禁止行为"而停止 | 契约只形式化已有的 Workflow 指令；不引入新约束；tasks 里每个 agent 先试跑一次 |
| Progressive Disclosure 拆分后 reference.md 被遗漏加载 | 中 — agent 拿不到模板 | SKILL.md 的 `## Additional resources` 引用是 Anthropic 推荐格式，模型会按需 Read；拆分后必须跑 skill 一次人工验证 |
| `paths:` 条件激活匹配过宽/过窄 | 中 — skill 在错误场景加载或漏载 | 初版只给少量示例，配合 contract test 校验格式；gitignore 语义本身对 false-positive 宽容 |
| `context: fork` 隔离导致父 context 无法看到 skill 结果 | 中 — 上报机制需要明确 | `context: fork` 的 skill 必须在 workflow 里显式声明"最后输出会作为 subagent result 返回给父"；tasks 里写清示例 |
| 懒加载规则 `paths:` 匹配过宽 | 低 — 偶尔误加载 | 本 spec 只给 1 个示例规则，paths 写 `.forge/specs/**` 足够窄 |
| Hooks dispatcher 吞掉真实错误 | 中 — 调试困难；更糟的是**错误使用 exit 0 屏蔽应该阻塞的情况** | 按源码 exit code 语义表实现：Stop/PreToolUse 等事件上 exit 2 表示阻塞，不能无脑 exit 0；`disableLogging: false`（默认）时写 `hooks-log.jsonl`；出错时人工查 log |
| `@path` 写在代码块里或 HTML 注释里 | 低 — 语法被忽略导致 include 失效 | 源码只在 leaf text node 解析 `@path`；CLAUDE.md 示例明确写在正文中；contract test 可选地校验 |
| CLAUDE.md 瘦身丢失规则 | 高 — 规则真丢了就很难找回 | 瘦身前 git tag 一个 pre-slim 标签；瘦身后逐行对照"被移出的内容现在在哪"清单 |
| settings.local.json 被误 commit | 低 — 泄露个人偏好 | `.gitignore` 放到 `.claude/` 小节顶部；CLAUDE.md 说明里强调 + 明确合并优先级（local < flag < policy） |
| `Stop` hook + StructuredOutput 演示脚本错误阻塞会话 | 中 — 所有会话都结束不了 | 演示 hook 只挂在单个 skill（`forge-verify`）上；check-verdict 脚本有完善的短路（无 transcript → exit 0） |
| `criticalSystemReminder` 方案 A 需要改 loader 可能引入回归 | 中 — 影响所有 agent | 初版用方案 B（prompt 内二次出现），不改 loader；方案 A 留到下一个 spec 单独做 |

---

## What This Spec Does NOT Do

（显式圈定边界，避免 scope creep）

- **不**把所有 skill 都升级为 agent——只升级 4 个重活。
- **不**迁移完整的 27 类 hooks 事件——只示范 SessionStart + UserPromptSubmit；HOOKS-README 只是把全事件清单**文档化**作为后续 spec 的参考。
- **不**从 CLAUDE.md 全量迁出路径专属条款——只交付 1 个懒加载规则示例。
- **不**全面启用 `paths:` 条件激活——只在 `forge-verify` / `forge-fix-conflicts` / `forge-test` 三个 skill 上示范。
- **不**全面启用 `context: fork`——只在至少 1 个 skill 上示范。
- **不**安装任何新的 MCP（Playwright/Chrome DevTools）——P2 只记录推荐配置。
- **不**实现 agent 自动归档 Learnings 的脚本——只规定 workflow 指令，人工或下一个 spec 做。
- **不**修改 `skill-document-optimization` spec 的任何已有任务——本 spec 的 Progressive Disclosure 仅对它完成后还 >150 行的 skill 生效。
- **不**引入 agent 间的新通信机制——agent 之间仍通过调用方（command）中转。
- **不**扩展 Forge 自建 agent loader（支持 `criticalSystemReminder` 字段、支持 `Stop` hook 自动注册）——这些能力用**退化方案 B**在本 spec 落地；方案 A 的 loader 扩展留给下一个 spec。
- **不**把所有 agent 的输出都套上 `Stop` hook + `SyntheticOutputTool`——只在 `forge-verify` 示范完整机制。
- **不**全面铺开 4 种 hook 类型（command / prompt / agent / http）——本 spec dispatcher 骨架只处理 `command` 类型；其他 3 种类型的使用等后续 spec。
