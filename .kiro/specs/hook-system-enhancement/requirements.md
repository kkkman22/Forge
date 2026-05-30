---
name: hook-system-enhancement
status: draft
created: "2026-05-30"
updated: "2026-05-30"
tier: standard
---

# Hook 系统增强 — 需求文档

## 引言

Forge plugin.json 注册了 12 类 hook 事件、30+ 个 hook，是 Forge 的核心基础设施。当前存在两类改进空间：（1）所有 hook 已使用 `type: "command"` + `args` 数组形式（exec form），但 spec 初稿误将 `type` 字段值与已废弃的 `command` 字符串格式混淆——实际迁移已完成；（2）多个 Claude Code 生命周期事件（TaskCreated、WorktreeCreate、StopFailure 等）未注册 hook，错失状态追踪机会。

本特性完成两项工作：确认 `command→args` 迁移已完成（所有 37 个 hook 均使用 `args` 数组）；为 5 个未注册的生命周期事件新增 hook 脚本。

**涵盖优化项**：§6 exec form 迁移、§7 terminalSequence 通知、§8 mcp_tool hook、§12 TaskCreated hook、§13 WorktreeCreate/Remove hook、§15 StopFailure hook、§16 PermissionDenied hook、§19 duration_ms 追踪。

## 术语

- **Exec Form（args 数组）**：Hook 的 `args: ["node", "..."]` 形式，无 shell 解析，无注入风险。
- **Command Form（command 字符串）**：Hook 的 `command: "if [ -f ... ]; then ..."` 形式，需 shell 解析，有注入风险。
- **type: mcp_tool**：Hook 直接调用 MCP 工具，跳过进程启动，最低开销。
- **terminalSequence**：Hook 输出中可包含终端控制序列（如桌面通知）。
- **Fail-Open**：非阻断 hook 出错时 exit 0，仅 stderr 诊断。
- **duration_ms**：PostToolUse hook 输出中包含的工具执行耗时（Claude Code v2.1.119+ 提供）。

## 需求

### Requirement 1: Command→Args 迁移（§6）

**User Story:** 作为 Forge 用户，我希望所有 hook 都使用 args 数组形式，以消除 shell 注入风险并降低进程开销。

> **实现状态**：所有 37 个 hook 已使用 `type: "command"` + `args: [...]` 数组形式（exec form）。`plugin.json` 中无 `command` 字符串字段。Claude Code plugin hook 的 `type` 字段仅支持 `"command"` 一种值；exec form 通过 `args` 数组实现，不是独立的 `type` 值。

#### 验收标准

1. ~~THE `plugin.json` 中所有 `Stop` hook 的 inline shell 逻辑 SHALL 被包装为独立脚本（`scripts/` 下），使用 `args` 数组形式。~~ ✅ 已完成
2. ~~THE `PostToolUse` 中 `exists(.forge/status.md)` 的 inline shell SHALL 被包装为独立脚本。~~ ✅ 已完成
3. ~~THE `TeammateIdle` 和 `TaskCompleted` 中的 inline shell SHALL 被包装为独立脚本。~~ ✅ 已完成
4. THE `plugin.json` 中 SHALL 不包含 `command` 字符串字段（全部使用 `args` 数组）。 ✅ 已满足（37 个 hook 均使用 `args`）
5. THE hook 行为 SHALL 与迁移前完全一致。 ✅ 已满足
6. THE 新脚本 SHALL 遵循 `--help` 支持（§2.8 Scripts as Black Box 铁律）。 ✅ 已满足

### Requirement 2: MCP Tool Hook 迁移（§8）

**User Story:** 作为 Forge 用户，我希望部分 hook 直接调用 forge-context MCP 工具，以减少进程启动开销。

#### 验收标准

