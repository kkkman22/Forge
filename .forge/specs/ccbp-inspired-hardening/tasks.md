---
feature: ccbp-inspired-hardening
layout: tasks
created: 2026-05-12
spec_ref: ".forge/specs/ccbp-inspired-hardening/requirements.md"
---

# Implementation Plan

## Overview

按 design.md 的 harness 层 / prompt 层正交分组推进。Harness 层改动一次性落地影响面大但独立性强（Task 1–5），prompt 层改动逐 agent/skill 渐进（Task 6–10）；Task 11 是 源码补遗能力（`disable-model-invocation` / `paths:` / `context: fork` / `Stop` hook 等）；Task 12 做 contract test 收尾；Task 13 做烟雾验证与清理。每个 Task 对应 design 中一条模式，内部再拆为原子子任务。每个子任务挂 `_Requirements: X.Y_` 交叉引用。

所有改动在现有 contract test 保护下进行。

---

## Task 1: settings.local.json 分离（P0 零风险预热）

- [x] 1.1 追加 `.gitignore` 条目：`.claude/settings.local.json` 与 `.claude/hooks/config/hooks-config.local.json`，放在现有 `.claude/` 相关段落中
  - 验证 `git check-ignore .claude/settings.local.json` 返回路径（表示成功被忽略）
  - _Requirements: 8.1_

- [x] 1.2 创建 `.claude/settings.local.json.example`，内容包含 design.md §8 给出的示例片段（spinnerVerbs、outputStyle、permissions.allow 占位）
  - 文件首行为 JSON 注释（`// 个人配置覆盖示例 ...`），声明使用方式与优先级
  - **必须明确标注合并优先级**：`local < flag < policy`（不是最高优先级）
  - _Requirements: 8.2, 8.3, 8.4_

- [x] 1.3 在 CLAUDE.md 追加一小节 `## 个人配置覆盖`（约 10 行），说明：
  - `.claude/settings.local.json` 优先级**高于** `.claude/settings.json`，**但低于** `flagSettings` 和 `policySettings`
  - 合并顺序表：`userSettings → projectSettings → localSettings → flagSettings → policySettings`（源码 `src/utils/settings/constants.ts:SETTING_SOURCES`）
  - git-ignored、典型用法（复制 example 文件后按需修改）
  - 该小节位置紧跟现有的"设置层级"或"Settings"相关章节；若无则挂在 CLAUDE.md 结尾前
  - _Requirements: 8.2_

- [x] 1.4 Checkpoint：运行 `npx vitest run`，全部通过；`git status` 中 `.claude/settings.local.json`（若创建）不出现在 tracked files
  - _Requirements: 10.4, 10.5_

---

## Task 2: skill → agent 迁移（P0 核心结构变更）

> 按 design.md Target State Blueprint 的"Agent 文件骨架"和"Skill stub"模板落地 4 个 agent；`forge.md` 同步改动。**字段名严格对齐 Claude Code 源码**：agent 用 `tools`（不是 `allowedTools`）；skill 用 `allowed-tools`（连字符）。

- [x] 2.1 创建 `.claude/agents/forge-plan.md`
  - frontmatter 必填字段：`name`、`description`（含 "PROACTIVELY"）、`tools`（不是 allowedTools）、`model`（inherit 或 sonnet）、`maxTurns: 30`、`permissionMode: plan`、`memory: project`、`color: cyan`
  - `tools` 白名单：`[Read, Glob, Grep, Bash, Skill, AskUserQuestion]`
  - 可选：`effort: high`（Req 11.3）
  - Body 从 `.claude/skills/forge-plan/SKILL.md` 完整迁移，保持 Workflow、输出格式、证据链等所有行为指令不变
  - **不要**把 `## Learnings` 段落放在 agent 定义文件内——经验迁入 `.claude/agent-memory/forge-plan/`（见 Task 8）
  - _Requirements: 1.1, 1.2, 1.5, 11.3_

- [x] 2.2 创建 `.claude/agents/forge-build.md`
  - frontmatter：`name`、`description`（PROACTIVELY）、`tools: [Read, Write, Edit, Glob, Grep, Bash, Skill, Agent, TodoWrite, ToolSearch, EnterWorktree, ExitWorktree]`、`model: sonnet`、`maxTurns: 50`、`permissionMode: acceptEdits`、`memory: project`、`color: blue`
  - **`tools` 字段必须显式含 `Agent`**——否则源码 `CUSTOM_AGENT_DISALLOWED_TOOLS` 默认禁用 `AgentTool`，无法 spawn subagent
  - **`tools` 字段不含 `WebFetch` 和 `WebSearch`**——避免在 build 阶段上网绕路
  - `NotebookEdit` 省略（Forge 无 Notebook 工作流）
  - Body 从 `.claude/skills/forge-build/SKILL.md` 完整迁移
  - _Requirements: 1.1, 1.2, 1.5, 1.6, 2.2_

