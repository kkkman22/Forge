---
status: completed
feature: review-comment-bitbucket
layout: requirements
created: 2026-05-23
tier: standard
---
# Requirements Document

## Introduction

本需求文档自 `.tinkerman/specs/review-comment-bitbucket/design.md` 反向派生，其权威决策背景见 `.tinkerman/decisions/2026-05-23-review-inline-comment-channel.md`（4 个开放问题已锁定，待转 ADR-0006）。本特性为 Forge 在 `/forge review` 产出 `.tinkerman/reviews/<run-id>.md` 之后增加一层独立的 Bitbucket 投递通道：把 P0/P1 finding 以"PR Task + inline comment"双层形式投递、把 P2 finding 以单层 inline comment 形式投递，并提供平台前置门禁、稳定幂等机制与跨轮次对账能力。本通道不修改 ADR-0005 fallback ladder，不替代 ship gate 的阻断判定，且**仅支持 Bitbucket**（决策记录 §3.3 A3）。所有验收标准遵循 EARS 句式，用于驱动 design 中已列出的 27 条 correctness property 的反向需求溯源。

## Glossary

- **Forge framework**：本仓库提供的开发流程框架，定义于 `AGENTS.md` 与 `.tinkerman/`。
- **Review markdown**：`.tinkerman/reviews/<run-id>.md`，由 `/forge review` 输出，是 ship gate 与本通道的唯一 source of truth。
- **Finding**：review markdown 中的单条评审记录，含 `priority` / `file_path` / `line_number` / `finding_type` / `message` / 可选 `suggestion` / `source_layer`。
- **Priority**：finding 严重度等级，`P0` / `P1` / `P2` / `P3` 之一，定义见 `AGENTS.md §3.3`。
- **Platform_Gate**：决定本通道在当前仓库是否启动的纯函数门禁组件，输出 `{ skip: false }` 或 `{ skip: true, reason }`。
- **Platform_Override**：`.tinkerman/config.md` 中的 `review.comment_channel.platform_override`，取值为 `auto` / `bitbucket` / `none`。
- **MCP_Base_URL**：`bitbucket` MCP power 注入的 `BITBUCKET_BASE_URL`，用于与 git remote URL 做同源比较。
- **Selected_Remote_URL**：当前仓库存在多个 git remote 时由 `Platform_Gate` 按固定优先级选定的唯一 remote URL，作为后续 host 比对的输入；可能为 `null`。
- **Same_Host**：两个 URL 的 host（含 port、IPv6 字面量去括号且小写归一化、忽略 scheme / path / query / fragment、忽略 trailing slash、大小写无关）相等的判定。
- **Forge_Marker**：嵌入到 PR Task / inline comment 文本末尾的 HTML 注释，形如 `<!-- forge-review:hash=<12 位十六进制> -->`，用于幂等识别 Forge 创建的资源。
- **Finding_Hash**：基于 `file_path` + `line_number` + `finding_type` + `message[0..100]` 计算的 sha256 截断到 12 位十六进制的稳定指纹，字段间以 `U+0000` 作为分隔符。
- **Reconciler**：纯函数对账组件，输入当前 finding 集合与历史 task / comment 集合，输出 `ActionPlan`。
- **ActionPlan**：对账输出的动作集合，含 `creates` / `dones` / `reopens` / `skips` 与 `has_p0_p1` 标志。
- **Action_Create / Action_Done / Action_Reopen / Action_Skip**：ActionPlan 中的四类动作种类。
- **Latest_Task**：同一 marker_hash 对应历史多条 PR Task 时，按 `max(task_id)` 选定的那一条；其状态作为对账判定的唯一来源。
- **Orphan_Comment**：在非 `pr-task` 策略下，inline comment 存在但对应 marker_hash 的 PR Task 缺失的历史资源；本通道作 `Action_Skip` 处理并打 `orphan-comment` 原因标签。
- **Auto_Reconcile_Resolved**：`.tinkerman/config.md` 的 `auto_reconcile_resolved` 配置项，控制对历史 OPEN task 在 finding 缺失时是否自动 done。
- **Auto_Reopen_Regressed**：`.tinkerman/config.md` 的 `auto_reopen_regressed` 配置项，控制对历史 RESOLVED task 在 finding 仍存在时是否自动 reopen。
- **Post_Channel**：本特性整体——把 finding 投递到 Bitbucket PR 的独立交付层。
- **Forge_Resource**：仅指由 Forge 创建、可通过 Forge_Marker 识别的 PR Task 与 inline comment；不含人类直接创建的资源。
- **Run_Markdown**：单次 review run 对应的 `.tinkerman/reviews/<run-id>.md` 文件。
- **Run_Markdown_Append_Mode**：`.tinkerman/reviews/` 目录受保护，本通道对其下文件只允许追加（append-only），禁止覆盖、截断、重写。
- **Tool_Health_Counter**：`.tinkerman/knowledge/tool-health.md` 中按 `reason` 维护的独立计数器，用于检测配置漂移与运行时异常分布。
- **Skip_Trace**：`.tinkerman/findings/comment-channel-skipped-<date>.md` 与 `.tinkerman/knowledge/tool-health.md` 中累计的 skip 留痕。

