---
feature: workflows-integration
status: completed
implemented_in: worktree-workflows-integration (PR #pending)
deferred_to:
  - workflows-integration-wiring (Dispatcher/AuditWriter/IpcEmitter integration)
  - workflows-integration-resilience (stuck timeout / backpressure / 429 degrade)
---

# Requirements Document

## Introduction

本文档面向 Forge 框架的 `workflows-integration` 特性，把 Claude Code 平台原生的 Workflows 能力深度集成到 Forge，并同步把 `forge-loop` 自主循环的驱动层从 `@anthropic-ai/claude-agent-sdk` 切换为 `claude --print --output-format stream-json` 子进程。


本特性把 Claude Code 平台原生的 **Workflows** 能力深度集成到 Forge 框架，并同步把 `forge-loop` 自主循环的驱动层从 `@anthropic-ai/claude-agent-sdk` 切换为 `claude --print --output-format stream-json` 子进程。

集成动机包含两条主线：

1. **简化多 agent 编排**：Forge 当前在 `/forge review`、`/forge decide`、`/forge learn` 中通过 `Agent` tool 手动调度并行 subagent，控制并发、收集结构化输出、做对抗性验证。Claude Code 原生 Workflows（`bp()`、`phase()`、`parallel()`、`pipeline()`、`agent()`）在 runtime 一侧已经把 **并行调度、结构化 schema 校验、阶段化 trace、token 预算** 都做好了。把现有 `multi-agent-review.js` 这类 workflow 升级为平台一等公民，可以让交互模式下的 review/decide/learn 直接享受平台的 trace 视图、retry 语义和 token cap，而 Forge 自己只需要把"输出去哪、阻断条件是什么、subagent type 是哪个"映射进去。
2. **forge-loop 与交互模式 runtime 收敛**：`forge-loop` 当前用 `@anthropic-ai/claude-agent-sdk`，agent-sdk **不带 Workflow runtime**，导致同一个 review/decide 子命令在 `/forge` 交互态和 `forge-loop` 自主迭代态走两条不同的执行路径。换芯到 `claude --print --output-format stream-json` 子进程后，两条路径共用同一个 Claude Code runtime，workflows 一致可用，行为一致可观测。

特性按工作包拆分：

- **工作包 A — 分发层与 fallback 集成**（4 件前置改造）：插件打包路径迁移、子命令 fallback dispatcher、fallback ladder 规则文件、审计双写。
- **工作包 B — forge-loop 驱动层换芯**：CLI 子进程驱动、stream-json 协议适配、CLI flag 兼容、desktop app IPC 兼容、warm-query 替代、错误处理与降级。
- **跨工作包**：与 §config 受保护区的兼容性、与 §6 并发上限的兼容性、市场分发回归测试。

特性必须严格满足 Forge 项目宪法（`AGENTS.md`）的全部铁律：§config frozen-zone-protection、§6 Session_Boundary、§2.1 TDD、§2.3 Verification IRON-LAW、§2.7 No Confirmation Between Steps、§3.1 Execution-Assessment Separation。

## Glossary

- **Workflow**：Claude Code 原生编排原语，由 `bp()`（blueprint runner）解释执行，单文件 `.js`，导出 `meta` 元数据并通过 `phase()`、`agent()`、`parallel()`、`pipeline()`、`log()`、`return` 描述阶段、调度子 agent 并产出结构化结果。本特性范围内特指 `multi-agent-review.js` 这类 review/decide/learn workflow。
- **Workflow runtime**：Claude Code（`claude` CLI 与 IDE）内置的 workflow 执行器，受 Statsig gate `tengu_workflows_enabled` 控制开启，依赖环境变量 `CLAUDE_CODE_WORKFLOWS=1` 暴露 API。Workflow runtime **不存在于** `@anthropic-ai/claude-agent-sdk` 包中。
- **`bp()` 函数**：Claude Code 提供给 workflow 的 blueprint helper 入口，用于在 workflow 文件内调用 `phase`、`agent`、`parallel`、`pipeline`、`log` 等原语。
- **`tengu_workflows_enabled` gate**：Anthropic 平台 Statsig 特性开关，决定当前 Claude Code 会话是否暴露 workflows 能力。开关关闭时 workflow 不可用。
- **agent-sdk**：`@anthropic-ai/claude-agent-sdk` npm 包，当前 `forge-loop-cli.ts` 使用的进程内 SDK。提供 `query`、`startup`、structured event stream，但不包含 Workflow runtime。
- **`stream-json` 协议**：`claude --print --output-format stream-json --include-partial-messages` 输出的逐行 JSON 事件流，每行一个 JSON 对象，事件类型包含 `system`、`assistant`、`user`、`tool_use`、`tool_result`、`result` 等。
- **forge-loop**：Forge 的自主迭代器（实现于 `src/forge-loop-cli.ts` + `src/sdk-driver.ts`），不依赖人类交互，按 `--max-iterations` / `--max-tokens` / `--stop-when` 反复驱动 Claude 完成目标。
- **Forge_Plugin_Root**：Claude Code 加载本插件时 `${CLAUDE_PLUGIN_ROOT}` 环境变量解析到的目录，由 `.claude-plugin/plugin.json` 标识。
- **fallback ladder（L0→L1→L2→L3）**：来自 ADR-0005 的多级降级阶梯。本特性扩展此模型至 review/decide/learn 三个走 workflow 的子命令：
  - **L0**：交互模式 + workflow 可用 → 走 Claude Code 原生 workflow。
  - **L1**：workflow 不可用或非交互 → 走 Forge 现有 subagent teams 编排。
  - **L2**：subagent teams 串行降级（来自 ADR-0005）。
  - **L3**：阻断 ship，**禁止主 agent 顶替**（ADR-0005 hard-gate）。
- **Forge_Audit_Zones**：Forge 自有审计目录的统称，包含 `.forge/reviews/`、`.forge/decisions/`、`.forge/knowledge/sessions/`，按 `.forge/config.md` §config 划定为 Guarded（仅追加）。
- **CC_Workflow_History**：Claude Code 平台为 workflow 维护的全局 `/workflows` 历史目录（CC 自身管理），生命周期与平台账号绑定，**不在 Forge 控制下**。
- **Session_Boundary**：来自 `AGENTS.md §6`，每个 `/forge <子命令>` 调用自身构成一次会话边界，跨子命令上下文必须经文件系统（`.forge/`）交接，不得通过 workflow runtime 内部状态跨子命令传递。
- **Frozen_Zone**：`.forge/config.md` 定义的 frozen-zone-protection 区域：`status: locked` 的 spec、`status: approved` 的 plan、`config.md` 自身。AI 不得修改。
- **Guarded_Zone**：`.forge/config.md` 定义的 Guarded 区，仅允许追加：progress、reviews、knowledge/instincts、knowledge/known-failures、ADR（已发布）等。
- **warm-query**：`@anthropic-ai/claude-agent-sdk` `startup()` 提供的预热能力，在主循环开始前提前发起一次轻量 query，避免冷启动延迟。换芯后需要等价或更优的替代实现。
- **Desktop_IPC_Contract**：`apps/forge-loop-desktop/` 与 `forge-loop` 子进程之间的 IPC 协议，当前依赖 forge-loop 的 stream-json 输出格式与退出码语义。

## Requirements

### Requirement 1: 插件打包路径迁移

**User Story:** 作为通过 Claude Code 市场（marketplace）安装 Forge 的用户，我希望 workflows 能像 hooks、agents、commands 一样被 Claude Code 自动发现并加载，这样我无需手动复制 workflow 文件就能直接在交互模式下运行 `multi-agent-review`。

#### Acceptance Criteria

1. THE Forge_Plugin SHALL 在 `.claude-plugin/plugin.json` 中显式声明 `"workflows": ["./workflows"]` 字段，路径相对插件根。
2. THE Forge_Plugin SHALL 把 `multi-agent-review.js` 物理放置于插件根目录下的 `./workflows/multi-agent-review.js`，而不是项目级 `.claude/workflows/`。
3. WHEN 用户通过 `/plugin install forge@forge-official` 安装本插件，THE Claude_Code_Marketplace_Loader SHALL 能够发现并加载 `${CLAUDE_PLUGIN_ROOT}/workflows/multi-agent-review.js`。
4. THE Forge_Plugin SHALL 保留 `.claude-plugin/plugin.json` 中既有 `mcpServers.forge-context` 与全部 hooks（SessionStart、UserPromptSubmit、PreToolUse、PostToolUse、Stop、TeammateIdle、TaskCompleted）的路径解析行为，新增 `workflows` 字段不得改变其它字段的 `${CLAUDE_PLUGIN_ROOT}` 替换语义。
5. IF `./workflows/multi-agent-review.js` 缺失或语法不可解析，THEN THE Forge_Plugin_Validator SHALL 在 CI 的 `plugin-validate` job 中阻断（与现有 `test/plugin-manifest.test.ts` 的契约测试一致）。

##### Validation Contract

| AC | Verify-By | Evidence |
|----|-----------|----------|
| 1.1 | static-check | `.claude-plugin/plugin.json` 包含 `"workflows": ["./workflows"]` 字段（key 与 value 完全匹配） |
| 1.2 | static-check | `./workflows/multi-agent-review.js` 存在；`.claude/workflows/multi-agent-review.js` 已删除或 redirect |
| 1.3 | integration-test | dist 包安装后 `claude` CLI 列出的 workflow 中包含 `multi-agent-review`（脚本验证 `claude /workflows list` 输出） |
| 1.4 | regression-test | `test/plugin-manifest.test.ts` 既有 12 条契约测试（hooks 路径、mcpServers、commands 数量）全部通过 |
| 1.5 | unit-test | 在临时目录构造缺失的 `./workflows/` 后运行 `node scripts/validate-plugin-manifest.mjs`，退出码非零且 stderr 含 `workflow load failed` |

---

### Requirement 2: 子命令 Workflow Subagent Fallback Dispatcher

**User Story:** 作为 Forge 的开发者用户，我希望 `review`、`decide`、`learn` 子命令在交互模式且 workflow 可用时走原生 workflow，在 `forge-loop` 自主模式或 workflow 不可用时无缝 fallback 到现有 subagent 编排，这样无论我从哪条路径触发，都能得到一致的结构化产物。

#### Acceptance Criteria

1. WHEN 用户在交互模式下调用 `/forge review`、`/forge decide` 或 `/forge learn`，AND `tengu_workflows_enabled` gate 为开启，AND 环境变量 `CLAUDE_CODE_WORKFLOWS=1`，AND `${CLAUDE_PLUGIN_ROOT}/workflows/<name>.js` 存在且 `node --check` 通过语法校验，AND 并发桥接（Requirement 12.3）探测可控，THE Forge_Subcommand_Dispatcher SHALL 通过 `bp()` 调用对应的原生 workflow 作为 L0 路径。
2. IF `tengu_workflows_enabled` gate 关闭，OR `CLAUDE_CODE_WORKFLOWS` 未设置，OR 当前会话由 `forge-loop` 子进程驱动（非交互），OR `${CLAUDE_PLUGIN_ROOT}/workflows/<name>.js` 缺失或语法错误，OR 并发桥接探测不可控（与 Requirement 12.3 一致），THEN THE Forge_Subcommand_Dispatcher SHALL 选择 L1 subagent teams 编排作为执行路径，AND 在 `dispatch.jsonl` 标注 `l1_trigger_reason ∈ {gate_disabled, env_unset, non_interactive, workflow_missing, workflow_syntax_error, concurrency_uncontrolled}`。
3. WHILE Forge_Subcommand_Dispatcher 处于 L1 路径，THE Forge_Subcommand_Dispatcher SHALL 调用现有 `runReviewFallbackLadder` / `forge-decide-lead` / `forge-learn` subagent 编排，并保留 ADR-0005 的 L1→L2→L3 内部降级。
4. WHEN L0 workflow 在 runtime 阶段失败（含 `bp()` 异常、schema 校验失败、子进程崩溃、stuck timeout、frozen-zone 阻断），THE Forge_Subcommand_Dispatcher SHALL 自动降级至 L1，AND 在产物中标注 `methodology: workflow-then-subagent`，AND 写入 `l0_failure_signature ∈ {bp_exception, schema_validation_failed, subprocess_crash, stuck_timeout, frozen_zone_blocked}`。
5. THE Forge_Subcommand_Dispatcher SHALL 在每次执行结束后向 `.forge/runs/<runId>/dispatch.jsonl` 追加一条 JSON 记录，字段必须为以下集合的超集：`subcommand`、`mode`（interactive | loop）、`run_id`、`session_id`、`workflow_state_id`、`workflow_version`、`gate_enabled`、`workflow_available`、`chosen_level`（L0|L1|L2|L3）、`l1_trigger_reason`（仅当 chosen_level≥L1）、`l0_failure_signature`（仅当走过 L0 后降级）、`exit_code`、`duration_ms`、`timestamp`（ISO-8601）、`frozen_zone_blocked`（布尔）。
6. IF 所有 fallback 级别均不可用（L3），THEN THE Forge_Subcommand_Dispatcher SHALL 把执行结果标注 `result: blocked`、`methodology: unavailable`，AND 在 `.forge/status.md` 的 `phase` 字段标注 `<subcommand>-blocked`，AND 阻断 ship；THE Forge_Subcommand_Dispatcher SHALL NOT 让主 agent 顶替评审/决策（与 ADR-0005 hard-gate 一致）。
7. WHEN Forge_Subcommand_Dispatcher 完成 L0 workflow，THE Forge_Subcommand_Dispatcher SHALL 自动推进到下一阶段，不得引入 "是否继续" 之类的中间确认（与 §2.7 No Confirmation Between Steps 一致）；workflow 内部的 phase_started / phase_completed / partial finding 事件不视为 idle 或确认请求。
8. WHEN L0 workflow 在跨 phase 之间失败（已经写出部分 finding），THE Forge_Subcommand_Dispatcher SHALL 把已写出的 partial finding 隔离至 `.forge/runs/<runId>/l0-partial/<subcommand>-<timestamp>.md`（不进入 `.forge/reviews/` 或 `.forge/decisions/` 受保护区），AND 在 L1 重跑产生新产物，二者在产物 frontmatter 通过 `precursor_partial` 字段交叉引用。
9. WHEN Forge_Subcommand_Dispatcher 的状态空间组合不命中 AC 2.1 的 L0 主路径条件 AND 不命中 AC 2.2 的任一 L1 触发条件，THE Forge_Subcommand_Dispatcher SHALL 降级到 L1 兜底路径，AND 在 `dispatch.jsonl` 标注 `l1_trigger_reason: unmatched_state`，确保不存在状态机黑洞。
10. THE Forge_Subcommand_Dispatcher SHALL 在 `.forge/status.md` 写入 `dispatch_chosen_level`、`dispatch_subcommand`、`dispatch_run_id` 三字段（与 dispatch.jsonl 末行一致），forge-ship SKILL 通过读取这三个字段判断是否阻断 ship，无需解析 JSONL。

##### Validation Contract

| AC | Verify-By | Evidence |
|----|-----------|----------|
| 2.1 | integration-test | 在交互模式下置 `CLAUDE_CODE_WORKFLOWS=1` 跑 `/forge review`，`.forge/runs/<runId>/dispatch.jsonl` 末行 `chosen_level=L0` AND 5 个前置条件全部为 true |
| 2.2 | property-based-test | 1 000 次随机注入单一负面条件（gate_off/env_unset/non_interactive/file_missing/syntax_error/uncontrolled_concurrency），dispatcher 全部走 L1 且 `l1_trigger_reason` 等于对应枚举值 |
| 2.3 | unit-test | L1 路径下断言调用了 `runReviewFallbackLadder`、`forge-decide-lead`、`forge-learn` 之一（spy） |
| 2.4 | unit-test | 注入 5 类失败场景，dispatcher 产物字段 `methodology=workflow-then-subagent` 且 `l0_failure_signature` 命中对应枚举值（穷举所有 5 个值） |
| 2.5 | property-based-test | 1 000 次随机 (mode, gate, workflow_available, exit_code, fail_phase) 组合，`dispatch.jsonl` 行均合法 JSON 且字段集合为 spec 列表的超集，`timestamp` 通过 ISO-8601 校验 |
| 2.6 | integration-test | 强制使所有级别失败，运行 `/forge review`；`.forge/reviews/<topic>.md` 含 `result: blocked, methodology: unavailable`，`.forge/status.md` 的 `phase` 字段为 `review-blocked`，ship gate 退出码非零 |
| 2.7 | static-check | dispatcher 实现中 grep 不到 "是否继续"、"continue?" 之类提示词；阶段输出格式匹配 `^✅ <subcommand> 完成 → 自动进入`；workflow runtime 的 phase_started/phase_completed/partial finding 事件不触发用户确认 prompt |
| 2.8 | integration-test | 注入 phase-2 失败的 mock workflow，`.forge/runs/<runId>/l0-partial/review-<ts>.md` 存在；后续 L1 产物 frontmatter 含 `precursor_partial: l0-partial/review-<ts>.md`；`.forge/reviews/` 不含 partial 产物 |
| 2.9 | property-based-test | 1 000 次随机生成 (mode × gate × workflow_available × runtime_failure × concurrency × frozen_zone) 状态向量，每次都命中 L0 或 L1，无黑洞；不命中 AC 2.1/2.2 的状态全部记录 `l1_trigger_reason: unmatched_state` |
| 2.10 | integration-test | 跑 `/forge review` 后 `.forge/status.md` 含 `dispatch_chosen_level`、`dispatch_subcommand`、`dispatch_run_id` 三字段；模拟 forge-ship SKILL 读取该文件即可判断 ship 阻断状态 |

---

### Requirement 3: Fallback Ladder 规则文件

**User Story:** 作为后续维护者，我希望 fallback ladder 的规则在 `.claude/rules/` 中以可被 IDE 自动加载或显式引用的方式落档，这样所有走 workflow 的 SKILL（review/decide/learn）都引用同一份规范，保证语义一致。

#### Acceptance Criteria

1. THE Forge_Plugin SHALL 在 `.claude/rules/workflow-fallback-ladder.md` 创建规则文件，明确 "workflow 是 review/decide/learn 的 L0；subagent teams 是 L1；单 agent 是 L2；主 agent 顶替是 L3 阻断"。
2. THE Workflow_Fallback_Ladder_Rule_File SHALL 在文档中显式 cross-reference ADR `2026-05-18-review-fallback-ladder.md`，并声明 hard-gate "L3 禁止主 agent 顶替"。
3. THE Workflow_Fallback_Ladder_Rule_File SHALL 在 frontmatter 中声明 `inclusion: always`（auto-include）或被 `forge-review`、`forge-decide`、`forge-learn` 三个 SKILL 的 instructions 显式 `@.claude/rules/workflow-fallback-ladder.md` 引用。
4. WHEN forge-review、forge-decide、forge-learn 任一 SKILL 渲染 instructions，THE Forge_SKILL_Loader SHALL 把 `workflow-fallback-ladder.md` 内容注入 system prompt（auto-include 或显式引用产生相同效果）。
5. THE Workflow_Fallback_Ladder_Rule_File SHALL 列举每一级触发条件、产物 `methodology` 字段值、是否阻断 ship，与 Requirement 2.4–2.6 字段表保持字面一致。

##### Validation Contract

| AC | Verify-By | Evidence |
|----|-----------|----------|
| 3.1 | static-check | `.claude/rules/workflow-fallback-ladder.md` 文件存在，长度 > 0，含字符串 "L0"、"L1"、"L2"、"L3" |
| 3.2 | static-check | 文件内 grep 到 `2026-05-18-review-fallback-ladder.md` 与 `hard-gate` 关键词 |
| 3.3 | static-check | 文件 frontmatter `inclusion: always` 或 forge-review/decide/learn instructions 内含 `@.claude/rules/workflow-fallback-ladder.md` |
| 3.4 | integration-test | 在三个 SKILL 渲染后的 system prompt 中均能 grep 到规则文件正文 |
| 3.5 | static-check | 字段表与 Requirement 2.4–2.6 字段名/值完全一致（脚本 diff 校验） |

---

### Requirement 4: 审计双写 Workflow 产物到 Forge 受保护区

**User Story:** 作为 Forge 项目宪法的执行者，我需要 workflow 产生的关键产物在 Claude Code 平台 `/workflows` 历史和 Forge 自有审计区都各保留一份，这样即使我离开 Claude Code 平台或被切换账号，Forge 自有的审计链不依赖外部平台仍然完整。

#### Acceptance Criteria

1. WHEN review workflow 完成，THE Workflow_Audit_Writer SHALL 在 `.forge/reviews/<topic>.md` 追加 review 产物（包含 `methodology`、`stats`、`findings`、`ship_ready`）。
2. WHEN decide workflow 完成，THE Workflow_Audit_Writer SHALL 在 `.forge/decisions/<date>-<topic-slug>.md` 写入决策转录文件（非 ADR；ADR 文件由 `finalizeAdr` 单独负责）。
3. WHEN learn workflow 完成，THE Workflow_Audit_Writer SHALL 在 `.forge/knowledge/sessions/<runId>.md` 追加 session 学习记录。
4. THE Workflow_Audit_Writer SHALL 同时把同一份产物以等价 JSON 形态保留在 Claude Code 平台 `/workflows` 历史中（通过 `bp()` runtime 默认行为完成；本系统不修改 CC 历史）。
5. WHILE 写入 `.forge/reviews/`、`.forge/knowledge/sessions/`、`.forge/decisions/`（非 ADR），THE Workflow_Audit_Writer SHALL 仅追加新内容或新文件，不得删除或覆盖既有内容（与 §config Guarded_Zone 规则一致）。
6. IF 待写入路径目录不存在，THEN THE Workflow_Audit_Writer SHALL 自动以 `mkdir -p` 创建目录后再写入。
7. IF 写入目标命中 Frozen_Zone（locked spec / approved plan / `config.md`），THEN THE Workflow_Audit_Writer SHALL 阻断写入并向 `.forge/runs/<runId>/dispatch.jsonl` 追加 `frozen_zone_blocked: true`。
8. THE Workflow_Audit_Writer SHALL 在每次写入前后通过 PreToolUse hook `hook-check-frozen.sh` 校验目标路径，与现有 hooks 行为对齐。

##### Validation Contract

| AC | Verify-By | Evidence |
|----|-----------|----------|
| 4.1 | integration-test | 跑 review workflow 后 `.forge/reviews/<topic>.md` 末尾新增条目，diff 仅含追加内容 |
| 4.2 | integration-test | 跑 decide workflow 后 `.forge/decisions/<date>-<slug>.md` 存在，文件名形如 `[0-9]{4}-[0-9]{2}-[0-9]{2}-.*\.md` |
| 4.3 | integration-test | 跑 learn workflow 后 `.forge/knowledge/sessions/<runId>.md` 存在 |
| 4.4 | integration-test | 同一次运行 `claude /workflows history --json` 输出中可定位到对应记录的 hash |
| 4.5 | property-based-test | 1 000 次随机 (existing_content, append_payload) 写入后，旧内容字符级 prefix 不变（`assert(new.startswith(old))`） |
| 4.6 | unit-test | 删掉目标目录后调用 writer，断言目录被自动创建且写入成功 |
| 4.7 | unit-test | 把目标路径改为 locked spec，writer 抛 `FrozenZoneViolation`，`dispatch.jsonl` 含 `frozen_zone_blocked: true` |
| 4.8 | integration-test | mock `hook-check-frozen.sh` 返回非 0，writer 中止；mock 返回 0，writer 继续 |

---

### Requirement 5: forge-loop CLI 子进程驱动换芯

**User Story:** 作为 `forge-loop` 用户，我希望自主迭代和交互模式跑同一个 Claude Code runtime，这样 workflows 在两种模式下行为一致，我可以信任 `forge-loop` 跑出的 review 结果和我手动 `/forge review` 跑的结果是一致的。

#### Acceptance Criteria

1. THE Forge_Loop_Driver SHALL 通过 `node:child_process.spawn("claude", args)` 启动 Claude Code 子进程，args 必须满足以下五项条件：
   - (a) 包含 `--print`、`--output-format=stream-json`、`--include-partial-messages`；
   - (b) 含 `--input-format=stream-json`，使 stdin 接受 NDJSON 帧而非单一 prompt 字符串；
   - (c) 把 agent-sdk `Options.permissionMode` 字面值映射为 `--permission-mode <mode>`；当 `Options.allowDangerouslySkipPermissions===true` 时追加 `--dangerously-skip-permissions`；
   - (d) 把 `Options.allowedTools` 与 `Options.disallowedTools` 分别映射为 `--allowed-tools <comma-list>` / `--disallowed-tools <comma-list>`；当 `Options.mcpConfig` 非空映射为 `--mcp-config <path>`；当 `Options.additionalDirectories` 非空映射为多次 `--add-dir <dir>`；当 `Options.systemPrompt` 非空映射为 `--system-prompt-file <path>`（写入 `.forge/runs/<runId>/system-prompt.txt`）；
   - (e) `spawn` 必须显式传 `env: { ...process.env, ANTHROPIC_API_KEY, CLAUDE_CODE_WORKFLOWS, CLAUDE_CODE_OAUTH_TOKEN }`，不依赖隐式继承。
2. THE Forge_Loop_Driver SHALL 通过子进程 stdin 写入 NDJSON 帧驱动迭代：每条用户输入 / system prompt injection / initial message 序列化为单行 JSON `{"type": "user", "message": {...}}` + `\n`；写完所有帧后调用 `stdin.end()` 关闭流，**禁止**通过单一 prompt 字符串传递。
3. WHEN 子进程在 stdout 输出 stream-json 事件，THE Forge_Loop_Driver SHALL 按行 `JSON.parse` 并把事件分发到 `EffectExecutor` 与 `RunManager`，等价于现有 agent-sdk message stream。
4. WHEN 子进程退出码 = 0 AND 最后一条事件 `type === "result"` 且 `subtype === "success"`，THE Forge_Loop_Driver SHALL 将该次迭代标记为 success 并继续主循环；每次外层迭代独立 spawn 一个子进程，子进程内部 turn 数由 `--max-turns <n>` 控制，默认值与 agent-sdk `Options.maxTurns` 等价（`Math.min(opts.maxIterations ?? 30, 30)`）。
5. THE Forge_Loop_Driver SHALL 不再 import `@anthropic-ai/claude-agent-sdk`；以下文件不得有 runtime 引用（仅 `import type` 允许）：`src/forge-loop-cli.ts`、`src/sdk-driver.ts`、`src/sdk-agent-adapter.ts`、`src/agent-registry.ts`、`src/sandbox-profile.ts`、`src/frozen-zone-hook.ts`。`package.json` 的 `dependencies` 可保留 agent-sdk。
6. THE Forge_Loop_Driver SHALL 在每次迭代开始前根据用户输入选择子进程参数：当 `--resume <session-id>` 传入时使用 `--resume <session-id>`（接续既有 session）；当首次启动且 `--session-id <uuid>` 传入时使用 `--session-id <uuid>`（新建并指定 ID）；二者互斥，同时传入时 `--resume` 优先且 stderr 输出 warning。
7. THE Forge_Loop_Driver SHALL 捕获子进程 stderr 并写入 `.forge/runs/<runId>/stderr.log`（追加模式），且把每行同步转发到结构化 LogSink（level=warn）；stderr 不得污染 stdout 的 stream-json 管道。
8. WHEN Forge_Loop_Driver 收到 SIGINT（用户 Ctrl+C）或 SIGTERM，THE Forge_Loop_Driver SHALL 先向子进程发送 SIGINT，10 秒内未退出则发送 SIGTERM，再 5 秒未退出则发送 SIGKILL；每一步信号转发记录到 `.forge/runs/<runId>/signal_chain.jsonl`。
9. WHILE 子进程 stdout 缓冲区超过 4 MiB 持续 5 秒（背压检测），THE Forge_Loop_Driver SHALL 向 stderr 输出 warning 并写入 `.forge/runs/<runId>/backpressure.jsonl`；持续 60 秒未缓解则向子进程发 SIGTERM，30 秒后 SIGKILL，并按 Requirement 10.2 重试当前迭代。

##### Validation Contract

| AC | Verify-By | Evidence |
|----|-----------|----------|
| 5.1 | unit-test | spy `child_process.spawn`：首参数 `claude`，args 集合包含 (a)–(d) 列出的所有 flag；env 对象包含 (e) 列出的字段；mock 不同 Options 组合验证映射 |
| 5.2 | unit-test | mock 子进程 stdin 收到的字节流按 `\n` 切分，每条均合法 JSON AND `type` 字段在合法集合内；spy `stdin.end()` 在最后一帧后被调用 |
| 5.3 | property-based-test | 注入随机合法 stream-json 事件序列 1 000 次，driver 派发顺序与输入顺序一致 |
| 5.4 | unit-test | mock 子进程退出码 0、最后事件 success → 主循环 `iterations` 字段 +1；args 含 `--max-turns N` 且 N=`min(maxIterations, 30)` |
| 5.5 | static-check | `rg "from '@anthropic-ai/claude-agent-sdk'" src/forge-loop-cli.ts src/sdk-driver.ts src/sdk-agent-adapter.ts src/agent-registry.ts src/sandbox-profile.ts src/frozen-zone-hook.ts` 仅匹配 `import type` 行，0 个 runtime import |
| 5.6 | integration-test | 启动 forge-loop 加 `--resume <id>`，子进程 args 中含 `--resume <id>`；同时传 `--resume` 与 `--session-id` 时 `--resume` 优先 + stderr 含 warning |
| 5.7 | unit-test | mock 子进程向 stderr 写入 3 行，`.forge/runs/<runId>/stderr.log` 含全部 3 行；LogSink 收到对应 3 条 warn 级别事件；stdout JSON 解析正常无干扰 |
| 5.8 | unit-test | 模拟 SIGINT，spy 子进程信号接收：第 1 次 SIGINT、10s 后 SIGTERM、再 5s 后 SIGKILL；`signal_chain.jsonl` 含 3 条记录 |
| 5.9 | unit-test | mock stdout 缓冲超过 4 MiB 持续 6 秒 → `backpressure.jsonl` 新增一条；持续 65 秒 → 子进程被 SIGTERM 然后重试 |

---

### Requirement 6: stream-json 协议适配

**User Story:** 作为依赖 forge-loop 事件流的下游消费者（progress/runs 持久化、desktop app），我希望 stream-json 事件能被等价映射到现有 SDK message 结构，这样换芯不会让我重写消费端。

#### Acceptance Criteria

1. THE Stream_JSON_Adapter SHALL 把以下 stream-json 事件类型分类处理：
   - **业务事件（exposed）**：`system`、`assistant`、`user`、`tool_use`、`tool_result`、`result` — 映射到 `loop-types.ts` 现有 message 结构，字段语义与 agent-sdk message 等价；
   - **协议内部事件（hidden）**：`message_start`、`message_delta`、`message_stop`、`content_block_start`、`content_block_delta`、`content_block_stop`、`ping` — 仅用于 partial message 合并（AC 6.3），不向消费端下发；
   - **错误事件（special）**：`error` — 按 AC 6.6 单独处理。
2. THE Stream_JSON_Adapter SHALL 在每行解析失败时记录到 `.forge/runs/<runId>/parse-errors.jsonl`，但不中止主循环；记录字段含 `raw_line`（截断到 1 KiB）、`error_message`、`timestamp`。
3. WHILE 子进程输出 partial message（`--include-partial-messages` 开启），THE Stream_JSON_Adapter SHALL 缓存 partial 事件并在收到 `message_stop` 后合并为完整 message 再下发；按 `message.id` 去重，已下发的 message.id 再次出现时丢弃后续重复事件并记录到 `.forge/runs/<runId>/dedup.jsonl`。
4. THE Stream_JSON_Adapter SHALL 保留事件中的 `usage` 字段（`input_tokens`、`output_tokens`、`cache_creation_input_tokens`、`cache_read_input_tokens`、`cost_usd`）用于 `--max-tokens` / `--max-budget-usd` 计费；按 `message.id` 去重避免 partial 与最终 usage 双重计数；优先使用 `cost_usd`，缺失时按 token 类型分别累加（cache_read_input_tokens 不与 input_tokens 合并）；累加结果写入 `RunLimits.tokensSpent` 与 `RunLimits.costUsd`。
5. IF stream-json 事件中出现未知 `type`，THEN THE Stream_JSON_Adapter SHALL 透传该事件（向前兼容）并记录 warning 到 `.forge/runs/<runId>/unknown-events.jsonl`；已知 `type` 上的新增字段不触发 unknown 警告（forward-compat）。
6. WHEN Stream_JSON_Adapter 接收到 `type=error` 事件，THE Stream_JSON_Adapter SHALL 把事件视为 fatal API 错误（含 rate_limit、auth_failed、invalid_request 等），向 driver 抛出 iteration-failed 信号，由 Requirement 10 决定是否退避重试；error 事件本身写入 `.forge/runs/<runId>/api-errors.jsonl`。
7. THE Stream_JSON_Adapter SHALL 使用行缓冲解析 stdout：以 `\n` 为行边界、单行最大 64 MiB、行内不完整 JSON 暂存等待下一次 chunk；高水位 16 MiB / 低水位 4 MiB 触发背压（暂停 stdin 写入或向子进程发 SIGSTOP）；缓冲耗尽时恢复。
8. WHEN 子进程 stdout 关闭（EOF）AND 流中未出现 `type=result` 事件，THE Stream_JSON_Adapter SHALL 合成一条 `type=stream-truncated, run_id=<id>, last_event_type=<type>` 写入 stdout，并标记当前迭代为 failed；driver 据此按 Requirement 10 决定重试。

##### Validation Contract

| AC | Verify-By | Evidence |
|----|-----------|----------|
| 6.1 | property-based-test | 用 schema-driven 生成器随机产生 stream-json 事件 1 000 次，业务事件 adapter 输出对象通过现有 `MessageSchema` zod 校验；协议内部事件不向消费端下发；error 事件按 AC 6.6 路径处理 |
| 6.2 | unit-test | 注入残缺 JSON 行，adapter 不抛异常，`parse-errors.jsonl` 新增一条含 `raw_line`、`error_message`、`timestamp` 三字段 |
| 6.3 | unit-test | 注入 partial message + `message_stop` 序列，adapter 仅向消费端推一次完整 message；重复 `message_stop` 同 ID 时新增一条 dedup.jsonl 记录，零次重复下发 |
| 6.4 | unit-test | mock 事件中 usage 字段（含 partial 增量与最终），断言 `RunLimits.tokensSpent` 与 `costUsd` 累加正确无重复；缺失 cost_usd 时按 token 类分别累加；cache_read_input_tokens 计为独立维度 |
| 6.5 | unit-test | 注入未知 `type=foo` 事件，adapter 透传 + `unknown-events.jsonl` 新增一条；注入已知 `type=assistant` 加新字段 `thinking_blocks`，不触发 unknown 警告 |
| 6.6 | unit-test | 注入 `type=error, error.type=rate_limit` 事件 → driver 收到 iteration-failed 信号 + `api-errors.jsonl` 新增一条；按 Requirement 10.2 退避重试 |
| 6.7 | unit-test | 注入 chunk 边界切断的 JSON 行 → adapter 等待下一次 chunk 后正确合并；注入超过 64 MiB 单行 → 抛 `LineTooLargeError`；模拟缓冲超 16 MiB → 触发背压（spy `stdin.pause()` 或 `SIGSTOP`） |
| 6.8 | unit-test | mock 子进程 stdout 关闭无 `result` 事件 → adapter 合成一条 `type=stream-truncated`；driver 标记迭代 failed 并触发重试 |

---

### Requirement 7: CLI flag 兼容性

**User Story:** 作为已经写脚本依赖 `forge-loop` CLI flag 的用户，我希望 `--max-iterations`、`--max-tokens`、`--stop-when`、`--worktree`、`--resume` 在换芯后语义不变，这样我现有自动化脚本不需要改。

#### Acceptance Criteria

1. THE Forge_Loop_CLI SHALL 保留以下 flag 的字面与语义：`--max-iterations <n>`、`--max-tokens <n>`、`--stop-when <expr>`、`--worktree`（boolean）、`--resume <session-id>`、`--max-budget-usd <n>`、`--tier <light|standard|full>`、`--prevent-sleep <on|off>`、`--lang <zh|en>`、`--log-format`、`--log-level`、`--log-file`、`--sandbox`、`--force-no-hooks`、`--skills-dir`、`--agent`、`--type`、`--phase`、`--nature`、`--pua`、`--pua-task-type`。
2. WHEN 用户传入任一保留 flag，THE Forge_Loop_CLI SHALL 把它转译为子进程的等价行为：`--max-iterations` 通过外层循环计数实现；`--max-tokens` / `--max-budget-usd` 通过 `usage` 字段累加触发停止；`--stop-when` 通过 expression 评估终止；`--worktree` 通过 `worktree-manager.ts` 处理（与现路径一致）。
3. WHEN 用户传入未知 flag，THE Forge_Loop_CLI SHALL 退出码非零并在 stderr 输出 commander 标准错误信息（与现行为一致）。
4. THE Forge_Loop_CLI SHALL 不引入新的强制性 flag（无破坏性新增），新增 flag 必须有合理默认值并可不设置。
5. THE Forge_Loop_CLI SHALL 通过 `--help` 输出列出所有保留 flag，结构与现版一致（regression-test 使用 snapshot）。

##### Validation Contract

| AC | Verify-By | Evidence |
|----|-----------|----------|
| 7.1 | regression-test | snapshot 测试 `forge-loop --help` 输出，与换芯前 baseline 一致 |
| 7.2 | unit-test | 每个 flag 一个测试用例，断言 flag 解析后传给 driver 的字段值正确 |
| 7.3 | unit-test | 传 `--unknown-flag`，进程 exit code 非零、stderr 含 `unknown option` |
| 7.4 | static-check | 与 baseline 比对新增 flag 列表，每条新增 flag 必须有 default value（脚本扫描 commander 注册） |
| 7.5 | regression-test | 同上 7.1，snapshot 与 baseline 严格相等 |

---

### Requirement 8: Desktop App IPC 兼容

**User Story:** 作为 `forge-loop-desktop` 应用的用户，我希望 forge-loop 换芯后桌面应用 IPC 协议保持不变（或同步升级），这样我不会因为后端变化而看到桌面应用功能退化。

#### Acceptance Criteria

1. THE Forge_Loop_Driver SHALL 通过 forge-loop 子进程的 **stdout NDJSON 通道**（UTF-8、`\n` 分隔、单行 ≤ 1024 字节、超长行截断保留前 1024 字节，与 `apps/forge-loop-desktop/src-tauri/src/process_manager.rs::write_lines_and_emit_progress` 当前实现一致）持续输出至少以下事件类型：`forge_loop_run_started`、`iteration_start`、`iteration_end`、`progress`、`message`、`tool_use`、`tool_result`、`completion`、`run_completed`、`error`、`warning`；每条 stdout 行 SHALL 为单个 JSON 对象，至少包含字段 `event`（事件类型枚举值）、`run_id`（字符串）、`schema`（schema 版本号，整数）、`ts`（ISO-8601 时间戳）。
2. THE Forge_Loop_Driver SHALL 把 `apps/forge-loop-desktop/test/fixtures/ipc-baseline.ndjson` 视为 IPC schema 的 single-source-of-truth baseline；任何对 baseline 中已有字段的重命名、删除或类型变更 SHALL 同步更新 baseline、desktop 端解析代码、并在 `.forge/decisions/` 落档升级 ADR；新增字段不得修改 baseline 文件中已有行。
3. IF forge-loop 子进程发生 stream-json 解析失败、子进程崩溃、超时退出，THEN THE Forge_Loop_Driver SHALL 向 stdout 发出一条 `event=error` 事件，字段必须包含 `run_id`、`code`（短字符串错误码）、`message`（人类可读描述）、`fatal`（布尔，是否中止主循环）、`retryable`（布尔，是否会按 Requirement 10.2 退避重试）；当 `fatal=true` 且 `retryable=true` 表示当前迭代中止但主循环将重试，desktop 据此选择阻塞 vs 非阻塞 UI。
4. WHEN Stream_JSON_Adapter 透传未知事件类型（与 Requirement 6.5 一致）OR 子进程进入退避重试（与 Requirement 10.4 一致），THE Forge_Loop_Driver SHALL 把事件以 `event=warning, fatal=false, retryable=false` 形式上报；desktop SHALL 把 `warning` 渲染为非阻塞通知。
5. THE Forge_Loop_Driver SHALL 在每次 forge-loop 启动后、首条业务事件之前发送一帧 `event=version, schema=<n>, run_id=<id>, supported_events=[...]` 用作版本握手；schema 版本变更时 `n` 单调递增，旧版 desktop 收到不识别的高版本号 SHALL 仍可消费已知事件类型而不 crash（与 AC 8.6 forward-compat 一致）。
6. THE Forge_Loop_Driver SHALL 保证 IPC 帧的 forward-compat 契约：新增字段属于 forge-loop 的契约责任（必须可被旧 desktop 安全忽略），desktop 端 `process_manager.rs` JSON 解析路径 SHALL 对未知字段执行"忽略不报错"，未知 `event` 值降级为 `warning`，不得 panic 或终止 watcher 线程。
7. WHILE Stream_JSON_Adapter 处于 partial message 合并状态（Requirement 6.3），THE Forge_Loop_Driver SHALL 仅向 desktop 推送合并后的完整 `message` 事件，不向 desktop 转发底层 `partial`/`message_delta` 增量帧；流式 UI 的增量需求作为后续 spec 处理，不在本期范围。
8. THE Forge_Loop_Test_Suite SHALL 包含 record-replay 回归测试 `apps/forge-loop-desktop/test/ipc-compat.test.ts`：录制阶段对固定 objective 跑换芯前 forge-loop，落盘 baseline NDJSON 至 `apps/forge-loop-desktop/test/fixtures/ipc-baseline.ndjson`；回放阶段以换芯后 forge-loop 跑同 objective，逐帧比对（事件类型集合相等或为超集；baseline 中已有字段名与类型必须出现且类型匹配；允许新增字段；允许新增事件类型）。

##### Validation Contract

| AC | Verify-By | Evidence |
|----|-----------|----------|
| 8.1 | integration-test | 启动 desktop + forge-loop 跑标准 objective，捕获 stdout NDJSON 帧；每行可被 `JSON.parse` AND 包含 `event`/`run_id`/`schema`/`ts` AND `event ∈ {forge_loop_run_started, iteration_start, iteration_end, progress, message, tool_use, tool_result, completion, run_completed, error, warning, version}` |
| 8.2 | regression-test | `scripts/diff-ipc-schema.mjs` 对比 `apps/forge-loop-desktop/test/fixtures/ipc-baseline.ndjson`：删字段 / 改类型 → 退出码非零；新增字段 → 通过 |
| 8.3 | unit-test | mock 子进程退出码 137 → driver 发出一条 `event=error, fatal=true, retryable=true, run_id=<id>, code` 非空；mock 退出码 139 → `fatal=true, retryable=false`（与 Requirement 10.3 一致） |
| 8.4 | unit-test | 注入 unknown_event → IPC 收到一条 `event=warning, fatal=false`；注入退避重试 → 同样收到 `event=warning, code=subprocess-retry` |
| 8.5 | unit-test | forge-loop 启动后首条 stdout 行 `event=version`，`schema` 为正整数，`supported_events` 为 AC 8.1 列表的字符串数组；mock 旧 desktop 收到未来 schema=99 时仍能解析 `forge_loop_run_started` 等已知事件 |
| 8.6 | unit-test | desktop `process_manager.rs` 测试：注入含未知字段的 `progress` 帧、未知 `event=foo` 帧、超长 1500 字节行，watcher 线程不 panic、log 写入正常、`task-status-update` 仍发出 |
| 8.7 | unit-test | mock partial 序列 + `message_stop` → desktop 端只收到一次 `event=message`，零次 `event=partial`/`message_delta` |
| 8.8 | regression-test | `apps/forge-loop-desktop/test/ipc-compat.test.ts` 全通过；replay diff 报告显示 baseline 的事件类型集合 ⊆ 新版输出，字段名/类型在交集上完全一致 |

---

### Requirement 9: warm-query 替代

**User Story:** 作为关心冷启动延迟的用户，我希望换芯后 forge-loop 仍有等价或更优的预热能力，这样首次迭代延迟不会显著退化。

#### Acceptance Criteria

1. THE Forge_Loop_Driver SHALL 在主循环开始前发起一次预热请求，用于触发 Claude Code session 创建、模型 cold-start、credentials 校验。
2. THE Forge_Loop_Driver SHALL 通过子进程调用 `claude --print --output-format stream-json --max-turns 1` 配合极短 prompt（如 `"_"`）实现 warm-up，等价替代 `startup()`。
3. THE Forge_Loop_Driver SHALL 把 warm-up 调用的 token 与时间消耗计入 `.forge/runs/<runId>/warm-up.json`，但不计入 `--max-tokens` 配额。
4. WHEN warm-up 调用失败（exit code 非 0、超时、credentials 错误），THE Forge_Loop_Driver SHALL 中止启动并在 stderr 输出原始错误，不进入主循环。
5. THE Forge_Loop_Driver SHALL 提供 `--no-warmup` flag 关闭 warm-up（与 sandbox/CI 兼容），关闭时跳过 9.1–9.4 全部步骤。

##### Validation Contract

| AC | Verify-By | Evidence |
|----|-----------|----------|
| 9.1 | unit-test | spy spawn 调用顺序，第一次 spawn 为 warm-up（args 含 `--max-turns 1`） |
| 9.2 | unit-test | warm-up 子进程 args 严格等于规定形式 |
| 9.3 | integration-test | 一次 forge-loop 跑完，`.forge/runs/<runId>/warm-up.json` 存在且 `--max-tokens` 未被 warm-up 消耗 |
| 9.4 | unit-test | mock warm-up 退出码 1，driver 立即退出，stderr 含原始错误，主循环未启动 |
| 9.5 | unit-test | 加 `--no-warmup`，spawn 首次调用直接是主循环 prompt，非 warm-up args |

---

### Requirement 10: 错误处理与降级

**User Story:** 作为长时间跑 forge-loop 的用户，我希望子进程死锁、OOM、退出码异常时 forge-loop 能恢复或干净退出，而不是悄悄 hang 住或污染数据。

#### Acceptance Criteria

1. WHEN forge-loop 子进程在 `loop.stuckTimeoutMs`（默认 600 000ms）内无 stdout 事件，THE Forge_Loop_Driver SHALL 发送 SIGTERM；30 秒后仍未退出 SHALL 发送 SIGKILL。
2. IF 子进程在一次迭代中以非 0 退出码退出 AND 退出码 ∈ {1, 2, 137, 143}，THEN THE Forge_Loop_Driver SHALL 按指数退避（base = `DEFAULT_BACKOFF_BASE_MS` = 60_000ms）重试当前迭代，最多重试 3 次；超过则中止主循环并写入 `.forge/runs/<runId>/abort.json`。
3. WHEN 子进程退出码非以上集合（如 SIGSEGV / 未知码），THE Forge_Loop_Driver SHALL 立即中止主循环，不重试。
4. WHILE forge-loop 处于重试退避，THE Forge_Loop_Driver SHALL 向 IPC 推送 `type=warning, code=subprocess-retry, attempt=<n>` 事件，desktop 可显示。
5. THE Forge_Loop_Driver SHALL 在主循环退出前清理子进程、PID 文件、worktree（按 `decideWorktreeCleanup` 规则）、sleep-prevent 子进程；如清理失败，记录到 `.forge/runs/<runId>/cleanup-errors.jsonl` 但不阻塞退出。
6. IF workflow 在 L0 路径下因子进程异常被中断，THEN THE Forge_Subcommand_Dispatcher SHALL 把该次执行降级为 L1（与 Requirement 2.4 一致）。

##### Validation Contract

| AC | Verify-By | Evidence |
|----|-----------|----------|
| 10.1 | unit-test | mock 子进程不输出，时间快进 600s 后 SIGTERM；再 30s 后 SIGKILL（spy kill 调用） |
| 10.2 | unit-test | mock 退出码 137，driver 退避 60s/120s/240s 后中止，`abort.json` 存在 |
| 10.3 | unit-test | mock 退出码 139，driver 立即中止，无重试 |
| 10.4 | unit-test | 触发 retry，IPC frame 中含 `type=warning, code=subprocess-retry, attempt=1..3` |
| 10.5 | integration-test | kill -9 forge-loop 后再跑同 runId，pid 文件、worktree、sleep-prevent 被清理；模拟 cleanup 失败，`cleanup-errors.jsonl` 新增一条 |
| 10.6 | unit-test | mock workflow 子进程崩溃，dispatcher 产物 `methodology=workflow-then-subagent`、`l0_failure_signature=subprocess-crash` |

---

### Requirement 11: 与 config 受保护区的兼容性 跨工作包

**User Story:** 作为 Forge 项目宪法的执行者，我必须确保 workflow 的双写不破坏 frozen-zone-protection 与 Guarded_Zone 的追加语义。

#### Acceptance Criteria

1. THE Workflow_Audit_Writer SHALL 不写入 `status: locked` 的 spec、`status: approved` 的 plan、`.forge/config.md`（Frozen_Zone）。
2. THE Workflow_Audit_Writer SHALL 在 `.forge/reviews/`、`.forge/knowledge/instincts.md`、`.forge/knowledge/known-failures.md`、已发布 ADR 上仅追加内容、不删除已有内容；新 ADR 文件由 `finalizeAdr` 单独负责，workflow 不直接产生新 ADR 文件。
3. WHEN PreToolUse hook `hook-check-frozen.sh` 对 workflow 写入路径返回非零退出码，THE Workflow_Audit_Writer SHALL 中止写入并向用户报错。
4. IF workflow 检测到自己将写入 Frozen_Zone（通过路径匹配），THEN THE Workflow_Audit_Writer SHALL 主动跳过该次写入并在 `dispatch.jsonl` 标记 `frozen_zone_blocked: true`，与 Requirement 4.7 一致。
5. THE Forge_Subcommand_Dispatcher SHALL 不为工作包自身（即本特性）跳过 §2.1 TDD 与 §2.3 Verification IRON-LAW；build 阶段仍按 RED → GREEN → REFACTOR 推进。
6. THE Forge_Subcommand_Dispatcher SHALL 不在 build 阶段引入 workflow（已在调研阶段决定）；workflow 仅出现在 review/decide/learn 三个评估或合成型子命令上。

##### Validation Contract

| AC | Verify-By | Evidence |
|----|-----------|----------|
| 11.1 | property-based-test | 1 000 次随机 (target_path, action) 组合，writer 命中 Frozen_Zone 时全部抛 `FrozenZoneViolation` |
| 11.2 | unit-test | 对一个含已有 finding 的 reviews 文件追加新 finding，diff 仅含追加行，旧行 0 改动 |
| 11.3 | integration-test | mock `hook-check-frozen.sh` 退出码 1，writer 中止；exit 0 继续 |
| 11.4 | unit-test | 把 writer 目标设为 locked spec，`dispatch.jsonl` 含 `frozen_zone_blocked: true` |
| 11.5 | static-check | grep build SKILL 实现，确认未引入 `bp(`、`tengu_workflows_enabled` 等 workflow 入口 |
| 11.6 | static-check | `forge-build.md` SKILL 不引用 `workflow-fallback-ladder.md`；只有 review/decide/learn 三个 SKILL 引用 |

---

### Requirement 12: 与 §6 并发上限的兼容性（跨工作包）

**User Story:** 作为受 §6 Session_Boundary 与并发上限约束的执行者，我必须确保 workflow runtime 的 `parallel()` 与 `pipeline()` 调度遵守 `max_parallel_agents=6` 与 `review.subagent_concurrency=3`。

#### Acceptance Criteria

1. THE Workflow_Concurrency_Bridge SHALL 提供 `${CLAUDE_PLUGIN_ROOT}/workflows/lib/concurrency.js` wrapper helper，导出 `chunkedParallel(items, fn, { maxConcurrency })` 函数；所有 Forge-authored workflow 文件（包含 `multi-agent-review.js`）必须 `import` 该 helper 并通过它调度并行任务，**不得**直接调用 workflow runtime 的内置 `parallel()`；wrapper 内部把 items 切成 `chunkSize = min(items.length, maxConcurrency)` 的批，串行调用每批的 `runtime.parallel(chunk)`。
2. WHILE Forge_Subcommand_Dispatcher 处于 review L0 路径，THE Workflow_Concurrency_Bridge SHALL 把 `chunkedParallel` 的 `maxConcurrency` 参数从环境变量 `FORGE_REVIEW_CONCURRENCY`（默认 3）读取；当 review 内 4 个 dimension 通过 `chunkedParallel` 调度时，wrapper SHALL 切为 [3, 1] 两批，确保任意时刻并发 ≤ 3。
3. THE Forge_Subcommand_Dispatcher SHALL 在 spawn workflow 前执行三步并发可控性探测：
   - (a) 检查 `process.env.CLAUDE_CODE_WORKFLOWS === '1'`；
   - (b) 检查 `${CLAUDE_PLUGIN_ROOT}/workflows/lib/concurrency.js` 存在且 `node --check` 通过；
   - (c) 检查目标 workflow 文件源码包含 `from './lib/concurrency'` 或 `from './lib/concurrency.js'` 字符串（grep 校验）。
   IF 任一步失败，THEN Forge_Subcommand_Dispatcher SHALL 把 workflow 视为不受控并降级到 L1 subagent 编排，AND 在 `dispatch.jsonl` 标注 `methodology=concurrency-cap-unenforced`、`concurrency_probe_failure=<step_a|step_b|step_c>`。
4. THE Forge_Subcommand_Dispatcher SHALL 在 spawn 每个 workflow 前生成 `workflow_state_id = wsid_<runId>_<subcommand>_<utc-ms>` 写入 `dispatch.jsonl`；不同子命令调用产生的 `workflow_state_id` 必须互不相同；workflow 内部不得通过任何 runtime 全局变量、文件、env 跨子命令传递状态，每次必须从 `.forge/` 文件系统重建上下文（与 §6 Session_Boundary 一致）。
5. WHEN Forge_Subcommand_Dispatcher 在 stream-json 输出层观察到 `tool_result` 或 `result` 事件中 `status_code=429` 或 `subtype=rate_limit`，THE Workflow_Concurrency_Bridge SHALL 按 §6 降级阶梯调整后续 `chunkedParallel` 调用的 `maxConcurrency`：第 1 次 429 → 减半（向下取整）、第 2 次 → 设为 2、第 3 次 → 设为 1（串行）；调整通过新 env `FORGE_MAX_PARALLEL_AGENTS_RUNTIME` 注入下一个子进程；本次 `/forge` 子命令结束后清零，下次调用恢复默认值。
6. THE Forge_Subcommand_Dispatcher SHALL 通过环境变量传递并发配置到 workflow 子进程：`FORGE_MAX_PARALLEL_AGENTS=<.forge/config.md::max_parallel_agents>`、`FORGE_REVIEW_CONCURRENCY=<.forge/config.md::review.subagent_concurrency>`、`FORGE_MAX_PARALLEL_AGENTS_RUNTIME=<动态降级值>`；workflow 不得直接读 `.forge/config.md`，仅通过这些 env 获取并发上限；helper `chunkedParallel` 优先读 `FORGE_MAX_PARALLEL_AGENTS_RUNTIME`，缺失时回落到 `FORGE_MAX_PARALLEL_AGENTS`。
7. WHEN Workflow_Concurrency_Bridge 触发降级，THE Workflow_Concurrency_Bridge SHALL 向 `.forge/knowledge/tool-health.md` 追加（append-only）一条记录：`<timestamp> · <subcommand> · 429-degrade · old=<n> new=<m> probe=<a|b|c|none>`；`tool-health.md` 属于 Open_Zone（与 `.forge/config.md` 现有声明一致），允许追加；写入使用 advisory file lock（`flock`），并发安全。

##### Validation Contract

| AC | Verify-By | Evidence |
|----|-----------|----------|
| 12.1 | unit-test | mock workflow 文件 import `concurrency.js`，注入 1..20 个并发任务 1 000 次，并发度始终 ≤ `FORGE_MAX_PARALLEL_AGENTS`；grep workflow 文件不得包含直接 `runtime.parallel(` 调用 |
| 12.2 | integration-test | 设 `FORGE_REVIEW_CONCURRENCY=3` 跑 review L0，watch wrapper 调用序列：第 1 批 3 个 dimension、第 2 批 1 个 dimension；任意时刻并发 ≤ 3 |
| 12.3 | unit-test | 三步探测分别 mock 失败：(a) env 缺失 → `concurrency_probe_failure=step_a`；(b) helper 文件不存在 → `step_b`；(c) workflow 源码不含 import 字符串 → `step_c`；三种情况均走 L1 |
| 12.4 | property-based-test | 跨子命令 1 000 次随机调用 review/decide/learn，dispatch.jsonl 中相邻 `workflow_state_id` 完全不同；workflow 子进程间通过 env 探测全局变量泄露 → 0 次 |
| 12.5 | integration-test | 注入连续 3 次 429 事件序列：第 1 次 6→3、第 2 次 3→2、第 3 次 2→1；每次 spawn 子进程的 env `FORGE_MAX_PARALLEL_AGENTS_RUNTIME` 值为期望降级值；`tool-health.md` 新增 3 条记录 |
| 12.6 | unit-test | mock 子进程 spawn，断言 env 含 `FORGE_MAX_PARALLEL_AGENTS=6, FORGE_REVIEW_CONCURRENCY=3`；workflow 文件 grep 不到 `readFileSync.*config\.md` |
| 12.7 | unit-test | 并发模拟 5 个进程同时 append `tool-health.md`，最终文件每条记录完整、无交错；首条记录 prefix 不变（assert(new.startswith(old))）|

---

### Requirement 13: 市场分发回归测试 跨工作包

**User Story:** 作为通过 marketplace 安装的下游用户，我希望 workflows 字段加入后 hooks、commands、mcp、agents 都仍然能被 Claude Code 正确发现，这样升级是无破坏的。

#### Acceptance Criteria

1. THE Forge_Plugin_Validator SHALL 在 `test/plugin-manifest.test.ts` 增加用例覆盖 `workflows` 字段：字段存在、路径相对、目录可解、目录下至少一个 `.js` 可被 esbuild parse。
2. THE Forge_Plugin_Validator SHALL 保留现有 12 条契约测试（hooks 路径展开、mcpServers、commands 数量），加入 workflows 后总数 ≥ 13 条。
3. THE Forge_Plugin_Validator SHALL 通过新增 `test/plugin-marketplace-install.test.ts` 模拟从 `marketplace.json` 走完整安装流程并断言 `multi-agent-review` workflow 被发现。
4. THE Forge_CI_Pipeline SHALL 在 `plugin-validate` job 中调用上述测试，任一失败即阻断 merge。
5. WHEN 升级 Claude Code 主版本，THE Forge_CI_Pipeline SHALL 触发 cross-version 回归（按 ADR-0005 §Cross-Version Regression 模式），断言 `workflow load failed` 不出现在最近 100 次 CI 日志中。

##### Validation Contract

| AC | Verify-By | Evidence |
|----|-----------|----------|
| 13.1 | unit-test | `test/plugin-manifest.test.ts` 新增的 4 条用例全通过 |
| 13.2 | static-check | 测试用例计数器 ≥ 13 |
| 13.3 | integration-test | `test/plugin-marketplace-install.test.ts` 通过；模拟安装目录含 `workflows/multi-agent-review.js` |
| 13.4 | regression-test | CI `plugin-validate` job 在故意删除 `workflows/` 目录的分支上 fail |
| 13.5 | regression-test | CI 日志查询工具反扫近 100 次构建，0 次 `workflow load failed` |

---

## Out of Scope（非目标）

本特性**不包含**以下事项：

1. **不动 build / TDD 主循环**：`/forge build` 不引入 workflow，仍由现有 SKILL + 主 agent 单线推进 RED→GREEN→REFACTOR。原因：workflow 的 `parallel()` 会破坏原子提交与 §2.3 Verification IRON-LAW。
2. **不引入新 workflow**：`sprint-audit`、`knowledge-gc`、`evolution-rule-promote` 等候选 workflow **不在本期范围**；本期只迁移并打通 `multi-agent-review`。新 workflow 须另立 spec。
3. **不改 ADR supersession 流程**：`finalizeAdr` 与 supersession 链路保持现状，workflow 不直接产出 ADR 文件，决策 workflow 只产出 `.forge/decisions/<date>-<topic>.md`（Open_Zone 转录），ADR 仍由 decide 后处理生成。
4. **不替换 `@anthropic-ai/claude-agent-sdk` 在测试中的使用**：单测使用的 mock 接口不受换芯影响；type-only import 允许保留。
5. **不引入新强制 CLI flag**：本期严格保持 `forge-loop` CLI 字面兼容；新 flag（如 `--no-warmup`）必须有可不设置的默认值。
6. **不变更 hooks、mcp、agents 注册结构**：除新增 `workflows` 字段外，`plugin.json` 不动。
7. **不改 review/decide/learn 之外子命令的 fallback ladder**：plan/build/test/ship/spec/loop/status/resume/abort/debug 不受本特性影响。
8. **不为 GLM 等第三方模型后端新增 workflow 路径**：第三方模型缺少 workflow runtime 时直接走 L1，本特性不为此特化。

## Risks & Fallbacks（风险与降级）

### R1：workflow runtime 不可用

**触发条件**：

- `tengu_workflows_enabled` Statsig gate 关闭
- `CLAUDE_CODE_WORKFLOWS` 环境变量未设置
- 用户切换到 GLM 等第三方模型后端
- 用户使用旧版 Claude Code（< 支持 workflows 的版本）

**降级路径**：Forge_Subcommand_Dispatcher 自动选择 L1（subagent teams），由 ADR-0005 内部 ladder 继续 L1→L2→L3。`dispatch.jsonl` 标注 `chosen_level=L1, gate_enabled=false`，可用于事后审计。

**用户可见行为**：交互模式下无可感知差异，结构化产物仍写入 `.forge/reviews/` 等审计区；缺失的是 Claude Code 平台 `/workflows` 历史中的此次记录。

### R2：workflow runtime 抛异常

**触发条件**：`bp()` 内部错误、schema 校验失败、aside 中的 subagent 调用全失败。

**降级路径**：Requirement 2.4 — 自动降级至 L1，产物 `methodology=workflow-then-subagent`、`l0_failure_signature` 含原始异常。L1 仍按 ADR-0005 ladder 推进。

### R3：CLI 子进程死锁 / 超时

**触发条件**：`claude --print` 子进程长期无 stdout、Anthropic API 网络挂起、stream-json 解析卡死。

**降级路径**：Requirement 10.1 — 600s 静默超时 → SIGTERM → 30s 后 SIGKILL；当前迭代按 Requirement 10.2 退避重试（最多 3 次），仍失败则中止主循环并写 `abort.json`。

### R4：CLI 子进程退出码异常

**触发条件**：SIGSEGV、OOM kill (137)、SIGTERM (143)、未知非 0 退出码。

**降级路径**：

- 退出码 ∈ {1, 2, 137, 143}：指数退避重试 ≤ 3 次（Requirement 10.2）。
- 退出码 ∉ 上述集合：立即中止，不重试（Requirement 10.3），保留 PID 文件与 worktree 供 `forge-resume` 恢复。

### R5：插件升级破坏 hooks 路径解析

**触发条件**：新增 `workflows` 字段后某些 Claude Code 版本错误地把 `workflows` 当 hooks 解析、或路径展开冲突。

**降级路径**：Requirement 13 的 cross-version 回归测试在 CI 中常态运行；若 fail，CI 阻断 merge 并把对应 CC 版本写入 `.forge/knowledge/tool-health.md` 标注 `incompatible`。

### R6：双写命中 Frozen_Zone

**触发条件**：用户配置错误把 review 输出路径指向 locked spec / `config.md` / approved plan。

**降级路径**：Requirement 4.7 / 11.4 — writer 主动 reject、`dispatch.jsonl` 标记 `frozen_zone_blocked: true`、向用户报错并保留原 frozen 文件不变。

---

## 附录：合并来源

本 spec 于 2026-05-29 合并了以下 spec 的需求内容。被合并者的原 requirements.md 保留在 `.kiro/specs/_archived/` 中供历史参考。

### 来源 1: workflows-integration-wiring

原 spec 聚焦于"接入"——将前置 spec 已实现的模块（WorkflowDispatcher、WorkflowAuditWriter、IpcEmitter）连接到生产代码的实际调用路径上。包含 7 个 Requirement：
1. WorkflowDispatcher 接入到 review/decide/learn SKILL 入口（L0 路径激活）
2. WorkflowAuditWriter 接入到 dispatcher 与 hook 校验（审计双写）
3. 剩余 7 个 IPC 事件桥接到 SdkDriver
4. stderr 同步到 LogSink
5. review L0 [3,1] 切批端到端验证
6. forge-ship 通过 status.md 三字段判断阻断
7. WorkflowDispatcher dispatch.jsonl 14 字段自动填充

关键差异：wiring spec 是"骨架已写但调用方未接入"的具体实现工作，本 spec（workflows-integration）定义了整体架构。

### 来源 2: workflows-integration-resilience

原 spec 聚焦于"运行时韧性"——长时间跑 forge-loop 时的容错与恢复能力。包含 8 个 Requirement：
1. stuck timeout 检测与信号链（SIGTERM → 30s → SIGKILL）
2. 退出码分类退避重试主循环（指数退避 ≤3 次）
3. stdout 背压检测与高低水位
4. 429 速率限制降级阶梯（6→3→2→1）
5. 主循环退出 cleanup 链
6. Desktop IPC record-replay 回归
7. 1000 次 property-based 穷举测试集
8. CI 跨版本回归与 100-build 扫描

关键差异：resilience spec 处理生产环境故障场景，本 spec 定义了基础架构。两者互补。
