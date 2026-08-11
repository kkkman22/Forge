---
status: archived
archived_reason: "被 claude-2-1-169-inspired-hardening 取代"
archived_replacement: "claude-2-1-169-inspired-hardening"
feature: claude-2-1-163-infra-hardening
layout: requirements
created: 2026-06-05
tier: standard
---
# 需求文档：Claude Code 2.1.163 基础设施加固

## 简介

Claude Code v2.1.163 的更新暴露出六类对 Forge 高价值的平台能力：版本范围门禁、Stop/SubagentStop hook 上下文反馈、插件状态可观测性、resume 后 session id 一致性、权限路径等价表达防绕过、后台进程生命周期回收。

Forge 当前已经具备插件化入口、集中 hooks、MCP server、sandbox/frozen-zone、resume、cmux mirror、进程清理和 contract/property tests，但这些能力仍有几个明显缺口：

1. 兼容性文档声明最低 Claude Code 版本为 2.1.153，但缺少启动时硬校验和插件 managed settings 版本范围。
2. Stop hooks 主要通过 stdout 提醒，尚未使用 v2.1.163 的 `hookSpecificOutput.additionalContext` 把可执行上下文反馈给 Claude 并继续 turn。
3. `forge-doctor` 偏项目结构检查，缺少插件启用状态、hook 加载状态、MCP 可启动性和版本一致性的诊断。
4. session id 被多个子系统隐式依赖，但缺少 hook/Bash/MCP 在 resume 后一致性的契约测试。
5. sandbox/frozen-zone 主要覆盖路径规范化和 `..` traversal，缺少 `~`、`$HOME`、symlink、quoted path、subshell/backtick 中路径的等价表达测试。
6. MCP `forge_exec` 和部分脚本执行器虽有 timeout，但对后台子进程和进程树回收的保证不够明确。

本规格目标是把 Claude Code 2.1.163 的平台修复转化为 Forge 自身的基础设施韧性：启动前发现不兼容环境、停止前把铁律上下文反馈给模型、让用户能诊断插件状态、确保会话边界一致、封堵权限路径绕过、清理后台任务不留孤儿进程。

## 术语表

- **Claude_Version_Gate**：Forge 对当前 Claude Code CLI 版本进行的能力与范围校验，包括最低版本、最高版本和关键功能可用性。
- **Managed_Version_Settings**：Claude Code v2.1.163 新增的 managed settings 字段 `requiredMinimumVersion` 与 `requiredMaximumVersion`，用于限制允许启动的 CLI 版本范围。
- **Stop_Additional_Context**：Stop 或 SubagentStop hook 返回的 `hookSpecificOutput.additionalContext`，用于把上下文反馈给 Claude 并允许 turn 继续。
- **Plugin_Health**：Forge 插件在当前项目中的运行健康状态，包括插件启用、版本一致、hooks 加载、commands 可见、bin 可执行、MCP 可启动。
- **Session_Id_Consistency**：同一次 Claude Code 会话中 hook stdin、Bash 环境变量、stdio MCP server 环境变量所观察到的 session id 一致。
- **Path_Equivalence**：同一真实路径的多种表达方式，例如 `~`、`$HOME`、`${HOME}`、相对路径、symlink、quoted path 和 subshell/backtick 输出。
- **Background_Process_Reaping**：命令完成、timeout、stdin EOF 或父进程退出后，对后台 shell、子进程树和进程组进行可验证清理的机制。
- **Hard_Gate**：不满足时阻断 Forge 关键流程的门禁。
- **Soft_Diagnostic**：不阻断流程但输出明确诊断和修复建议的检查。

## 需求

### 需求 1：Claude Code 版本范围门禁

**用户故事：** 作为 Forge 维护者，我希望 Forge 在启动时明确校验 Claude Code 版本范围和关键能力，以避免低版本或未知高版本导致 hook、plugin、MCP 行为静默降级。

#### 验收标准

1. THE Forge plugin SHALL 在插件配置或 managed settings 兼容位置声明 `requiredMinimumVersion`，其值不得低于支持本规格关键能力的 Claude Code 版本。
2. THE Forge plugin SHOULD 声明 `requiredMaximumVersion` 或等价的 advisory 上限策略，用于提示未经验证的新版本可能存在兼容风险。
3. WHEN Claude Code 版本低于 Forge 要求的最低版本时，THE SessionStart bootstrap SHALL 输出明确诊断，包含当前版本、最低版本、推荐 approved version，并阻断依赖关键能力的 Forge 自动流程。
4. WHEN Claude Code 版本高于已验证上限时，THE SessionStart bootstrap SHALL 输出 soft diagnostic，不阻断普通流程，但提示运行 `forge-doctor` 查看兼容性。
5. THE `forge-doctor` SHALL 检查 `claude --version`，并在文本输出和 `--json` 输出中包含 `currentVersion`、`minimumVersion`、`maximumVersion`、`verdict` 字段。
6. THE `docs/claude-code-compatibility.md` SHALL 更新到包含 v2.1.163 能力矩阵，列出 `requiredMinimumVersion/requiredMaximumVersion`、Stop/SubagentStop `additionalContext`、resume session id 一致性相关能力。
7. IF `claude --version` 不可执行或输出无法解析，THEN THE `forge-doctor` SHALL 给出 `unknown` verdict 和修复建议，不得抛出未处理异常。
8. THE 版本比较 SHALL 使用语义版本比较，不得只比较字符串或只比较 major/minor。