## Out of Scope

以下内容显式不在本特性范围内：

- **P3 finding 投递**：P3 finding 只写入 review markdown，不创建 PR Task、不创建 inline comment、不影响 `set_review_status`。`p3_strategy` 字段保留供未来扩展，但本特性接受的唯一合法值为 `none`。
- **GitHub / GitLab / Gitea 平台支持**：本特性 SKILL 命名锁定 `review-comment-bitbucket`，不抽象 platform layer。未来其它平台支持应另开独立 SKILL。
- **Claude Code SDK 修改**：Claude Code 官方 `/code-review --comment` 锁死 GitHub 工具链，本特性不参与上游修复。
- **ADR-0005 fallback ladder 行为修改**：fallback ladder 行为不动，本通道作为其后的独立交付层附加。
- **Ship gate 阻断逻辑修改**：ship gate 仍以 review markdown 为 source of truth，`set_review_status(request_changes)` 仅作协作信号。
- **PR Task 删除与 comment-task 互转**：本特性不调用 `delete_pr_task` 与 `convert_pr_item`（决策记录 §3.3 A2 决定保留历史）。
- **Review markdown schema 重构**：本特性假设 review markdown 已含解析所需字段，若 schema 不足由独立 spec 补强。
- **MCP 调用本地重试**：单条 MCP 工具调用因限流 / 临时不可用 / 网络异常等可重试类错误失败时，本通道不在本次 run 内重试，由下一次 review run 的 `Reconciler` 自动补齐。

## Requirements

### Requirement 1: 平台前置门禁

**User Story:** As a Forge framework 使用者, I want 本通道在非 Bitbucket 仓库或配置不一致时静默跳过, so that 在 GitHub / GitLab / 内网镜像等场景下运行 `/forge ship --post-comments` 不会向错误平台发评论或 fatal 报错。

#### Acceptance Criteria