- [x] 2.3 创建 `.claude/agents/forge-review.md`
  - frontmatter：`name`、`description`（PROACTIVELY）、`tools: [Read, Glob, Grep, Bash, Skill, Agent]`（review 不写文件）、`model: sonnet`、`maxTurns: 40`、`permissionMode: default`、`memory: project`、`color: yellow`
  - 可选：`effort: high`（Req 11.3）
  - `Agent` 含在 `tools` 里用于并行子 review（Req 1.6）
  - Body 迁移
  - _Requirements: 1.1, 1.2, 1.5, 1.6, 11.3_

- [x] 2.4 创建 `.claude/agents/forge-ship.md`
  - frontmatter：`name`、`description`（PROACTIVELY）、`tools: [Read, Edit, Bash, Skill]`、`model: inherit`、`maxTurns: 20`、`permissionMode: acceptEdits`、`memory: project`、`color: green`
  - Body 迁移
  - _Requirements: 1.1, 1.2, 1.5_

- [x] 2.5 把 `.claude/skills/forge-plan/SKILL.md` 降级为 10 行 stub（按 design.md §1 的 stub 模板）
  - frontmatter 用 skill 字段名（**连字符**）：`disable-model-invocation: true` + `user-invocable: false`
  - _Requirements: 1.3_

- [x] 2.6 把 `.claude/skills/forge-build/SKILL.md`、`.claude/skills/forge-review/SKILL.md`、`.claude/skills/forge-ship/SKILL.md` 分别降级为 stub（同 2.5 的模板）
  - _Requirements: 1.3_

- [x] 2.7 改动 `.claude/commands/forge.md` 的子命令映射
  - 把 `plan`、`build`、`review`、`ship` 四行从"直接调用 `Skill(<name>)`"改为"通过 `Agent(subagent_type: "<name>", description: "...", prompt: "...")` 调用"
  - **`subagent_type` 必须是命名参数**——不是位置参数，不能省略（源码要求）
  - 保留 router 路由到这 4 个子命令的分支，同步更新为 Agent 调用
  - 其他 11 个子命令（router、status、resume、abort、decide、spec、learn、debug、loop、test、refactor、fix）**保持原 Skill 调用不变**
  - _Requirements: 1.3, 1.4_

- [x] 2.8 Checkpoint：运行 `npx vitest run test/contract.test.ts test/contract.skills.test.ts`——此时 contract test 可能因为查找 `.claude/skills/forge-build/SKILL.md` 仍然存在（stub 形态）而通过，但断言内容可能失败。记录失败条目作为 Task 12 的输入
  - _Requirements: 10.1_

---

## Task 3: Execution Contract 注入（P0 prompt 层，依赖 Task 2）

- [x] 3.1 在 `.claude/agents/forge-plan.md` 的 `# Forge Plan Agent` 标题后、`## Workflow` 前，插入 `## Execution Contract (non-negotiable)` 段落
  - MUST：与用户对齐目标后再产出 plan 文档；在 build 阶段开始前获得用户批准
  - Forbidden：在未获批准前进入 build；跳过 AskUserQuestion 阶段；自行将 plan 状态改为 approved
  - Fail-closed：若用户反馈不明确、plan 必填字段（目标/范围/验收标准）缺失，则停止并报告
  - 结尾一句："You are in `permissionMode: plan` — write operations will be denied by the runtime."
  - _Requirements: 2.1, 2.6_

- [x] 3.2 在 `.claude/agents/forge-build.md` 插入 `## Execution Contract`
  - MUST：通过 Subagent + TDD 完成每个实现任务；每个子任务原子提交；严格遵循 P5 证据链
  - Forbidden：未写测试就写实现；跳过前置门禁（spec locked + plan approved）；调用 WebFetch/WebSearch（不在 tools）；绕过 Restatement Checkpoint
  - Fail-closed：若测试未通过，禁止标记 progress 为已完成；若前置门禁不满足，禁止进入实现
  - 段落末尾加一句："Your `tools` allowlist intentionally excludes WebFetch/WebSearch — if you need them, stop and report."
  - _Requirements: 2.1, 2.2, 2.5_

