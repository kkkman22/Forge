---
status: completed
feature: ccbp-inspired-hardening
layout: requirements
created: 2026-05-12
tier: standard
---
# Requirements Document

## Introduction

对 [shanraisshan/claude-code-best-practice](https://github.com/shanraisshan/claude-code-best-practice) 仓库与 Claude Code 源码（`ericshang98/claude-code-source`）做完整调研后，识别出 15 条对 Forge 有借鉴价值的工程模式。这些模式的共同特征是：**把 Claude Code 的 harness（框架层）能力用到极致**——而不是单纯堆 prompt。Forge 当前在 prompt 层已经做得相当深，但在 harness 层（`tools` 白名单收紧、`paths:` 懒加载、独立 context agent、hooks dispatcher、Stop hook + 结构化输出兜底等）还有明显留白。

本 spec 把这些模式拆为一套连贯的工程改造，分三个优先级批次落地：

- **P0（本 spec 必交付）**：三层编排升级、Execution Contract（含运行时 fail-closed）、Skill 渐进披露（含 `paths:` 条件激活与 `context: fork` 隔离）、CLAUDE.md 瘦身、commit 粒度规则、settings.local 分离。
- **P1（本 spec 设计但单独执行）**：懒加载 rules、hooks dispatcher（含 27 事件清单与 `if:` 条件过滤）、agent Learnings 迁入 `agent-memory/` 目录。
- **P2（本 spec 记录但延后）**：验证通道集成、Session 五选一提示。依赖外部 MCP 安装或 UI 辅助。

优化不改变任何现有行为契约，所有现有 contract test（`test/contract.test.ts` 和 `test/contract.skills.test.ts`）必须继续通过。

## Glossary

- **Harness**：Claude Code 的框架层，包括 `tools` 白名单、`paths:` 懒加载、hooks 生命周期、agent 独立 context 等 prompt 之外的机制。参考报告 `ccbp-reference/reports/why-harness-is-important.md` 与源码 `src/tools/AgentTool/loadAgentsDir.ts`。
- **Command_Agent_Skill_Architecture**：Command → Agent → Skill 三层编排模式。Command 作入口与编排，Agent 作自主多步任务（独立 context），Skill 作可复用过程（主 context）。
- **Execution_Contract**：写在 agent/command/skill 开头的 `## Execution Contract (non-negotiable)` 段落，明确列出"必须做"和"禁止做"的行为，配合 `tools` 字段在 harness 层强制，配合 `criticalSystemReminder` 和 `Stop` hook 在运行时强制。
- **Fail_Closed_Guardrail**：契约中的兜底条款——当被调用方返回异常或缺失预期字段时，调用方不得自行补救或绕路，必须停下并报错。
- **Progressive_Disclosure**：Skill 按三文件拆分：`SKILL.md`（入口，≤150 行）、`reference.md`（规范表）、`examples.md`（范例）。详情只在 skill 被真正调用时才进入 context。进一步可配合 `paths:` 条件激活与 `context: fork` 执行隔离。
- **Canonical_Example**：一种输出格式只保留一个完整示例，变体用一行差异描述替代（沿用 `skill-document-optimization` spec 的已有策略）。
- **Lazy_Loaded_Rule**：`.claude/rules/<topic>.md` 文件，带 `paths:` YAML frontmatter。仅当 Claude 读写匹配路径的文件时，规则才加载到当前会话。源码实现在 `src/utils/claudemd.ts:250–280` + `processConditionedMdRules`，使用 `ignore()` 库做 gitignore 语义匹配。
- **At_Path_Syntax**：Claude Code 的 `@path` include 指令（`claudemd.ts:18–26`）。语法 `@path` / `@./relative/path` / `@~/home/path` / `@/absolute/path`；只在正文 leaf text node 里生效（代码块内不识别）；支持循环引用检测和静默处理不存在的文件。**这是 Claude Code 真正的 include 语法；Kiro 的 `#[[file:<path>]]` 语法在 Claude Code 会话中无效。**
- **Tools_Whitelist**：agent 的 `tools` frontmatter 字段（注意字段名是 `tools`，不是 `allowedTools`），用来收紧工具可见性；`disallowedTools` 字段负反向剥离。源码 `loadAgentsDir.ts:75–98` + `agentToolUtils.ts:resolveAgentTools`。缺省下 `CUSTOM_AGENT_DISALLOWED_TOOLS` 会强制禁用 `AgentTool`——需要 subagent 能力的 agent 必须在 `tools` 里显式列出 `Agent`。
- **Critical_System_Reminder**：`criticalSystemReminder_EXPERIMENTAL` 字段（源码见 `BuiltInAgentDefinition`）——每个用户 turn 都把这段短文本再注入一次，防止模型在长会话里忘掉契约。`verificationAgent.ts` 的实战用法："CRITICAL: This is a VERIFICATION-ONLY task. ... You MUST end with VERDICT: PASS, VERDICT: FAIL, or VERDICT: PARTIAL."
- **Stop_Hook_Structured_Output**：运行时 fail-closed 机制，源码 `src/utils/hooks/hookHelpers.ts:registerStructuredOutputEnforcement`。在会话 `Stop` 事件注册一个 function hook，检查是否调用过 `SyntheticOutputTool`；没调用就阻塞会话结束并强制模型再调一次结构化输出工具，实现"必须以规定的 JSON 格式结束"。
- **Conditional_Skill_Paths**：skill frontmatter 的 `paths:` 字段，源码 `src/skills/loadSkillsDir.ts:156–178`。未匹配当前 touch 路径的 skill 完全不进 context，比 reference.md 拆分更彻底。
- **Fork_Skill_Context**：skill frontmatter 的 `context: fork` 字段，源码 `SkillTool.ts:executeForkedSkill`。skill 会在一个继承父 context 但独立 token budget 的 forked subagent 里跑——skill 级的 context 隔离。
- **Hooks_Dispatcher**：统一的 hook 入口脚本，根据 stdin 的 `hook_event_name` 分派逻辑；配 `hooks-config.json` 做开关，`hooks-config.local.json` 做个人覆盖。Claude Code 源码支持 **27 个 hook 事件**（`src/entrypoints/sdk/coreTypes.ts:HOOK_EVENTS`）和 **4 种 hook 类型**（`src/schemas/hooks.ts`：`command` / `prompt` / `agent` / `http`），以及 `if: "Bash(git *)"` 条件预过滤。
- **Agent_Memory_Project_Scope**：`memory: project` frontmatter（源码 `src/tools/AgentTool/agentMemory.ts`）——agent 自动获得 `.claude/agent-memory/<agentType>/` 目录，目录内 `MEMORY.md` 是索引（≤200 行，字节限 25K，双层截断），每条经验作为独立 `.md` 文件并按 `type: user|feedback|project|reference` 四类分类（源码 `src/memdir/memoryTypes.ts`）。
- **Settings_Local_Json**：`.claude/settings.local.json` 文件，git-ignored，用于个人覆盖团队共享的 `.claude/settings.json`。合并优先级（源码 `src/utils/settings/constants.ts:SETTING_SOURCES`）：`userSettings → projectSettings → localSettings → flagSettings → policySettings`——local 覆盖 project，但 flag 和 policy 可进一步覆盖 local。
- **CCBP**：claude-code-best-practice 仓库的简称。
- **CC_Source**：`ericshang98/claude-code-source` 仓库的简称（Claude Code 流出的 TypeScript 源码，用于验证 harness 层机制的真实行为）。

## Requirements

### Requirement 1: Command → Agent → Skill 三层编排升级（P0）

**User Story:** 作为 Forge 的使用者，我希望重活（plan / build / review / ship）在独立 context 中执行，避免污染主会话，也避免多步探索被主会话截短。

#### Acceptance Criteria

1. GIVEN Forge 当前 `forge-plan`、`forge-build`、`forge-review`、`forge-ship` 四个 skill 都运行在主 context，WHEN 本需求完成后，THEN 这四个 skill 被升级为对应的 agent（`.claude/agents/<name>.md`），每个 agent 有独立 context 窗口，且原 skill 的行为语义（输入、输出、证据链、Restatement）不变。

2. GIVEN 升级后的 agent，WHEN agent 定义完成后，THEN 每个 agent 都包含以下必需 frontmatter 字段（**字段名必须与 Claude Code 源码 `loadAgentsDir.ts` 的 Zod schema 对齐**）：
   - `name`：agent 类型名
   - `description`：描述与触发时机（建议含 "PROACTIVELY" 以利自动选择）
   - `tools`：工具白名单数组（**字段名是 `tools`，不是 `allowedTools`**）
   - `model`：`sonnet` / `opus` / `haiku` / `inherit` 其一
   - `maxTurns`：最大轮数（正整数）
   - `memory: project`：使用项目级 agent memory
   - `color`：显示色
   可选字段：`permissionMode`（`default` / `plan` / `acceptEdits` / `bypassPermissions` / `dontAsk`）、`disallowedTools`（黑名单）、`effort`、`background`、`isolation`、`requiredMcpServers`。

3. GIVEN `forge-router`、`forge-status`、`forge-resume`、`forge-abort`、`forge-spec`、`forge-learn`、`forge-debug`、`forge-loop`、`forge-test`、`forge-refactor`、`forge-fix`，WHEN 本需求完成后，THEN 这些 skill **保持 skill 形态**，因为它们要么是轻量判断（router、status），要么需要主会话的上下文（spec、learn）。`forge-decide` 单列：它既有决策分析也需要主会话历史，保持 skill 形态，但在 Req 3 AC7 引入的 `context: fork` 机制成熟后可考虑切换为 fork-skill。

4. GIVEN `/forge <子命令>` 的调用链，WHEN 子命令指向一个已升级为 agent 的目标时，THEN `forge` 命令通过 `Agent` 工具调用，**调用签名为 `Agent(subagent_type: "forge-plan", description: "...", prompt: "...")` ——`subagent_type` 是必填参数**（源码 `AgentTool/prompt.ts`），不能省略（省略触发 fork 分支，行为语义不同）。

5. GIVEN 升级后的每个 agent，WHEN agent 首次被调用时，THEN agent 从 `.claude/agent-memory/<agent-name>/MEMORY.md`（`memory: project` 作用域）加载项目级记忆（若文件存在）。**加载采用双层截断**（源码 `memdir/memdir.ts:33` + `truncateEntrypointContent`）：先按行限制（`MAX_ENTRYPOINT_LINES = 200`），再按字节限制（`MAX_ENTRYPOINT_BYTES = 25_000`），末尾追加截断警告说明哪个上限触发。

6. GIVEN `forge-build` 或其它需要 spawn subagent 的 agent，WHEN 定义其 `tools` 白名单时，THEN 必须在白名单里**显式包含 `Agent`**——源码 `CUSTOM_AGENT_DISALLOWED_TOOLS` 默认对 custom agent 禁用 `AgentTool`（`constants/tools.ts`），不显式列出就会静默失败。

7. GIVEN 升级完成后，WHEN 运行现有的 `test/contract.test.ts` 和 `test/contract.skills.test.ts`，THEN 所有 contract test 必须继续通过（因为 skill 文件被迁移为 agent 文件，contract test 需要同步更新检查路径）。

### Requirement 2: Execution Contract 与工具白名单（P0）

**User Story:** 作为 Forge 的使用者，我希望关键 agent/skill 在 harness 层就被约束住行为边界，prompt 里的"请不要 X"不再只是建议，而且能在运行时通过 hook 强制 fail-closed。

#### Acceptance Criteria

1. GIVEN `forge-build` agent，WHEN 本需求完成后，THEN 该 agent 的开头（在 `# Agent Name` 标题后）包含一个 `## Execution Contract (non-negotiable)` 段落，段落中明确列出：必须通过 Subagent + TDD 完成实现、禁止在未写测试前写实现代码、禁止跳过原子提交、禁止自行绕过前置门禁。

2. GIVEN `forge-build` agent 的工具白名单，WHEN 本需求完成后，THEN `tools` 字段严格限定为执行任务所需的最小集合：`Read`、`Write`、`Edit`、`Glob`、`Grep`、`Bash`、`Skill`、`Agent`、`TodoWrite`、`ToolSearch`、`EnterWorktree`、`ExitWorktree`，**不**包含 `WebFetch` 和 `WebSearch`（避免在 build 阶段上网绕路）。`Agent` 必须显式包含（Req 1 AC6），否则无法在 build 阶段 spawn subagent。`NotebookEdit` 由是否实际使用 Jupyter 决定：若 Forge 无 notebook 工作流则省略。

3. GIVEN `forge-ship` agent，WHEN 本需求完成后，THEN 该 agent 同样包含 Execution Contract 段落，明确列出：必须验证 commit 已落盘、禁止绕过 CI 检查、禁止在未取得门禁放行前 push。

4. GIVEN `forge-review` agent，WHEN 本需求完成后，THEN Execution Contract 列出：禁止在未读完变更文件前出结论、禁止降级 P0/P1 严重度、禁止放行 Fail-closed 条件不满足的变更。

5. GIVEN 每个带 Execution Contract 的 agent，WHEN agent 执行遇到契约定义的禁止行为需求时，THEN agent 必须停止并向调用方报错，**不得**自行绕路或降级到非契约路径。实现上三层并用：
   - **Prompt 层**：Execution Contract 段落 + 工具白名单硬切工具可见性
   - **Per-turn 层**（可选，见 AC7）：`criticalSystemReminder` 字段每轮再注入
   - **运行时层**（可选，见 AC8）：`Stop` hook + `SyntheticOutputTool` 强制结构化退出

6. GIVEN `forge-plan` agent，WHEN 本需求完成后，THEN Execution Contract 列出：必须与用户对齐目标、禁止在未得到批准前进入 build。建议搭配 `permissionMode: plan` 把只读语义固化到 harness 层（plan 模式下 Write/Edit/Bash 写操作会被运行时拒绝）。

7. GIVEN 需要极强约束的 agent（如 `forge-ship`、`forge-verify` 若有），WHEN 本需求完成后，THEN agent 定义文件支持在 frontmatter 里（或在正文靠近末尾处）写入 `criticalSystemReminder` 字段/段落，内容 ≤200 字符，作为每轮用户 turn 都会重新注入的"防忘提醒"。**如果 Forge 自建 agent loader 尚不支持该字段**，退化方案是把同样的文本放在 Execution Contract 段落末尾 + `## Workflow` 开头各重复一次——没有 per-turn 再注入的强度，但同一个 prompt 内两次出现也能显著降低模型遗忘。

8. GIVEN `forge-verify`、`forge-ship` 等对输出格式有硬要求的 agent，WHEN 本需求完成后，THEN 设计文档描述如何用 `Stop` hook + `SyntheticOutputTool` 实现真正的运行时 fail-closed：
   - 在 agent 启动时通过 `registerStructuredOutputEnforcement` 注册一个 `Stop` 事件 function hook
   - hook 检查当前会话是否成功调用过 `SyntheticOutputTool`（或等价结构化输出工具）
   - 没调用就**阻塞会话结束**并返回"You MUST call the StructuredOutput tool to complete this request"
   - 结合 Zod/JSON schema 约束输出字段（例如 `forge-verify` 要求 `{verdict: "VERIFIED"|"NOT_VERIFIED"|"INCONCLUSIVE", evidence: [...]}`）
   本 AC 只要求在 design.md 记录机制并在 tasks 里给出至少 1 个示范 agent；完整铺开到所有 agent 留待下一个 spec。

### Requirement 3: Skill 渐进披露（Progressive Disclosure）文件结构（P0）

**User Story:** 作为 Forge 的使用者，我希望每次 skill 被加载时只拿到必要的入口指令，详尽的模板和范例在需要时才被模型读取；进一步地，不相关场景的 skill 根本不应该进入 context。

#### Acceptance Criteria

1. GIVEN 当前超过 150 行（或 6K 字符）的 SKILL.md 文件，WHEN 本需求完成后，THEN 该 skill 被拆分为至少两个文件：`SKILL.md`（入口 ≤150 行）+ `reference.md`（规范 / 模板 / 表格）；若示例较多，再额外拆出 `examples.md`。

2. GIVEN 拆分后的 `SKILL.md`，WHEN 拆分完成后，THEN 在 `## Additional resources` 或等价章节中以 markdown 相对链接引用附属文件：`[reference.md](reference.md)`、`[examples.md](examples.md)`。

3. GIVEN 拆分操作，WHEN 操作执行时，THEN **不允许**删除任何既有的行为指令，只能是"把模板 / 表格 / 范例从 SKILL.md 搬到附属文件，并在 SKILL.md 留下引用"。拆分后总字符数不应显著增加。

4. GIVEN 本 spec 与已有的 `skill-document-optimization` spec 的关系，WHEN 两个 spec 都执行后，THEN 先应用 `skill-document-optimization` 的压缩策略（Canonical Example、Reference Directive 等），再应用本 spec 的拆分策略。如果某个 skill 在压缩后 ≤150 行，则**不拆分**。

5. GIVEN 拆分后的 skill，WHEN 运行 contract test，THEN contract test 必须识别 `SKILL.md` + 可选 `reference.md` + 可选 `examples.md` 的结构，原有的关键词检查（frontmatter 字段、必需章节）仍在 `SKILL.md` 上生效。

6. GIVEN 仅在特定路径工作时才相关的 skill（如 `forge-verify` 只在有 `src/` 或 `test/` 改动时才该登场），WHEN 本需求完成后，THEN 该 skill 的 frontmatter 支持 `paths:` 字段（YAML list），未匹配当前 touch 路径的 skill 完全不进 context。格式与 Req 5 的 rule `paths:` 一致：gitignore 语义、支持 brace 展开 `{ts,tsx}`、`/**` 后缀会被加载器剥掉、全 `**` 视为无条件加载。源码实现参考 `src/skills/loadSkillsDir.ts:156–178` 的 `parseSkillPaths` 和 `activateConditionalSkillsForPaths`。
   本 AC 要求至少为 `forge-verify`、`forge-fix-conflicts`、`forge-test` 三个 skill 补上 `paths:` 声明；其它 skill 的迁移留到后续 spec。

7. GIVEN 可以完全自足运行、不需要主会话历史反复干预的 skill（如 `forge-grill`、`forge-storm`、`forge-debug` 的重活路径），WHEN 本需求完成后，THEN 该 skill 的 frontmatter 支持 `context: fork` 字段，skill 被调用时会在一个**继承父 context 但拥有独立 token budget 的 forked subagent** 里跑（源码 `SkillTool.ts:executeForkedSkill`）。与 Req 1 的 agent 升级相比，`context: fork` 保留 skill 的轻量文件结构，只做执行隔离。
   本 AC 要求设计文档列出至少 2 个候选 skill 并评估隔离收益；实际开启 `context: fork` 的 skill 至少 1 个。

### Requirement 4: CLAUDE.md 瘦身与每文件提交规则（P0）

**User Story:** 作为 Forge 的使用者，我希望根 CLAUDE.md 保持在 200 行以内以提高模型遵从度，并且 git 历史可按文件回退/审查。

#### Acceptance Criteria

1. GIVEN Forge 根目录的 `CLAUDE.md`，WHEN 本需求完成后，THEN 该文件行数 ≤200 行。**选择 200 行而非 Claude Code 源码的 `MAX_MEMORY_CHARACTER_COUNT = 40000`（约 800 行）上限，是因为 CLAUDE.md 每轮都加载且进 prompt cache**——更严格能降低 cache_creation token，并让规则密度更高。需要先做现状测量再做裁剪。

2. GIVEN CLAUDE.md 瘦身过程，WHEN 需要裁剪内容时，THEN 被移出的内容必须迁移到以下其中之一：`.claude/rules/<topic>.md`（带 `paths:` frontmatter 做懒加载）、`.forge/docs/living/<topic>.md`（长文档）、对应 skill 的 `reference.md`（领域规范）。**不允许**直接删除任何现有规则。

3. GIVEN CLAUDE.md，WHEN 本需求完成后，THEN 文件顶部通过 **Claude Code 的 `@path/to/file.md` 语法**（源码 `src/utils/claudemd.ts:18–26`）引用 5–8 个最常用的附属规则文件，保留全局高概念规则（TDD 铁律、验证铁律、路径结构、分支保护）作为主体。
   - 语法：`@path`、`@./relative/path`、`@~/home/path`、或 `@/absolute/path`；无前缀等同于 `@./path`
   - **只在 leaf text node 里生效**（代码块内的 `@path` 不会被识别）
   - 被 include 的文件作为独立条目插在 including 文件之前
   - 循环引用自动检测；不存在的文件静默忽略
   - **注意**：Kiro 的 `#[[file:<path>]]` 语法是另一套系统，**在 Claude Code 会话中不生效**——本 spec 使用 Claude Code 的 `@path` 语法

4. GIVEN CLAUDE.md 的"Git Commit Rules"章节，WHEN 本需求完成后，THEN 增加一条规则："除非明确要求批量提交，否则**每个文件一次提交**（separate commit per file），每条 commit message 针对该文件的改动具体描述"。配合保留 Claude Code 源码 `commands/commit.ts` 里的三条硬约束：`NEVER skip hooks`、`NEVER --amend`（除非明示）、`never commit secrets`。

5. GIVEN `forge-ship` agent 的 Execution Contract，WHEN 本需求完成后，THEN 契约中补充："遵循 CLAUDE.md 的每文件提交规则（每次 `git add <single-file>` + `git commit`），除非用户显式请求批量提交"。

### Requirement 5: 懒加载 rules 基础设施（P1 — 本 spec 设计，下一 spec 执行）

**User Story:** 作为 Forge 的使用者，我希望只对特定路径相关的团队规范在触发时才进入上下文，不相关的会话根本看不到它们。

#### Acceptance Criteria

1. GIVEN Forge 当前不存在 `.claude/rules/` 目录，WHEN 本需求的设计完成后，THEN 设计文档明确列出至少 3 条首批迁移的懒加载规则候选（例如：编辑 `.forge/specs/**` 前必须先检查分支保护；编辑 `forge/src/**` 必须遵循 TypeScript 风格；编辑 `skills/**/SKILL.md` 必须保留必需 frontmatter）。

2. GIVEN 每条懒加载规则，WHEN 设计文档落地时，THEN 规则文件必须包含以下格式的 YAML frontmatter（源码实现参考 `src/utils/claudemd.ts:250–280` + `processConditionedMdRules`）：
   ```yaml
   ---
   paths:
     - "<glob-pattern>"
     - "<another-glob>"
   ---
   ```
   格式约束：
   - **键名是 `paths`**（小写复数；不是 `globs` / `pathMatch`）
   - 值为字符串或数组；字符串可用 brace 展开（如 `"src/*.{ts,tsx}"`）
   - 支持 brace 交叉展开（`"{a,b}/{c,d}"` → `["a/c","a/d","b/c","b/d"]`）
   - `/**` 后缀会被加载器剥掉（`ignore()` 库把 path 本身和内部都当匹配）
   - 全 `**` 视为"无 paths"——当无条件规则加载
   - 匹配路径**相对于包含 `.claude` 的目录**（Project 规则）或 cwd（User/Managed 规则）
   - 使用 `ignore()` 库做 gitignore 语义匹配（自动处理否定、注释等）

3. GIVEN `.claude/rules/` 的本 spec 设计，WHEN 设计完成后，THEN 设计文档引用 `ccbp-reference/.claude/rules/presentation.md` 和源码 `src/utils/claudemd.ts:1354–1402` 的 `processConditionedMdRules` 作为参考格式，并说明迁移来源（从 CLAUDE.md 或 `.forge/features/` 的哪一部分搬来）。

4. GIVEN 本 spec 只做**设计**，WHEN tasks 执行到 P1 的懒加载规则基础设施时，THEN 仅交付设计文档 + 至少 1 个示例规则文件（`.claude/rules/spec-editing.md`），完整迁移留到后续 spec。

5. GIVEN 本 spec 的任务粒度边界，WHEN tasks 被拆出时，THEN P1 部分被明确标注为"设计 + 最小示例"，不做全量迁移。

### Requirement 6: Hooks Dispatcher 基础设施（P1 — 本 spec 设计，下一 spec 执行）

**User Story:** 作为 Forge 的维护者，我希望把 `settings.json` 里散落的 bash 内联命令收拢到单一脚本入口，后续加新钩子只改脚本不改 `settings.json`；并充分利用 Claude Code 的 27 种事件和 4 种 hook 类型。

#### Acceptance Criteria

1. GIVEN Forge 当前 `.claude/settings.json` 中的 hooks 字段使用裸 bash 内联命令（现有 6 类事件：SessionStart、UserPromptSubmit、PreToolUse、PostToolUse、Stop、TeammateIdle），WHEN 本需求的设计完成后，THEN 设计文档明确给出 `hooks-dispatcher.sh`（或 `.ts`）的职责划分、输入输出约定、错误处理策略。设计文档必须列出 Claude Code 支持的 **全部 27 个 hook 事件**（源码 `src/entrypoints/sdk/coreTypes.ts:HOOK_EVENTS`），并标注哪些对 Forge 尤为相关：
   - **高价值候选**（建议后续迁移优先纳入 dispatcher）：`PreCompact`/`PostCompact`（compact 前后做状态保护/清理）、`InstructionsLoaded`（CLAUDE.md 或 rule 加载时审计触发路径）、`FileChanged`（文件变动自动联动 progress）、`TaskCreated`/`TaskCompleted`（任务队列审计）
   - **已使用**（保留现状）：`SessionStart`、`UserPromptSubmit`、`PreToolUse`、`PostToolUse`、`Stop`、`TeammateIdle`
   - **其它可选**（按需）：`SessionEnd`、`StopFailure`、`SubagentStart`/`SubagentStop`、`PermissionRequest`/`PermissionDenied`、`Setup`、`Elicitation`/`ElicitationResult`、`ConfigChange`、`WorktreeCreate`/`WorktreeRemove`、`CwdChanged`、`Notification`、`PostToolUseFailure`

2. GIVEN hooks dispatcher 脚本，WHEN 设计完成后，THEN 脚本必须满足：
   - 从 stdin 读取 JSON
   - 按 `hook_event_name` 分派到具体处理函数
   - **正确使用 exit code 作为信号**（源码 `src/utils/hooks/hooksConfigManager.ts`）：`exit 0` 表示通过；**`exit 2` 表示阻塞**（PreToolUse 阻塞工具调用、Stop 阻塞会话结束、UserPromptSubmit 抹掉 prompt 等——每个事件的 exit code 语义略不同，必须按源码表格实现）；其他 exit code 把 stderr 显示给用户但继续执行
   - 捕获所有异常并按事件语义返回合适的 exit code（不是无脑 `exit 0`）
   - 支持 `--agent=<name>` 参数

3. GIVEN hooks 类型多样化，WHEN 设计完成后，THEN dispatcher 设计需要考虑 Claude Code 支持的 **4 种 hook 类型**（源码 `src/schemas/hooks.ts`）：
   - `command`：bash 命令（支持 `timeout`、`async`、`asyncRewake` 在后台阻塞错误时唤醒模型、`once`、`shell: bash|powershell|pwsh`）
   - `prompt`：LLM 评估条件（用 `$ARGUMENTS` 占位；指定 `model`，默认 Haiku）
   - `agent`：agentic verifier（跑一个小 agent 做验证；常用于 PostToolUse 后核查）
   - `http`：POST JSON 到 URL（支持 `headers`、`allowedEnvVars` 环境变量白名单插值、URL validation）
   本 spec 骨架优先实现 `command` 类型；设计文档说明未来如何扩展到另外 3 种。

4. GIVEN hooks 配置分离，WHEN 设计完成后，THEN 推荐做法是**复用 Claude Code 已有的 settings 分层**：团队共享规则放在 `.claude/settings.json` 的 `hooks` 字段；个人覆盖放在 `.claude/settings.local.json`（Req 8 引入）。**仅在新增 Forge 专属开关（例如 `disableSpecificDispatcherBranch: true`）时才引入独立的 `hooks-config.json`**——避免给团队造成"两套配置文件"的认知负担。
   若 tasks 仍决定用独立 json 配置，必须在 HOOKS-README.md 里明确说明为何不直接用 settings 分层。

5. GIVEN 配置文件的格式，WHEN 设计完成后，THEN 每个 hook 事件支持一个 `disable<EventName>Hook: boolean` 字段，dispatcher 在处理前查这两个配置（local 优先）决定是否执行。

6. GIVEN 本 spec 只做**设计**，WHEN tasks 执行到 P1 的 hooks dispatcher 基础设施时，THEN 仅交付：设计文档 + `.claude/hooks/scripts/dispatcher.sh` 骨架（至少支持 SessionStart 和 UserPromptSubmit 两个事件的迁移）+ 配置文件示例 + HOOKS-README。完整 6 类事件迁移留到后续 spec。

7. GIVEN hook 应避免在不相关 tool 调用上空跑，WHEN 设计完成后，THEN dispatcher 骨架**支持 `if:` 条件预过滤**（源码 `src/schemas/hooks.ts:IfConditionSchema`）。格式：`if: "Bash(git *)"`（permission-rule 语法），只有匹配的 tool 调用才 spawn dispatcher 处理函数；其它直接跳过。**这一条是 Claude Code 官方推荐的性能优化**，避免每次 Bash 都 spawn dispatcher 进程。

### Requirement 7: Agent Learnings 自我进化（P1）

**User Story:** 作为 Forge 的维护者，我希望每个 agent 在每次执行后能沉淀经验，让 agent 的自我知识库随使用累积；并且该机制与 Req 1 AC5 的 `memory: project` 共用同一物理目录，避免"两套记忆"混乱。

#### Acceptance Criteria

1. GIVEN Requirement 1 升级完成的四个 agent（`forge-plan`、`forge-build`、`forge-review`、`forge-ship`），WHEN 本需求完成后，THEN 每个 agent 的 Learnings **物理上存储在 `.claude/agent-memory/<agent-name>/` 目录**（即 Req 1 AC5 的 `memory: project` 作用域，源码 `src/tools/AgentTool/agentMemory.ts`），不是 inline 在 agent 定义文件里。理由：
   - agent 定义文件保持稳定，不会因为追加 learning 被频繁改动
   - learning 能按 type 独立审查和归档
   - 和 `memory: project` 零冲突，共用物理目录
   - git diff 更清晰（经验变化独立文件）

2. GIVEN `.claude/agent-memory/<agent-name>/` 目录结构，WHEN 本需求完成后，THEN 每个 agent 目录按 Claude Code 的 **四类记忆分类**（源码 `src/memdir/memoryTypes.ts:MEMORY_TYPES`）组织：
   - **`user`**：关于用户角色、偏好、技能深浅的信息（例：`user_role.md`）
   - **`feedback`**：用户纠正或确认的做法（例：`feedback_no_batch_commits.md`）。body 必须含 `Rule` + `**Why**:` + `**How to apply**:` 三段
   - **`project`**：项目动态状态，如截止日期、flaky 测试列表（例：`project_flaky_tests.md`）
   - **`reference`**：外部系统的指针（例：`reference_forge_changelog.md`）
   每个 learning 文件带 frontmatter：`type: user|feedback|project|reference`。

3. GIVEN 每个 agent 目录有 `MEMORY.md` 索引文件，WHEN 索引生成时，THEN `MEMORY.md` **只是索引，不存内容**（源码 `memdir.ts:ENTRYPOINT_NAME`），每条 ≤150 字符，格式 `- [Title](file.md) — one-line hook`。受双层截断保护：行 ≤200，字节 ≤25K（源码 `MAX_ENTRYPOINT_LINES` / `MAX_ENTRYPOINT_BYTES`）。

4. GIVEN agent 的 workflow 指令，WHEN 本需求完成后，THEN 每个升级后的 agent 在 Workflow 的"执行完成"步骤追加一条指令："若本次执行过程中发现了新的约定、边界情况或值得记录的工程决策，按 `.claude/agent-memory/<agent-name>/` 下对应 type 规范追加/更新 `.md` 文件，并在 `MEMORY.md` 补索引行。"
   指令还应列出 Claude Code 的 **不该存清单**（源码 `WHAT_NOT_TO_SAVE_SECTION`）：
   - 代码模式 / 架构 / 文件路径 / 项目结构——可从当前项目状态推导
   - Git 历史 / 最近变更 / 谁改了什么——`git log` / `git blame` 权威
   - 调试解决方案 / fix 食谱——修复在代码里、commit message 有上下文
   - 已在 CLAUDE.md 里的内容
   - 瞬时任务细节：进行中的工作、临时状态、当前会话上下文

5. GIVEN learning 文件的 body 格式，WHEN 格式规定时，THEN：
   - `feedback` type 条目：`Rule` + `**Why**:`（用户给的原因，常是历史事故或强烈偏好）+ `**How to apply**:`（何时在何处该规则生效）三段结构，便于 agent 在边界情况判断而不是机械套用
   - 所有 type 都**把相对日期转成绝对日期**（例："Thursday" → "2026-03-05"），源码 `memoryTypes.ts` 的 when_to_save 明确要求
   - team scope 的 learning 禁写 API keys / user credentials
   - 既记失败也记成功（`Record from failure AND success`）——只记 correction 会让 agent 越来越谨慎
   - 保持每条条目简洁（≤3 行）

6. GIVEN `MEMORY.md` 段落长度控制，WHEN 索引超过 200 行或 25K 字节时，THEN agent 的 workflow 必须包含"归档旧条目"步骤：把超过 3 个月的 learning 文件批量迁移到 `.claude/agent-memory/<agent-name>/archive/`，同步从 `MEMORY.md` 删除索引项。

### Requirement 8: settings.local.json 分离（P0 支持层）

**User Story:** 作为 Forge 的使用者，我希望团队共享的 Claude Code 设置和个人偏好分离，避免个人改动污染团队配置。

#### Acceptance Criteria

1. GIVEN Forge 当前 `.claude/settings.json` 同时包含团队共享配置和可能的个人偏好，WHEN 本需求完成后，THEN 项目根 `.gitignore` 包含一行：`.claude/settings.local.json`。

2. GIVEN CLAUDE.md 或 README，WHEN 本需求完成后，THEN 文档中新增一节"个人配置覆盖"，说明：
   - 个人偏好（spinner verbs、output style、额外的 allow/ask 权限）应写入 `.claude/settings.local.json`
   - 该文件**优先级高于** `.claude/settings.json`，且不被 git 追踪
   - **注意合并顺序**（源码 `src/utils/settings/constants.ts:SETTING_SOURCES`）：`userSettings → projectSettings → localSettings → flagSettings → policySettings`。local 覆盖 project，但 flag（命令行 `--settings`）和 policy（企业托管配置）还能进一步覆盖 local——**local 不是最高优先级**。

3. GIVEN 本需求不要求迁移任何现有配置，WHEN 本需求完成后，THEN 只交付：`.gitignore` 更新 + 文档章节 + 一个 `.claude/settings.local.json.example` 示例文件。

4. GIVEN `.claude/settings.local.json.example`，WHEN 示例文件创建时，THEN 示例包含典型的个人覆盖项：`spinnerVerbs`、`outputStyle`、额外的 `permissions.allow` 项。

### Requirement 9: 验证通道与 Session 管理提示（P2 — 本 spec 仅记录）

**User Story:** 作为 Forge 的使用者，我希望在文档中看到"如何给 Claude 提供验证通道"和"五选一 session 管理"的官方模式，以便按需采用。

#### Acceptance Criteria

1. GIVEN 本 spec 记录 P2 模式，WHEN 设计文档完成后，THEN 设计文档包含一节"P2 — 延后的模式"，列出两项：验证通道（前端：Playwright/Chrome MCP；后端：Claude 自启服务；桌面：Computer Use）+ Session 五选一（Continue / Rewind / Compact / Clear / Subagent 的决策表）。

2. GIVEN P2 部分的交付形态，WHEN tasks 执行到 P2 时，THEN **不**新增任何 skill/agent/hook 代码，只在 `.forge/docs/living/` 下新增一份参考文档：`.forge/docs/living/ccbp-patterns-p2.md`，引用 CCBP 中的对应章节 + Claude Code 源码 `src/tools/AgentTool/built-in/verificationAgent.ts` 的 change-type playbook。

3. GIVEN P2 文档内容，WHEN 文档落地时，THEN 验证通道一节可以**较详细**（最多 50 行，按 change-type 分小节：Frontend / Backend / CLI / Infra / Library / Bug-fix / Mobile / Data pipeline / DB migration / Refactoring——对齐源码 verificationAgent 的分类），因为 Claude Code 自己就花了几百行讲这个、简化得太死会丢语义；Session 五选一一节保持精简（≤20 行，决策表为主），可直接引用源码 `coordinator/coordinatorMode.ts:260–290` 的 continue vs spawn 决策表。

### Requirement 10: 契约测试与迁移验证

**User Story:** 作为 Forge 的维护者，我希望所有改造都在 contract test 的保护下进行，迁移过程不破坏既有行为。

#### Acceptance Criteria

1. GIVEN Requirement 1 的 skill → agent 升级，WHEN 升级完成后，THEN `test/contract.test.ts` 或 `test/contract.skills.test.ts` 被更新以识别 `.claude/agents/<name>.md` 和 `.claude/skills/<name>/SKILL.md` 两种形态，原有的关键词 / 必需章节检查在新位置继续生效。

2. GIVEN Requirement 3 的 skill 拆分 + `paths:` / `context: fork` 新字段，WHEN 拆分完成后，THEN contract test 必须验证：
   - `SKILL.md` 存在 + 必需 frontmatter + 引用的 `reference.md` / `examples.md` 文件存在且路径正确
   - `paths:` 字段若存在，值是字符串或 string[]（不接受其他类型）；每个 pattern 非空字符串；警告全 `**` 的情况（会被 ignore 库当成匹配所有）
   - `context: fork` 字段若存在，值是字面量 `"fork"` 或 `"inline"`（源码只认这两个值）

3. GIVEN agent vs skill 的字段名差异，WHEN 测试编写时，THEN **必须分别处理两种字段名**（源码差异不可混用）：
   - agent frontmatter 用 **`tools`**（数组）和 **`disallowedTools`**（数组），不接受 `allowedTools`
   - skill frontmatter 用 **`allowed-tools`**（注意连字符；源码 `loadSkillsDir.ts:parseSkillFrontmatterFields`）
   contract test 要在两个位置分别校验。

4. GIVEN 任一 requirement 的实施，WHEN 实施完成后，THEN 运行 `npx vitest run` 全部通过；运行 `npm run check`（若存在）全部通过；运行 `npm run build`（若存在）全部通过。

5. GIVEN 每个 requirement 完成后的 checkpoint，WHEN checkpoint 执行时，THEN 必须验证：所有受影响文件的 YAML frontmatter 未被破坏、所有 markdown 相对链接未失效、所有 bash script 执行权限未丢失、`@path` 引用指向存在的文件。

6. GIVEN 本 spec 引入了 `.claude/agents/` 下的新文件和可能的 `.claude/rules/`、`.claude/hooks/` 基础设施，WHEN `npm run check` 的 markdown linter 存在时，THEN 新文件必须通过 linter。

### Requirement 11: 源码验证后新增的 Claude Code 能力（P0/P1 混合）

**User Story:** 作为 Forge 的维护者，我希望把 Claude Code 源码里已经实现但之前版本 spec 没提到的 5 项能力补进本次改造，让 agent/skill 控制的精细度拉满。

#### Acceptance Criteria

1. GIVEN 破坏性 skill（如 `forge-ship`、`forge-pack`、`forge-abort`）不应该被模型误触发，WHEN 本需求完成后，THEN 这些 skill 的 frontmatter 加上 `disable-model-invocation: true`（源码 `loadSkillsDir.ts:parseSkillFrontmatterFields`，`bundled/batch.ts` 和 `bundled/skillify.ts` 的实战用法）——模型只能在用户明确调用 `/forge ship` 时才能触发，但不能"主动决定去 ship"。
   另外对 `forge-grill`、`forge-storm` 等探索类 skill，考虑加 `user-invocable: false`（默认 `true`）来把它们变成纯模型 skill（不出现在用户的 `/` 补全里），减少用户误触。本 AC 至少交付 3 个 skill 的 frontmatter 调整。

2. GIVEN Forge 如果有依赖可选 MCP 服务器的 agent（例如 bitbucket / jira / confluence 集成），WHEN 本需求完成后，THEN 这些 agent 的 frontmatter 使用 `requiredMcpServers: [<server-name-pattern>]`（源码 `loadAgentsDir.ts:hasRequiredMcpServers`）。agent 只在对应 MCP server 连接成功时出现在 `subagent_type` 列表里；未连接时自动隐藏，避免调用后失败。
   模式匹配规则：大小写不敏感，`includes` 子串匹配。
   本 AC 若 Forge 没有依赖 MCP 的 agent，退化为设计文档记录该能力 + 未来使用注意事项。

3. GIVEN `forge-plan` 和 `forge-review` 要做深度思考，WHEN 本需求完成后，THEN 这两个 agent 的 frontmatter 加上 `effort: high`（源码 `loadAgentsDir.ts` + `EFFORT_LEVELS`）。取值是 `EFFORT_LEVELS` 枚举值之一（`low`/`medium`/`high`/...）或正整数。这直接影响模型的 thinking budget 分配。

4. GIVEN `forge-verify` 对输出格式有硬约束（三态 VERIFIED/NOT_VERIFIED/INCONCLUSIVE），WHEN 本需求完成后，THEN 在 `forge-verify` 的 skill/agent 上引入 **`Stop` hook + `SyntheticOutputTool`** 运行时 fail-closed（Req 2 AC8 的具体化落地）：
   - 启动时调用 `registerStructuredOutputEnforcement`（源码 `src/utils/hooks/hookHelpers.ts`）
   - 提供 JSON schema：`{ verdict: enum('VERIFIED','NOT_VERIFIED','INCONCLUSIVE'), evidence: array }`
   - Hook 在 `Stop` 事件检查 `SyntheticOutputTool` 是否被调用过；没调用就阻塞会话结束
   - 这把"verify 必须以三态 verdict 结束"从 prompt 约束升级为运行时硬闭环
   本 AC 只要求在一个 agent/skill 上示范完整机制；其他 agent 的运行时 fail-closed 留到后续 spec。

5. GIVEN agent 的 Execution Contract 需要每轮再注入（Req 2 AC7），WHEN 本需求完成后，THEN 设计文档选择并实现其中一种方案：
   - **方案 A**（推荐，需要 Forge 自建 agent loader）：扩展 agent frontmatter，新增 `criticalSystemReminder` 字段，agent loader 在每个用户 turn 把该字段内容以 `<system-reminder>` 形式再注入到 prompt
   - **方案 B**（不改 loader 的退化实现）：在 agent 的 prompt body 里把 Execution Contract 的核心禁令在两个位置重复写出（`# Agent Name` 下紧接一次 + `## Workflow` 开头再来一次）。没有 per-turn 再注入的严格度，但同 prompt 内二次出现会显著降低模型遗忘
   本 AC 只要求 `forge-verify` / `forge-ship` 两个对契约强度要求最高的 agent 示范方案 A 或 B；其余 agent 使用 Req 2 AC5 的基础 Execution Contract 即可。