1. WHERE 选定的 remote URL 含 `bitbucket.` 子域 AND `Platform_Override` 取值为 `auto` AND `bitbucket` MCP power 已配置 AND 选定的 remote URL 与 `MCP_Base_URL` 满足 `Same_Host`, THE `Platform_Gate` SHALL 返回 `{ skip: false }` 并允许 `Post_Channel` 启动。
2. WHERE 选定的 remote URL 含 `bitbucket.` 子域 AND `Platform_Override` 取值为 `auto` AND `bitbucket` MCP power 已配置 AND 选定的 remote URL 与 `MCP_Base_URL` 不满足 `Same_Host`, THE `Platform_Gate` SHALL 返回 `{ skip: true, reason: 'mcp-base-url-mismatch' }`。
3. WHERE 选定的 remote URL 含 `bitbucket.` 子域 AND `Platform_Override` 取值为 `auto` AND `bitbucket` MCP power 未配置, THE `Platform_Gate` SHALL 返回 `{ skip: true, reason: 'mcp-not-configured' }`。
4. WHERE (选定的 remote URL 不含 `bitbucket.` 子域 OR 选定的 remote URL 为 `null` OR 选定的 remote URL 解析失败) AND `Platform_Override` 取值为 `auto`, THE `Platform_Gate` SHALL 返回 `{ skip: true, reason: 'platform-not-bitbucket' }` 且 SHALL NOT 因 MCP 配置状态改变此结论。
5. WHERE `Platform_Override` 取值为 `bitbucket` AND `bitbucket` MCP power 已配置 AND 选定的 remote URL 与 `MCP_Base_URL` 满足 `Same_Host`, THE `Platform_Gate` SHALL 返回 `{ skip: false }` 且 SHALL NOT 因选定的 remote URL 是否含 `bitbucket.` 子域改变此结论。
6. WHERE `Platform_Override` 取值为 `bitbucket` AND `bitbucket` MCP power 已配置 AND (选定的 remote URL 为 `null` OR 选定的 remote URL 解析失败 OR 选定的 remote URL 与 `MCP_Base_URL` 不满足 `Same_Host`), THE `Platform_Gate` SHALL 返回 `{ skip: true, reason: 'mcp-base-url-mismatch' }`。
7. WHERE `Platform_Override` 取值为 `bitbucket` AND `bitbucket` MCP power 未配置, THE `Platform_Gate` SHALL 返回 `{ skip: true, reason: 'override-but-mcp-missing' }`。
8. WHERE `Platform_Override` 取值为 `none`, THE `Platform_Gate` SHALL 返回 `{ skip: true, reason: 'platform-disabled-by-config' }` 且 SHALL NOT 因选定的 remote URL 与 MCP 配置状态改变此结论。
9. WHEN `Platform_Gate` 比较任意 host 字符串, THE `Platform_Gate` SHALL 接受 SCP-style URL `git@<host>:<path>` 形式、忽略 scheme / path / query / fragment 字段、去除尾部 trailing slash、并以大小写无关方式比较 host 部分。
10. WHEN `Platform_Gate` 判定两个 URL 是否满足 `Same_Host`, THE `Platform_Gate` SHALL 在比较时包含 port、对 IPv6 字面量去除外层方括号并归一化为小写、并在 host 不一致时返回 `mcp-base-url-mismatch` 跳过原因。
11. WHEN 当前仓库存在多个 git remote, THE `Platform_Gate` SHALL 按 `origin` > PR upstream > 首个与 `MCP_Base_URL` 满足 `Same_Host` 的 remote > `null` 的优先级选定唯一的 `Selected_Remote_URL` 作为后续判定输入。

### Requirement 2: P0/P1/P2 finding 双层投递

**User Story:** As a Forge framework 使用者, I want 高优先级 finding 在 PR 上以 PR Task 显式占据"待办列表"且配套精确行级诊断, P2 finding 以纯 inline comment 提示, so that 我打开 PR 一眼能识别"必须修"的项并精确跳到出错行。

#### Acceptance Criteria