- [x] 3.3 在 `.claude/agents/forge-review.md` 插入 `## Execution Contract`
  - MUST：读完所有变更文件后出结论；保留 P0/P1 严重度的原判定
  - Forbidden：在未通读变更文件前出结论；降级 P0/P1 严重度；放行 Fail-closed 条件不满足的变更
  - Fail-closed：若检测到 P0 级问题，必须阻断并报告
  - _Requirements: 2.4, 2.5_

- [x] 3.4 在 `.claude/agents/forge-ship.md` 插入 `## Execution Contract`
  - MUST：按每文件一次 commit（引用 CLAUDE.md 规则，见 Task 7.3）；push 前验证所有 commit 已落盘
  - Forbidden：批量提交（除非用户显式要求）；绕过 CI 检查；在评审门禁放行前 push；skip hooks（`--no-verify`）；`--amend`
  - Fail-closed：若 CI 失败、评审未放行、或任何 commit 未落盘，停止并报告
  - _Requirements: 2.3, 2.5, 4.5_

- [x] 3.5 对 `forge-ship` 启用 Req 2.7 的**方案 B**（prompt 内二次出现）
  - 在 `# Forge Ship Agent` 标题下紧跟一行 `**CRITICAL REMINDER**: commit file-by-file, never skip CI.`
  - 在 `## Workflow` 开头再重复一次 `**Reminder**: commit file-by-file, never skip CI.`
  - 理由：没有 per-turn 再注入（方案 A 需改 loader），但同 prompt 内二次出现能显著降低模型遗忘
  - _Requirements: 2.7, 11.5_

- [x] 3.6 Checkpoint：`npx vitest run`，确认 4 个 agent 文件都通过 markdown 解析（YAML frontmatter 完整、章节层级正确）
  - _Requirements: 10.5_

---

## Task 4: 懒加载 rules 基础设施 + 最小示例（P1）

- [x] 4.1 创建目录 `.claude/rules/`
  - 确保 `.gitignore` 不会把 `.claude/rules/` 误过滤
  - _Requirements: 5.1_

- [x] 4.2 创建 `.claude/rules/spec-editing.md`
  - frontmatter：
    ```yaml
    ---
    paths:
      - ".forge/specs/**"
      - ".forge/specs/**"
    ---
    ```
  - **`paths` 必须是 YAML list（或单字符串）**，不接受其他类型；源码用 `ignore()` 库做 gitignore 语义匹配
  - **注意**：`/**` 后缀会被加载器剥掉；全 `**` 视为无条件加载；支持 brace 展开（如 `"src/*.{ts,tsx}"`）
  - Body 按 design.md §4 给出的示例内容：约束 requirements 文件保留 Glossary、tasks 文件子任务引用 `_Requirements: X.Y_`、frozen 状态修改流程
  - _Requirements: 5.1, 5.2, 5.4_

- [x] 4.3 在 design.md 已有"后续 spec 的候选规则"小节中确认至少列出 3 条候选：`forge-src.md` / `skill-editing.md` / `branch-protection.md`
  - 若 design.md 已包含该列表，本任务只做核对
  - _Requirements: 5.3_

- [x] 4.4 Checkpoint：验证 `.claude/rules/spec-editing.md` 的 YAML frontmatter 能被解析（用 `yq '.paths' .claude/rules/spec-editing.md` 或等价命令检查；返回合法 list）
  - 可选：人工构造一个 `.forge/specs/test.md` 触发会话，验证规则被注入到 context（通过 InstructionsLoaded hook 或 debug 日志确认）
  - _Requirements: 10.5_

---

## Task 5: Hooks Dispatcher 基础设施 + 最小迁移（P1）

- [x] 5.1 创建目录 `.claude/hooks/scripts/`、`.claude/hooks/logs/`（`.claude/hooks/config/` 仅在 5.3 决定用独立配置时创建）
  - 确保 `.gitignore` 已把 `.claude/hooks/logs/**` 忽略（避免 log 文件进 git）
  - _Requirements: 6.5_

- [x] 5.2 创建 `.claude/hooks/scripts/dispatcher.sh`（按 design.md §5 的 bash 骨架）
  - 功能：从 stdin 读 JSON、按 `hook_event_name` 分派、查配置决定是否禁用、**按事件 exit code 语义正确返回**（不是无脑 `exit 0`）
  - 仅支持 SessionStart 和 UserPromptSubmit 两种事件的业务逻辑；其他事件 case 分支为 `exit 0`
  - 脚本必须 `chmod +x`
  - 依赖：`jq`（若不可用则 graceful degrade：skip dispatcher，回到 settings.json 内联命令——通过 `command -v jq` 检查）
  - _Requirements: 6.1, 6.2_