### 需求 2：Stop/SubagentStop additionalContext 反馈

**用户故事：** 作为 Forge 用户，我希望当 Forge 检测到未验证、未自动推进或 subagent 异常停止时，系统能把下一步上下文反馈给 Claude，让当前 turn 继续处理，而不是只在终端打印提醒。

#### 验收标准

1. THE Stop hook SHALL 在检测到 active phase 且缺少验证证据时返回 `hookSpecificOutput.additionalContext`，内容包含当前 phase、缺失的验证命令类型、以及下一步动作。
2. THE Stop hook SHALL 在检测到未完成 progress task 时返回 `hookSpecificOutput.additionalContext`，内容提示继续当前任务或运行 `/forge resume`，但不得误报 hook error。
3. THE Stop hook SHALL 在检测到 build/review/test/ship 阶段应自动推进但未推进时，返回包含 Forge no-idle 铁律的 additional context。
4. THE SubagentStop hook SHALL 在 subagent 退出且存在失败摘要时返回 additional context 给主 agent，包含 agent type、失败类别、建议重试或 fallback ladder 入口。
5. THE additional context 输出 SHALL 限制长度，避免超过 Claude hook 输出限制；超长内容必须摘要化并保留关键路径。
6. WHEN Claude Code 版本不支持 Stop/SubagentStop additionalContext 时，THE hooks SHALL 回退到现有 stdout 提醒，不阻断流程。
7. THE Stop/SubagentStop hooks SHALL 保持 exit code 0；除非明确的 hard gate 需要阻断，不得通过 hook error 传递普通诊断。
8. THE contract tests SHALL 校验 Stop 与 SubagentStop hook 输出 JSON schema，确保 `hookSpecificOutput.additionalContext` 存在时为字符串且非空。

### 需求 3：插件状态可观测性与诊断

**用户故事：** 作为 Forge 用户，我希望能通过一个诊断命令看到 Forge plugin 是否安装、启用、版本一致、hooks 是否加载、MCP 是否可用，以便快速定位环境问题。

#### 验收标准

1. THE `forge-doctor` SHALL 增加 plugin health 检查，覆盖 `.claude-plugin/plugin.json` 存在性、manifest JSON 可解析、plugin name/version 与 package version 一致性。
2. THE `forge-doctor` SHALL 检查 `commands/forge.md` 是否存在，并确认 `/forge` 入口命令可见。
3. THE `forge-doctor` SHALL 检查 `hooks/hooks.json` 是否存在、可解析、包含关键 hook 事件：SessionStart、UserPromptSubmit、PreToolUse、PostToolUse、Stop。
4. THE `forge-doctor` SHALL 检查 bin 命令 `forge-doctor`、`forge-status`、`forge-restate` 是否存在且支持 `--help`。
5. THE `forge-doctor` SHALL 检查 MCP server source 或 dist 入口是否存在，并能在受限时间内完成启动/关闭 smoke check。
6. THE `forge-doctor --json` SHALL 输出结构化 plugin health，包括每个检查项的 `status: pass|warn|fail`、`message`、`fixHint`。
7. WHEN 检测到 plugin 未启用或 hooks 未加载时，THE 诊断 SHALL 给出具体下一步，而不是泛化为“重新安装”。
8. THE docs SHALL 描述如何使用 `forge-doctor` 对应 Claude `/plugin list --enabled/--disabled` 的人工核对流程。

### 需求 4：resume 后 session id 一致性契约

**用户故事：** 作为 Forge 维护者，我希望 resume 后 hook、Bash、MCP 观察到同一个 session id，以保证 per-session locks、cmux mirror、MCP cache 和 auto-resume 不发生跨会话污染。

#### 验收标准

1. THE hook stdin router SHALL 识别并保留 hook 输入中的 `session_id`，并可用于诊断输出。
2. THE Bash 侧 session id 读取 SHALL 优先使用 `CLAUDE_CODE_SESSION_ID`，并向后兼容旧的 `CLAUDE_SESSION_ID`。
3. THE MCP server SHALL 在启动时记录或暴露当前 `CLAUDE_CODE_SESSION_ID`，仅用于诊断和 cache namespace，不写入 stdout 协议流。
4. WHEN `/forge resume` 或 SessionStart auto-resume 触发时，THE session scoped locks SHALL 使用一致的 session id namespace。
5. THE tests SHALL 模拟同一 resume 会话中 hook stdin、Bash env、MCP env 三者一致，断言生成的 lock/cache key 相同。
6. THE tests SHALL 模拟 session id 缺失场景，断言系统使用安全 fallback，且 fallback 不跨进程共享全局固定 key。
7. THE cmux mirror/session tracking SHALL 不因 resume 后 session id 切换而重复发出 startup notification。
8. THE compatibility docs SHALL 记录 v2.1.163 之后 session id 一致性为 Forge 依赖能力，并说明低版本风险。