1. WHEN 当前 review run 中存在 priority 为 `P0` 或 `P1` 的 finding AND `Platform_Gate` 返回 `{ skip: false }` AND `p0_p1_strategy` 取值为 `both`, THE `Post_Channel` SHALL 为每个唯一的 `Finding_Hash` 恰好创建一个 PR Task 并恰好创建一个 inline comment 且 SHALL NOT 在同一次 run 中对同一 `Finding_Hash` 重复创建。
2. WHEN 当前 review run 中存在 priority 为 `P2` 的 finding AND `Platform_Gate` 返回 `{ skip: false }` AND `p2_strategy` 取值为 `inline`, THE `Post_Channel` SHALL 为每个唯一的 `Finding_Hash` 恰好创建一个 inline comment 且 SHALL NOT 创建 PR Task 且 SHALL NOT 在同一次 run 中对同一 `Finding_Hash` 重复创建。
3. WHILE `p2_strategy` 取值为 `none`, THE `Post_Channel` SHALL NOT 为 priority 为 `P2` 的 finding 创建任何 PR Task 或 inline comment。
4. WHEN review markdown 中存在 priority 为 `P3` 的 finding, THE `Post_Channel` SHALL NOT 为该 finding 创建 PR Task 或 inline comment 且 SHALL NOT 因该 finding 调用 `set_review_status`。
5. WHEN `Post_Channel` 在一次 run 中调用 `set_review_status`, THE `Post_Channel` SHALL 在 `comment` 入参中同时包含 `P0=<非负整数>`、`P1=<非负整数>`、`run=<run-id>` 三段子串 AND SHALL 在 `creates` / `reopens` / `dones` 三个集合均为空但当前 review run 仍存在 P0 或 P1 finding 时仍调用 `set_review_status` 以反映 P0/P1 仍存在。
6. WHEN 当前 review run 不存在任何 priority 为 `P0` 或 `P1` 的 finding, THE `Post_Channel` SHALL NOT 调用 `set_review_status`。
7. WHILE `p0_p1_strategy` 取值为 `pr-task`, THE `Post_Channel` SHALL 为每个唯一的 `Finding_Hash` 恰好创建一个 PR Task 且 SHALL NOT 创建 inline comment 且 SHALL NOT 在同一次 run 中对同一 `Finding_Hash` 重复创建。
8. WHILE `p0_p1_strategy` 取值为 `inline-only`, THE `Post_Channel` SHALL 为每个唯一的 `Finding_Hash` 恰好创建一个 inline comment 且 SHALL NOT 创建 PR Task 且 SHALL NOT 在同一次 run 中对同一 `Finding_Hash` 重复创建。
9. WHEN `Post_Channel` 执行 `ActionPlan`, THE `Post_Channel` SHALL 按以下顺序调用 MCP 工具：先 P0/P1 的 PR Task + inline comment 创建（含 `Action_Reopen` 副产品评论），再 P2 的 inline comment 创建，最后在需要时调用 `set_review_status`。

### Requirement 3: Finding 文本格式化

**User Story:** As a Forge framework 使用者, I want PR Task 与 inline comment 的文本格式稳定可机器识别且对人类友好, so that 幂等机制可靠工作且开发者能在 PR 界面快速理解 finding。

#### Acceptance Criteria

1. WHEN `format` 模块为任意 finding 渲染 `comment_text`, THE `format` 模块 SHALL 按以下顺序输出文本：标签头 `[Forge <P0|P1|P2> · <source_layer>]` → 一行空行 → `finding.message` → 可选 `suggestion` 代码块 → 一行空行 → `_review run: <run_id>_` 引用行 → 末尾 `Forge_Marker`，使 `text.endsWith(marker)` 为真。
2. WHEN `format` 模块为任意 finding 渲染 `task_text` AND `task_text` 非空字符串, THE `format` 模块 SHALL 把 `Forge_Marker` 放在 `task_text` 的尾部使 `text.endsWith(marker)` 为真。
3. WHEN finding 的 priority 为 `P2`, THE `format` 模块 SHALL 把该 finding 的 `task_text` 输出为空字符串。
4. WHEN finding 的 `suggestion` 字段为非空字符串, THE `format` 模块 SHALL 在 `comment_text` 中包含一个以三反引号 `suggestion` 开始、以三反引号结束的代码块且块内文本与 `finding.suggestion` 完全相等 AND 当 finding 的 `suggestion_end_line` 字段非 `null` 时 SHALL 把该字段透传到对应 `add_comment` 调用的 `suggestion_end_line` 入参。
5. WHEN `format` 模块为 P0 或 P1 finding 渲染 `task_text`, THE `format` 模块 SHALL 输出第一行不含换行符的单行 task title 且 SHALL 在该首行包含文件位置 `<file_path>:<line_number>` 且 SHALL 把整个 `task_text` 长度截断到 200 字符以内 AND 当截断发生时 SHALL 保留 `[Forge P0]` 或 `[Forge P1]` 前缀以及尾部完整的 `Forge_Marker`。
6. IF finding 的 `message` 字段中含有三反引号子串, THEN THE `format` 模块 SHALL 在渲染 `comment_text` 时改用四反引号围栏包裹包含三反引号的内容并保证内层三反引号不与外层围栏冲突。
7. WHEN `format` 模块为任意 hash 渲染 `done_comment_text`, THE `format` 模块 SHALL 输出固定文案 `Forge auto-resolved (no longer present in review <run_id>).` 并在末尾追加 `Forge_Marker`。
8. WHEN `format` 模块为任意 hash 渲染 `reopen_comment_text`, THE `format` 模块 SHALL 输出固定文案 `Forge re-opened (still present in review <run_id>).` 并在末尾追加 `Forge_Marker`。