- [x] 5.3 决定配置存放位置并实现对应方案
  - **方案推荐**：复用 Claude Code 已有的 settings 分层——开关写到 `.claude/settings.json` 的 `forge.hooks` 子字段 + `.claude/settings.local.json`
  - **方案退化**：只有在必须引入 Forge 专属开关时才创建 `.claude/hooks/config/hooks-config.json`
  - 无论哪种方案，都必须在 HOOKS-README 里解释选择理由
  - _Requirements: 6.3, 6.4_

- [x] 5.4 创建 `.claude/hooks/HOOKS-README.md`，必须覆盖以下八点：
  1. dispatcher 的职责和调用路径
  2. **Claude Code 的 27 个 hook 事件全清单**（源码 `src/entrypoints/sdk/coreTypes.ts:HOOK_EVENTS`），分三组：已用 / 高价值候选 / 可选
  3. **4 种 hook 类型**（`command` / `prompt` / `agent` / `http`）的使用场景
  4. **exit code 语义表**（对齐源码 `hooksConfigManager.ts:getHookEventMetadata`：PreToolUse/Stop/UserPromptSubmit/PreCompact 等事件的 exit 0 vs 2 vs 其他）
  5. `if:` 条件预过滤的示例（避免所有 Bash 都 spawn dispatcher）
  6. 如何添加新事件的分派分支（修改 `case "$EVENT"` + 按 exit code 语义编写）
  7. 如何禁用某事件（5.3 决定的配置方式）
  8. log 文件位置（`.claude/hooks/logs/hooks-log.jsonl`，当 `disableLogging: false` 时启用）
  - _Requirements: 6.1, 6.7_

- [x] 5.5 修改 `.claude/settings.json`——只改 SessionStart 和 UserPromptSubmit 两块
  - SessionStart：合并原 2 条 bash hook 为单条 dispatcher 调用：`bash ${CLAUDE_PROJECT_DIR}/.claude/hooks/scripts/dispatcher.sh`，加 `timeout: 5`、`async: true`
  - UserPromptSubmit：合并原 1 条 bash hook 为单条 dispatcher 调用
  - **PreToolUse / PostToolUse / Stop / TeammateIdle 保持原样**
  - 未来迁移 PreToolUse 时，HOOKS-README 提示使用 `if: "Bash(git *)"` 做条件预过滤
  - _Requirements: 6.5_

- [x] 5.6 Checkpoint：实际启动一次 Claude Code 会话（或人工触发 SessionStart / UserPromptSubmit 的测试脚本），验证 dispatcher 正确输出原本的上下文（`.forge/knowledge/evolved-rules.md` + `.forge/plans/*.md` 头 + `.forge/progress/*.md` 尾）
  - 若无法在自动测试中运行，仅做静态检查：`bash -n .claude/hooks/scripts/dispatcher.sh` 返回 0；`jq .` 对任何 JSON 配置返回有效
  - _Requirements: 10.4, 10.5_

---

## Task 6: `paths:` 条件激活 + `context: fork` 执行隔离（P0，与 Task 2 协同）

- [x] 6.1 给 `forge-verify`、`forge-fix-conflicts`、`forge-test` 三个 skill 补 `paths:` frontmatter
  - `.claude/skills/forge-verify/SKILL.md`：`paths: ["src/**", "test/**", "forge/src/**", "forge/test/**"]`
  - `.claude/skills/forge-fix-conflicts/SKILL.md`：`paths: [".git/**", "**/*.orig"]`
  - `.claude/skills/forge-test/SKILL.md`：`paths: ["test/**", "**/*.test.ts", "**/*.spec.ts", "vitest.config.ts"]`
  - 格式严格对齐 Req 5.2：YAML list；`/**` 后缀由加载器剥掉；gitignore 语义
  - _Requirements: 3.6_

- [x] 6.2 为至少 1 个 skill 开启 `context: fork`
  - 推荐：`forge-grill` 或 `forge-storm`（探索类 skill 的重活路径）
  - frontmatter 新增 `context: fork`
  - workflow 内部显式声明"最后输出会作为 subagent result 返回给父"——避免模型误以为输出会进主 context
  - _Requirements: 3.7_

- [x] 6.3 在 design.md 的 §3（如尚未包含）列出至少 2 个其他候选 skill 的 `context: fork` 评估
  - 记录为 TODO，不在本 spec 实施
  - _Requirements: 3.7_

- [x] 6.4 Checkpoint：运行 `npx vitest run`；修改过的 skill YAML 可被 yq 解析；`paths` 字段符合 AC 要求
  - _Requirements: 10.2, 10.5_