1. THE `plugin.json` 中仅调用 forge-context MCP 工具且无额外逻辑的 hook SHALL 迁移为 `type: "mcp_tool"`。
2. THE 迁移候选 SHALL 通过逐个审查现有 hook 确定（需确保 hook 逻辑确实仅调用 MCP 工具）。
3. THE 迁移后的 hook SHALL 失败时不阻断工作流（exit 0）。

### Requirement 3: TaskCreated Hook（§12）

**User Story:** 作为 Forge 用户，我希望 build 阶段创建 task 时自动注入 plan 上下文。

#### 验收标准

1. THE 新增 `scripts/task-created-hook.mjs` SHALL 在 TaskCreated 事件触发时运行。
2. WHEN `.forge/plans/` 中存在 plan 文件，THE hook SHALL 输出 plan 的 task 摘要作为 `additionalContext`。
3. THE hook SHALL fail-open（exit 0），plan 不存在时静默退出。

### Requirement 4: WorktreeCreate/Remove Hook（§13）

**User Story:** 作为 Forge 用户，我希望 worktree 创建/删除时自动记录状态到 `.forge/progress/`。

#### 验收标准

1. THE 新增 `scripts/worktree-create-hook.mjs` SHALL 在 WorktreeCreate 事件触发时记录 worktree 路径和分支到 `.forge/progress/worktrees.json`。
2. THE 新增 `scripts/worktree-remove-hook.mjs` SHALL 在 WorktreeRemove 事件触发时从记录中移除对应条目。
3. THE 两个 hook SHALL 在 `plugin.json` 中注册。
4. THE hook SHALL fail-open。

### Requirement 5: StopFailure Hook（§15）

**User Story:** 作为 Forge 用户，我希望 API 错误（rate limit、auth failure）导致的 turn 失败被记录，供 `/forge debug` 分析。

#### 验收标准

1. THE 新增 `scripts/stop-failure-hook.mjs` SHALL 在 StopFailure 事件触发时运行。
2. THE hook SHALL 将错误信息（错误类型、时间戳）追加到 `.forge/debug/failures.jsonl`。
3. THE `.forge/debug/` 目录 SHALL 在 hook 首次运行时自动创建。
4. THE hook SHALL fail-open。

### Requirement 6: PermissionDenied Hook（§16）

**User Story:** 作为 Forge 用户，我希望 auto mode 拒绝操作时能自动重试，而不是直接失败。

#### 验收标准

1. THE 新增 `scripts/permission-denied-hook.mjs` SHALL 在 PermissionDenied 事件触发时运行。
2. WHEN 拒绝的操作是读操作相关的安全工具调用，THE hook SHALL 返回 `{ retry: true }` 让模型重试。
3. WHEN 拒绝的操作是写操作（Write/Edit），THE hook SHALL NOT 重试（遵循安全原则）。
4. THE hook SHALL fail-open。

### Requirement 7: terminalSequence 阶段通知（§7）

**User Story:** 作为 Forge 用户，我希望 build 阶段切换时收到桌面通知，以在长时间运行时感知进度。

#### 验收标准

1. THE Forge 的 phase transition 逻辑 SHALL 在阶段切换时输出 `terminalSequence` 桌面通知。
2. THE 通知内容 SHALL 包含阶段名称（如 `🔨 Build → 📝 Review`）。
3. THE 通知 SHALL 不影响 hook 的退出码（仍为 0）。
4. THE 通知 SHALL 在非交互环境（CI）中不触发。

### Requirement 8: duration_ms Build 步骤追踪（§19）

**User Story:** 作为 Forge 用户，我希望追踪每个 build 步骤的执行耗时，以识别性能瓶颈。

#### 验收标准

1. THE PostToolUse hook（`check-context-boundary.mjs`）SHALL 在输出中包含 `duration_ms` 字段（Claude Code v2.1.119+ 已提供此数据）。
2. THE `duration_ms` 数据 SHALL 被追加到 `.forge/runs/` 下的执行日志中。
3. THE 数据格式 SHALL 为 JSONL：`{ "tool": "...", "duration_ms": 1234, "timestamp": "..." }`。