### Requirement 4: 稳定幂等机制

**User Story:** As a Forge framework 使用者, I want 同一 finding 在多次重复 review 中产生稳定的指纹, so that Forge 不会在每次重评审时重复创建 PR Task / comment 也不会因 message 文末措辞调整而失效。

#### Acceptance Criteria

1. WHEN 给定任意 finding `f`, THE `Finding_Hash` 函数 SHALL 按 `sha256(f.file_path + U+0000 + f.line_number + U+0000 + f.finding_type + U+0000 + f.message[0..100]).slice(0,12)` 计算并返回 12 位十六进制字符串，且 SHALL 使用 `U+0000` 作为字段分隔符以消除字段拼接歧义；对 `f` 与 `f` 的深拷贝 SHALL 返回完全相同的 hash 值。
2. WHEN 两个 finding 的 `file_path` / `line_number` / `finding_type` 字段逐字节相等 AND 两者 `message` 字段在前 100 字符之内逐字节相等, THE `Finding_Hash` 函数 SHALL 对它们返回相同的 hash 值，且 SHALL NOT 因 `message` 第 100 字符之后的差异返回不同 hash。
3. WHEN `Finding_Hash` 函数处理 `file_path` 字段, THE `Finding_Hash` 函数 SHALL 保留 `file_path` 的原始大小写、不归一化路径分隔符、不解析符号链接、不展开相对路径，与 Linux 文件系统语义一致。
4. WHEN 任意 hash `h` 通过 `buildMarker(prefix, h)` 注入到 marker 字符串 AND 该 marker 字符串作为输入传给 `extractMarker` 配以同一 `prefix`, THE marker 工具集 SHALL 以正则 `/<!--\s*([\w-]+):hash=([a-f0-9]{12})\s*-->/` 提取并满足 `extractMarker(buildMarker(prefix, h), prefix) === h`。
5. THE `Finding_Hash` 函数 SHALL 输出长度恒为 12 且仅包含 `[a-f0-9]` 字符的字符串。
6. IF `extractMarker` 输入文本中匹配到的 prefix 与传入的 `prefix` 不一致 OR 文本中无匹配, THEN THE marker 工具集 SHALL 返回 `null` 且 SHALL NOT 抛出异常。
7. WHEN `extractMarker` 在文本中扫描 marker, THE marker 工具集 SHALL 仅承认位于文本末尾或物理行末尾且不在三反引号围栏代码块内的 marker；位于其它位置（含被三反引号围栏包裹的代码块内部）的疑似 marker SHALL 被忽略。

### Requirement 5: 跨轮次对账与冲突兜底

**User Story:** As a Forge framework 使用者, I want Forge 在每次重评审时按当前 finding 集合与历史 PR Task / comment 自动对账, so that 已修复的 finding 自动关闭、新增的 finding 自动创建、被开发者糊弄关闭但仍存在的 finding 自动重开。

#### Acceptance Criteria