---

## Task 7: CLAUDE.md 瘦身 + 每文件提交规则 + `@path` 引用（P0 prompt 层）

- [x] 7.1 测量基线：`wc -l CLAUDE.md` 记录当前行数，记入本任务的执行 log
  - 若当前 ≤200 行，则 7.2 只需追加每文件提交规则即可，跳过瘦身；仍然要做 7.4（引入 `@path` 引用）
  - _Requirements: 4.1_

- [x] 7.2 识别迁出候选段落（若需要瘦身）——按 design.md §7 的分类：
  - 路径专属条款 → `.claude/rules/<topic>.md`（但本 spec 只做 spec-editing 一条，其余候选只列 TODO）
  - 跨项目长文档 → `.forge/docs/living/<topic>.md`
  - 全局核心 → 保留在 CLAUDE.md
  - 产出一份"迁移清单"列到本任务的 progress 笔记里
  - _Requirements: 4.2_

- [x] 7.3 在 CLAUDE.md 现有 `## Git Commit Rules`（或等价）章节追加子节"Separate Commits Per File"，内容按 design.md §7 给出的模板：规则文字 + 示例 + 例外（用户显式要求批量）
  - 同时确保三条硬约束存在（若缺则补上，源码 `commands/commit.ts`）：`NEVER skip hooks`、`NEVER --amend`（除非明示）、`never commit secrets`
  - _Requirements: 4.4_

- [x] 7.4 **用 `@path` 语法引用附属规则**（替代错误的 `#[[file:]]` 语法）
  - 在 CLAUDE.md 的顶部（`# CLAUDE.md` 标题之后的正文）**用 leaf text node**（不能在代码块或 HTML 注释内）引用 5–8 个最常用的附属规则文件
  - 语法示例：
    ```
    @.claude/rules/spec-editing.md
    @.forge/docs/living/branch-protection.md
    ```
  - **检查**：任何 `@path` 引用都不能写在 \`\`\` 代码块内；源码只在 leaf text node 解析
  - _Requirements: 4.3_

- [x] 7.5 若 7.1 显示超过 200 行，执行实际瘦身：
  - 把 7.2 识别的"跨项目长文档"条款迁到 `.forge/docs/living/<topic>.md`，在 CLAUDE.md 留 `@.forge/docs/living/<topic>.md` 引用
  - 继续检查行数；若仍超过 200，考虑把次要"路径专属条款"也迁出
  - 迁移全程**零信息损失**——每条被移走的规则都能在目标文件中找到
  - _Requirements: 4.1, 4.2_

- [x] 7.6 复核：`wc -l CLAUDE.md` ≤200 行；所有 `@path` 引用的目标文件存在
  - _Requirements: 4.1, 10.5_

- [x] 7.7 Checkpoint：`npx vitest run`；人工对比瘦身前后的 CLAUDE.md——所有被移出的内容可通过 grep 在新位置找到
  - _Requirements: 10.4_

---

## Task 8: Agent Learnings —— 迁入 `.claude/agent-memory/` 目录（P1，依赖 Task 2）

> **关键**：本 Task 不把 `## Learnings` 段落写到 agent 定义文件里。Learnings 物理上是 `.claude/agent-memory/<agent>/` 目录下的独立 `.md` 文件 + `MEMORY.md` 索引——与 Req 1 AC5 的 `memory: project` 共用同一物理目录。

- [x] 8.1 为 4 个 agent（forge-plan / build / review / ship）在 `.claude/agent-memory/` 下创建对应目录
  - `.claude/agent-memory/forge-plan/`
  - `.claude/agent-memory/forge-build/`
  - `.claude/agent-memory/forge-review/`
  - `.claude/agent-memory/forge-ship/`
  - 每个目录内创建一个空白或模板 `MEMORY.md`（首次运行后由 agent 自己填充）
  - 模板 MEMORY.md 格式按 design.md §6：空的四类分区（User / Feedback / Project / Reference）+ 使用说明注释
  - _Requirements: 7.1, 7.2, 7.3_

- [x] 8.2 为每个 agent 在其 `## Workflow` 的最后一步追加 "Self-evolution" 子节
  - 内容按 design.md §6 的 Self-evolution 模板：
    - 发现新约定时追加/更新对应 type 的 `.md` 文件，补索引行
    - body 格式要求（feedback 必须 Rule + Why + How to apply 三段）
    - 不该存清单（代码模式 / Git 历史 / 调试 fix / CLAUDE.md 已有 / 瞬时状态）
    - 相对日期转绝对日期
    - team scope 禁敏感信息
    - 超过 200 行/25K 字节时归档到 `archive/`
  - _Requirements: 7.4, 7.5, 7.6_