### 需求 5：权限规则路径等价表达防绕过

**用户故事：** 作为 Forge 用户，我希望 sandbox 和 frozen-zone 规则能识别同一真实路径的多种表达方式，以避免 deny/frozen 规则被 `$HOME`、`~`、symlink 或 shell 表达绕过。

#### 验收标准

1. THE path policy layer SHALL 提供路径 canonicalization helper，将 `~`、`$HOME`、`${HOME}`、相对路径、重复 slash、`..` 规范化到可比较形式。
2. THE Bash command policy SHALL 在匹配 deny/frozen 路径前，识别 quoted path、shell variable path、subshell/backtick 中的路径片段。
3. WHEN deny 规则匹配 home-directory path 时，THE Bash command policy SHALL 同时阻断使用 `$HOME` 和 `~` 表达的等价路径。
4. WHEN frozen-zone 检查 `.forge/specs/**`、`.forge/plans/**`、`.forge/config.md` 时，THE 检查 SHALL 阻断相对路径、绝对路径和 symlink 指向这些文件的写操作。
5. THE policy tests SHALL 覆盖 `~`、`$HOME`、`${HOME}`、quoted path、relative path、symlink、subshell/backtick path 七类表达。
6. THE implementation SHALL 不执行任意 shell 展开来做安全判断；只允许受控解析和环境变量白名单展开。
7. IF 路径表达无法可靠解析但包含高风险 deny/frozen 信号，THEN THE policy SHALL fail closed 并给出诊断。
8. THE docs SHALL 明确路径等价表达规则适用于 Forge 自己的 sandbox/frozen-zone，不替代 Claude Code 原生权限系统。

### 需求 6：后台进程与 MCP 执行器回收

**用户故事：** 作为 Forge 用户，我希望通过 MCP `forge_exec` 或 Forge scripts 启动的命令即使创建后台进程，也能在命令完成、timeout、stdin EOF 或父进程退出后被回收，避免会话挂死或遗留孤儿进程。

#### 验收标准

1. THE `forge_exec` SHALL 对每次命令执行建立可追踪的 process group 或 process tree 记录。
2. WHEN `forge_exec` 命令 timeout 时，THE executor SHALL 先发送 SIGTERM，等待短暂 grace period 后对仍存活的进程树发送 SIGKILL。
3. WHEN command shell 已返回但存在由该 shell 创建的后台子进程时，THE executor SHALL 在约 5 秒内停止这些后台进程或记录明确诊断。
4. WHEN MCP server 收到 stdin EOF、SIGTERM 或 SIGINT 时，THE server SHALL 等待已注册命令清理完成后退出；超时后强制退出并记录 stderr 诊断。
5. THE process cleanup SHALL 复用或扩展现有 `process-tree-cleaner` / `process-registry`，避免引入重复实现。
6. THE tests SHALL 覆盖 `sh -c 'sleep 999 &'`、`sh -c 'sleep 999 & echo done'`、timeout command、stdin EOF during running command 四类场景。
7. THE cleanup SHALL 不误杀 Forge 进程外的用户进程；进程组或进程树边界必须来自本次 executor 创建的 root pid。
8. THE failure output SHALL 保留 Forge verification iron law：非零退出或 timeout 时返回完整 stdout/stderr，不因清理摘要截断关键错误。

### 需求 7：文档、知识与回归保护

**用户故事：** 作为 Forge 维护者，我希望这次从 Claude 2.1.163 借鉴的能力沉淀到文档和测试中，避免未来升级 Claude Code 或修改 hooks 时回归。

#### 验收标准

1. THE `docs/claude-code-compatibility.md` SHALL 记录本规格新增的六类能力、最低版本和低版本降级策略。
2. THE `forge-doctor --help` SHALL 提及版本检查、plugin health、MCP smoke、session id diagnostics。
3. THE test suite SHALL 包含 contract tests 和 property tests，覆盖本规格全部 hard gate 与 high-risk fallback。
4. WHEN 本规格 ship 完成，THE `/forge learn` SHALL 记录“平台 changelog 转化为项目防回归规格”的知识条目。
5. THE CHANGELOG SHALL 增加一项 Claude Code 2.1.163 infrastructure hardening。
6. THE implementation SHALL 更新 dist 同步，满足 Forge R6：修改 `src/**/*.ts` 时同步 `dist/src/**`。