1. WHILE `Auto_Reconcile_Resolved` 取值为 `true`, IF 历史存在带 `Forge_Marker` 的 PR Task 集合中至少一条 marker_hash 不在当前 finding 集合中, THEN THE `Reconciler` SHALL 对同一 marker_hash 的多条 task 取 `max(task_id)` 选定 `Latest_Task`，仅在 `Latest_Task` 状态为 `OPEN` 时把 `Action_Done` 加入 `ActionPlan.dones` 并附带 `Latest_Task` 的 `task_id`，且 SHALL NOT 把非 `Latest_Task` 的其它 `task_id` 写入任何动作集合。
2. WHEN 当前 finding 集合中存在 hash 为 `h` 的 finding AND 历史 PR Task 与 inline comment 集合中均不存在带 `Forge_Marker` 且 marker_hash 等于 `h` 的资源, THE `Reconciler` SHALL 把 `Action_Create` 加入 `ActionPlan.creates` 并携带该 finding；WHILE `p0_p1_strategy` 取值为 `pr-task` 且该 finding 的 priority 为 `P0` 或 `P1`, THE `Reconciler` SHALL 仅以历史 PR Task 的 marker_hash 集合作为存在性判定依据，不参考 inline comment 集合。
3. WHILE `Auto_Reopen_Regressed` 取值为 `true`, IF 历史存在带 `Forge_Marker` 的 PR Task 集合中至少一条 marker_hash 仍在当前 finding 集合中, THEN THE `Reconciler` SHALL 对同一 marker_hash 的多条 task 取 `max(task_id)` 选定 `Latest_Task`，仅在 `Latest_Task` 状态为 `RESOLVED` 时把 `Action_Reopen` 加入 `ActionPlan.reopens` 并附带 `Latest_Task` 的 `task_id`，且 SHALL NOT 把非 `Latest_Task` 的其它 `task_id` 写入任何动作集合。
4. THE `Reconciler` SHALL 保证同一 marker_hash 在 `ActionPlan.creates` / `ActionPlan.dones` / `ActionPlan.reopens` 三个集合中至多出现一次。
5. WHILE `Auto_Reconcile_Resolved` 取值为 `false`, THE `Reconciler` SHALL 输出空数组作为 `ActionPlan.dones`。
6. WHILE `Auto_Reopen_Regressed` 取值为 `false`, IF 历史存在带 `Forge_Marker` 的 PR Task 集合中至少一条 marker_hash 仍在当前 finding 集合中且对应 `Latest_Task` 状态为 `RESOLVED`, THEN THE `Reconciler` SHALL 把 `Action_Skip` 加入 `ActionPlan.skips` 而不是 `ActionPlan.reopens`、SHALL 输出空数组作为 `ActionPlan.reopens`、并在 skip 元数据中记录 `Latest_Task` 的 `task_id` 且 SHALL NOT 把非 `Latest_Task` 的其它 `task_id` 写入任何动作集合。
7. THE `Reconciler` SHALL 把 `ActionPlan.has_p0_p1` 设为 `true` 当且仅当当前 finding 集合中存在至少一个 priority 为 `P0` 或 `P1` 的 finding。
8. WHEN 历史 PR Task 或 inline comment 集合中包含未携带 `Forge_Marker` 的资源（即非 `Forge_Resource`）, THE `Reconciler` SHALL NOT 把这些资源的 id 写入 `ActionPlan` 的任何动作集合。
9. WHILE `p0_p1_strategy` 取值不等于 `pr-task`, IF 当前 finding 集合中存在 hash 为 `h` 的 P0 或 P1 finding AND 历史不存在 marker_hash 等于 `h` 的 PR Task BUT 历史存在 marker_hash 等于 `h` 的 inline comment, THEN THE `Reconciler` SHALL 把 `Action_Skip` 加入 `ActionPlan.skips` 并在 skip 元数据中打 `Orphan_Comment` 原因标签。
10. WHEN `Post_Channel` 执行任意 `Action_Reopen`, THE `Post_Channel` SHALL 在该 task 状态翻为 `OPEN` 之后调用 `add_comment` 写入 `reopen_comment_text` 并以 `parent_comment_id` 把该 comment 挂在原 inline comment 之下。
11. WHEN `Post_Channel` 执行任意 `Action_Done`, THE `Post_Channel` SHALL 在该 task 状态翻为 `RESOLVED` 之后调用 `add_comment` 写入 `done_comment_text` 并以 `parent_comment_id` 把该 comment 挂在原 inline comment 之下。

### Requirement 6: 配置与 CLI 优先级

**User Story:** As a Forge framework 使用者, I want 通过 `.tinkerman/config.md` 设定团队默认行为并允许 CLI flag 临时覆盖, so that 既能稳定团队规约也能在调试或紧急 ship 时快速调整。