- [x] 8.3 示范 learning 条目（至少 1 条）——对 `forge-build` 预置一条从现有 Forge 经验提取的 feedback learning
  - 路径：`.claude/agent-memory/forge-build/feedback_tdd_before_impl.md`
  - frontmatter：`type: feedback`、`title`、`created`
  - body：含 Rule + **Why** + **How to apply** 三段
  - 同步在 `.claude/agent-memory/forge-build/MEMORY.md` 添加索引行
  - _Requirements: 7.5_

- [x] 8.4 Checkpoint：4 个 agent 目录存在；每个 `MEMORY.md` 可被 yq 解析（若有 frontmatter）；示范 learning 文件通过 frontmatter 校验
  - _Requirements: 10.5_

---

## Task 9: Progressive Disclosure 文件拆分（P0 prompt 层，与 Task 7 互补）

> 依赖：本任务应在 `skill-document-optimization` spec 完成**之后**启动。如果该 spec 未完成，本 Task 只做"扫描与列表"，不做拆分。

- [x] 9.1 扫描 `.claude/skills/*/SKILL.md` 和 `.claude/agents/*.md`，统计每个文件的行数
  - 记录 >150 行的候选列表（包含 Task 2 迁移后的 4 个 agent——它们继承原 skill 的内容，很可能超过 150 行）
  - _Requirements: 3.1_

- [x] 9.2 对候选列表中每个 >150 行的文件，按 design.md §3 的拆分决策树执行：
  - 151–300 行：拆出 `reference.md`（模板/表格/规范类段落）
  - \>300 行：拆出 `reference.md` + `examples.md`
  - 注意：agent 拆分时，`reference.md` / `examples.md` 放在 `.claude/agents/<name>-assets/` 子目录（因为 `.claude/agents/` 本身是平铺结构）
  - 拆分必须无损；原文件留 `## Additional resources` 节带相对链接
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 9.3 对每个拆分后的文件，验证：
  - `SKILL.md` / agent.md ≤150 行
  - 相对链接能解析
  - 原行为指令零丢失——通过 grep 对比拆分前备份
  - _Requirements: 3.3, 10.5_

- [x] 9.4 Checkpoint：`npx vitest run`，contract test 必须同时识别"单文件 SKILL.md"和"SKILL.md + reference.md"两种形态
  - _Requirements: 3.5, 10.2_

---

## Task 10: P2 参考文档（最后，低风险）

- [x] 10.1 创建 `.forge/docs/living/ccbp-patterns-p2.md`
  - 两节内容按 design.md §9/10 的模板：
    - **验证通道（按 change-type 10 小节，最多 50 行）**——对齐源码 `verificationAgent.ts` 的 playbook：Frontend / Backend/API / CLI/Script / Infra/Config / Library/Package / Bug fix / Mobile / Data/ML pipeline / DB migration / Refactoring
    - **Session 五选一（≤20 行）**——引自 Thariq 表 + 源码 `coordinator/coordinatorMode.ts:260–290` 的 continue vs spawn 决策表
  - 每个模式包含"何时适用、如何启用、依赖项"三要素
  - 文件顶部注明"来源：ccbp-reference 仓库的 `tips/` 目录 + Claude Code 源码 `src/tools/AgentTool/built-in/verificationAgent.ts` 与 `src/coordinator/coordinatorMode.ts`"
  - _Requirements: 9.1, 9.2, 9.3_

- [x] 10.2 Checkpoint：文件可被 markdown linter 通过（若 `npm run check` 包含 linter 则运行）
  - _Requirements: 10.6_

---

## Task 11: 源码新增能力补遗（P0/P1 混合）

本 Task 对应 Req 11 的 5 项能力落地。

- [x] 11.1 破坏性 skill 加 `disable-model-invocation`
  - `.claude/skills/forge-ship/SKILL.md`（Task 2.6 的 stub 已加；本任务核对）
  - `.claude/skills/forge-pack/SKILL.md`：新增 `disable-model-invocation: true`
  - `.claude/skills/forge-abort/SKILL.md`：新增 `disable-model-invocation: true`
  - 可选：对 `forge-grill` / `forge-storm` 评估 `user-invocable: false`（默认 `true`）——若决定改，在本任务完成；否则只记录考虑
  - _Requirements: 11.1_

- [x] 11.2 `requiredMcpServers` 能力评估
  - 调查 Forge 当前是否有依赖可选 MCP 的 agent（bitbucket / jira / confluence 等）
  - 如有：对应 agent 的 frontmatter 加 `requiredMcpServers: [<server-name-pattern>]`
  - 如无：在 design.md §11 中追加一句"Forge 当前无依赖 MCP 的 agent；若未来新增 MCP 集成 agent，必须使用 `requiredMcpServers` 控制可见性"
  - _Requirements: 11.2_

- [x] 11.3 `effort: high` 标记深度思考 agent
  - `.claude/agents/forge-plan.md`：frontmatter 加 `effort: high`（Task 2.1 已处理；本任务核对）
  - `.claude/agents/forge-review.md`：frontmatter 加 `effort: high`（Task 2.3 已处理；本任务核对）
  - _Requirements: 11.3_

- [x] 11.4 `forge-verify` 运行时 fail-closed 示范
  - 选择**方案二**（prompt 强化，不改 loader）：
    - 在 `.claude/skills/forge-verify/SKILL.md`（或对应 agent 若已升级）正文靠前位置加一段：
      ```markdown
      ## Execution Contract

      **CRITICAL**: Your response MUST end with a SyntheticOutput tool call returning
      `{verdict: "VERIFIED" | "NOT_VERIFIED" | "INCONCLUSIVE", evidence: [...]}`. Any
      other response format will be rejected by the verifier harness.
      ```
    - 在 design.md §11.4 文档化"方案一"（Stop hook + `check-verify-verdict.sh`）作为后续 spec 的升级路径——不在本 spec 实施
  - _Requirements: 11.4, 2.8_

- [x] 11.5 `criticalSystemReminder` 落地（方案 B）
  - `.claude/agents/forge-ship.md`（Task 3.5 已处理；本任务核对）
  - `.claude/skills/forge-verify/SKILL.md`（若本 spec 内不升级为 agent）：在 `# Forge Verify Skill` 后紧接一行 `**CRITICAL**: Must end with SyntheticOutput verdict.`；在 `## Workflow` 开头重复一次
  - 在 design.md §11.5 文档化"方案 A"（扩展 loader 支持 `criticalSystemReminder` 字段）作为后续 spec 的升级路径
  - _Requirements: 11.5, 2.7_

- [x] 11.6 Checkpoint：所有 11.x 改动文件的 frontmatter 可解析；design.md 的方案 A 文档段落落实
  - _Requirements: 10.5_

---

## Task 12: Contract Test 更新（与 Task 2、3、9、11 协同）

> 本 Task 在 Task 2 完成后启动（因为要同时识别 skill 和 agent 两种形态），在 Task 9 和 Task 11 完成后收尾。

- [x] 12.1 在 `test/contract.test.ts` 或 `test/contract.skills.test.ts` 中引入 `locateForgeSubcommand(name)` 工具函数
  - 逻辑：同时检查 `.claude/agents/<name>.md` 和 `.claude/skills/<name>/SKILL.md`，返回第一个命中的 `{kind, path}`
  - 4 个迁移对象（plan/build/review/ship）优先命中 agent 路径；其余 11 个子命令命中 skill 路径
  - _Requirements: 10.1_

- [x] 12.2 更新现有 contract 断言——agent 形态校验
  - 必填 frontmatter 字段：`name`、`description`（含 "PROACTIVELY"）、`tools`（**注意字段名是 `tools`，不是 `allowedTools`**）、`memory: 'project'`、`model`、`maxTurns`、`color`
  - 工具集合校验：`tools` 是数组、非空
  - 特别断言：
    - `forge-build.tools` **必须包含 `Agent`**（否则无法 spawn subagent）
    - `forge-build.tools` **不含 `WebFetch` / `WebSearch`**
  - _Requirements: 10.1, 10.3_

- [x] 12.3 更新 skill 形态校验（区分字段名）
  - skill frontmatter 用**连字符**字段名：`allowed-tools`（不是 `tools`）、`disable-model-invocation`、`user-invocable`
  - 对 forge-ship / forge-pack / forge-abort（Task 11.1）断言 `disable-model-invocation: true`
  - _Requirements: 10.3, 11.1_

- [x] 12.4 为 `paths:` 字段添加断言
  - 若 skill 的 frontmatter 含 `paths`，值必须是字符串或 string[]（不接受其他类型）
  - 每个 pattern 非空字符串
  - 警告全 `**` 的情况（会被加载器当成匹配所有，等同无条件加载）
  - 对 Task 6.1 的 forge-verify / forge-fix-conflicts / forge-test 断言 `paths` 存在且非空
  - _Requirements: 10.2, 3.6_