#### Acceptance Criteria

1. WHEN 解析 `Post_Channel` 是否启用 AND CLI flag `--post-comments` 与 `--no-post-comments` 均未提供, THE Forge framework SHALL 使用 `.tinkerman/config.md` 的 `review.comment_channel.enabled` 值，缺省视为 `false`；当 `.tinkerman/config.md` 中完全缺失 `review.comment_channel` 整段时 SHALL 视为该段所有字段均使用内置默认值（含 `enabled: false`）。
2. WHEN CLI flag `--post-comments` 提供, THE Forge framework SHALL 强制启用 `Post_Channel` 且 SHALL NOT 因 `.tinkerman/config.md` 中 `enabled: false` 而禁用。
3. WHEN CLI flag `--no-post-comments` 提供, THE Forge framework SHALL 强制禁用 `Post_Channel` 且 SHALL NOT 因 `.tinkerman/config.md` 中 `enabled: true` 而启用。
4. IF CLI flag `--post-comments` 与 `--no-post-comments` 同时提供, THEN THE Forge framework SHALL 在配置解析阶段抛错并阻止 `Post_Channel` 启动 AND SHALL 在错误信息中包含 `--post-comments 与 --no-post-comments 互斥` 子串。
5. IF `.tinkerman/config.md` 中 `review.comment_channel.platform` 取值不等于 `bitbucket`, THEN THE Forge framework SHALL 在配置解析阶段抛错并阻止 `Post_Channel` 启动。
6. IF `.tinkerman/config.md` 中 `review.comment_channel.p3_strategy` 取值不等于 `none`, THEN THE Forge framework SHALL 在配置解析阶段抛错并阻止 `Post_Channel` 启动。
7. IF `.tinkerman/config.md` 中 `review.comment_channel.platform_override` 取值不属于集合 `{auto, bitbucket, none}`, THEN THE Forge framework SHALL 在配置解析阶段抛错并阻止 `Post_Channel` 启动。
8. IF `.tinkerman/config.md` 中 `review.comment_channel.rate_limit_interval_ms` 取值小于 `0` OR 大于 `10000`, THEN THE Forge framework SHALL 在配置解析阶段抛错并阻止 `Post_Channel` 启动。
9. IF `.tinkerman/config.md` 中 `review.comment_channel.comment_marker_prefix` 取值不匹配正则 `[\w-]+`, THEN THE Forge framework SHALL 在配置解析阶段抛错并阻止 `Post_Channel` 启动。
10. WHEN `.tinkerman/config.md` 中 `review.comment_channel` 段任一字段缺省, THE Forge framework SHALL 按以下默认值表填充：`enabled: false`、`platform: bitbucket`、`platform_override: auto`、`p0_p1_strategy: both`、`p2_strategy: inline`、`p3_strategy: none`、`request_changes_on_p0_p1: true`、`auto_reconcile_resolved: true`、`auto_reopen_regressed: true`、`comment_marker_prefix: "forge-review"`、`rate_limit_interval_ms: 100`。
11. WHEN 配置解析阶段检测到 `BITBUCKET_BASE_URL` 环境变量缺失, THE Forge framework SHALL NOT 在该阶段抛错，由 `Platform_Gate` 在运行时按上下文返回 `mcp-not-configured` 或 `override-but-mcp-missing` 跳过原因。

### Requirement 7: 错误处理与可观测性

**User Story:** As a Forge 维护者, I want 平台门禁跳过、工具调用单点失败、配置无效等场景留痕可追踪且不影响 ship gate, so that 配置漂移与运行时异常能在事后分析中被发现且不会误阻断主流程。

#### Acceptance Criteria

1. WHEN `Platform_Gate` 返回 `{ skip: true, reason }`, THE `Post_Channel` SHALL 静默跳过 post 流程 AND SHALL NOT 抛出异常给调用方。
2. WHEN `Platform_Gate` 返回 `{ skip: true, reason }` AND `Post_Channel` 静默跳过, THE Forge framework SHALL 在 `Run_Markdown` 末尾以 `Run_Markdown_Append_Mode` 仅追加形如 `## comment_channel: skipped (reason: <code>)` 的段落（首行格式可被外部工具解析回滚） AND SHALL 在 `.tinkerman/findings/comment-channel-skipped-<date>.md` 同日文件中追加而非覆盖含 `reason` / `remote_url` / `mcp_base_url` 的记录 AND SHALL 在 `.tinkerman/knowledge/tool-health.md` 中按 `reason` 维护独立的 `Tool_Health_Counter`，覆盖 `platform-not-bitbucket` / `mcp-not-configured` / `mcp-base-url-mismatch` / `override-but-mcp-missing` / `platform-disabled-by-config` 五类。
3. IF `Post_Channel` 在执行 `ActionPlan` 时其中一条 MCP 工具调用抛错, THEN THE `Post_Channel` SHALL 继续执行 `ActionPlan` 中剩余动作 AND SHALL 在最终结果中返回 `{ posted: true, partial_failures: [{ finding_hash, tool_name, error_message, timestamp }, ...] }` AND SHALL 把失败信息按日期分桶追加（而非覆盖）写入 `.tinkerman/findings/comment-channel-error-<date>.md`。
4. WHEN 配置解析阶段检测到无效配置导致抛错, THE Forge framework SHALL 阻止 `Post_Channel` 启动 AND SHALL 把错误信息直接呈现给调用方 AND SHALL NOT 写 fallback 静默路径以隐藏无效配置。
5. IF `parseReviewMarkdown` 在解析 `Run_Markdown` 时抛错, THEN THE `Post_Channel` SHALL 结束并返回 `{ posted: false, reason: '<parse-error-code>' }` 且 SHALL NOT 影响 ship gate 基于同一 `Run_Markdown` 的阻断判定。
6. WHEN `Post_Channel` 完成一次 run（不论 posted 为 true 或 false）, THE Forge framework SHALL 把本次 run 的以下字段累计追加到 `.tinkerman/knowledge/metrics.md`：`run_id: string`、`post_enabled: boolean`、`gate_skipped_reason: string | null`、`creates: 非负整数`、`dones: 非负整数`、`reopens: 非负整数`、`skips: 非负整数`、`partial_failures: 非负整数`、`set_review_status_called: boolean`、`total_duration_ms: 非负整数`。
7. WHILE `Post_Channel` 正在执行 `ActionPlan`, THE `Post_Channel` SHALL 在相邻 MCP 工具调用之间至少等待 `rate_limit_interval_ms` 毫秒。
8. IF 调用 `parseReviewMarkdown` 时 `Run_Markdown` 文件不存在, THEN THE `Post_Channel` SHALL 返回 `{ posted: false, reason: 'review-markdown-not-found' }` AND SHALL NOT 抛出异常 AND SHALL NOT 影响 ship gate 基于其它 `Run_Markdown` 的阻断判定。
9. IF 单条 MCP 工具调用因限流 / 临时不可用 / 网络异常等可重试类错误失败, THEN THE `Post_Channel` SHALL NOT 在本次 run 内本地重试该调用 AND SHALL 把该失败计入 `partial_failures` 由下一次 review run 的 `Reconciler` 自动补齐。

## References

- 设计文档：`.tinkerman/specs/review-comment-bitbucket/design.md`（含 27 条 correctness property 与本需求文档的反向引用映射）
- 决策记录：`.tinkerman/decisions/2026-05-23-review-inline-comment-channel.md`（决策已锁定，4 个开放问题已回答，待转 ADR-0006）
- 关联 ADR：`.tinkerman/decisions/2026-05-18-review-fallback-ladder.md`（ADR-0005 fallback ladder，本通道附加于其后）
- 上游事实：`.tinkerman/decisions/2026-05-16-claude-code-uplift-2.1.143.md`（Claude Code `/code-review --comment` 上游分析）
- 项目宪法：`AGENTS.md`（§2.1 TDD 铁律、§3 Review Discipline、§3.3 P0/P1 Must Fix）