- [x] 12.5 为 `context: fork` 字段添加断言
  - 若 skill 的 frontmatter 含 `context`，值必须是 `"fork"` 或 `"inline"`（源码枚举）
  - 对 Task 6.2 选定的 skill 断言 `context: fork`
  - _Requirements: 10.2, 3.7_

- [x] 12.6 为 Progressive Disclosure 拆分添加断言
  - 对 Task 9 中拆分出 `reference.md` 的文件，验证 SKILL.md 中存在 `## Additional resources` 节并引用 `reference.md`
  - 验证 `reference.md` 文件存在、可读、非空
  - _Requirements: 3.5, 10.2_

- [x] 12.7 为 Execution Contract 段落添加断言
  - 4 个 agent 必须含 `## Execution Contract (non-negotiable)` 章节
  - 章节必须出现在 `## Workflow` 之前（通过 heading 顺序验证）
  - _Requirements: 10.1_

- [x] 12.8 为 agent-memory 目录存在性添加断言
  - 对 4 个 agent 断言对应 `.claude/agent-memory/<name>/` 目录存在
  - 断言 `.claude/agent-memory/<name>/MEMORY.md` 文件存在
  - **不**断言 agent 定义文件内有 `## Learnings` 段落（本 spec 的设计是把 Learnings 迁到 agent-memory 目录）
  - _Requirements: 7.1, 10.1_

- [x] 12.9 为 `@path` 引用添加断言
  - 扫描 CLAUDE.md 里所有 `@path`（必须在 leaf text node，不在代码块）
  - 断言每个 `@path` 指向的文件存在
  - _Requirements: 4.3, 10.5_

- [x] 12.10 运行全量测试：`npx vitest run`，所有 contract test 通过；运行 `npm run check`（若存在）全部通过；运行 `npm run build`（若存在）全部通过
  - _Requirements: 10.4_

---

## Task 13: Integration Validation & Cleanup

- [x] 13.1 人工烟雾测试：实际在 Claude Code 会话中触发 `/forge plan "test"` → `/forge build "test"` → `/forge review` → `/forge ship`
  - 确认每个子命令能正确通过 Agent 工具调用；Execution Contract 段落被模型正确理解（可通过观察 agent 是否尝试使用 WebFetch 等被禁工具来验证）
  - 确认 `forge-build` 能 spawn subagent（Agent 含在 tools 里）
  - 触发一次 forge-verify，确认结尾调用了 SyntheticOutput 或在 prompt 强化下以三态 verdict 结束
  - 若发现行为回归，记录为 Task 13.2 的修复输入
  - _Requirements: 1.4, 2.5, 11.4_

- [x] 13.2 修复烟雾测试暴露的问题（若有）
  - _Requirements: 1.7, 10.4_

- [x] 13.3 更新 README 或项目入口文档的"Claude Code 集成"章节（若存在），说明本 spec 引入的新结构：`.claude/agents/`、`.claude/rules/`、`.claude/hooks/`、`.claude/agent-memory/`
  - _Requirements: 4.2_

- [x] 13.4 清理临时备份文件（若 Task 7 创建了 CLAUDE.md 备份，本 Task 删除；若需保留，迁到 `.forge/archive/`）
  - _Requirements: 10.4_

- [x] 13.5 最终 Checkpoint：`npx vitest run` + `npm run check` + `npm run build` 全绿；`git status` 干净（除了有意的改动）
  - _Requirements: 10.4, 10.6_

---

## Task 执行顺序建议

```
Task 1 (settings.local)              ← 独立，先做热身
  ↓
Task 2 (skill → agent)               ← 核心结构变更
  ↓
Task 3 (Execution Contract)          ← 依赖 Task 2
  ↓
Task 4 (rules 基础设施)              ← 与 Task 2/3 并行
Task 5 (hooks dispatcher)            ← 与 Task 2/3 并行
Task 6 (paths + context: fork)       ← 与 Task 2/3 并行
Task 7 (CLAUDE.md 瘦身 + @path)      ← 与 Task 2/3 并行
Task 8 (agent-memory 目录)           ← 依赖 Task 2
Task 11 (源码能力补遗)               ← 与 Task 2/3 并行；11.1 依赖 Task 2.6
  ↓
Task 9 (Progressive Disclosure)      ← 依赖 skill-document-optimization spec 完成；依赖 Task 2
  ↓
Task 10 (P2 文档)                    ← 独立，可任何时机
  ↓
Task 12 (Contract Test)              ← 随 Task 2/3/6/8/9/11 协同；所有其他 Task 完成后最终收尾
  ↓
Task 13 (烟雾测试 + 清理)            ← 最后
```
