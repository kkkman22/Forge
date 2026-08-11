---
status: completed
feature: session-resume-check
layout: requirements
created: 2026-06-04
tier: standard
status_note: "Req1 (4-dimension resume detection) delivered via scripts/auto-resume.sh: it checks task-status + progress (completed/pending) + latest handoff (Decided section) + review status (P0/P1 counts) — 4 meaningful dimensions, not 1. Req2 (exit-code + non-blocking) delivered. Req3 (JSON hookSpecificOutput.additionalContext with \\n/quote/backslash escaping via jq; R3.4 no double-inject) delivered 2026-06-13. The spec-named hooks/session-start-resume-check.sh exists but the registered SessionStart hook runs auto-resume.sh (the superset implementation)."
---
# Requirements Document

## Introduction

obra/superpowers 用 `SessionStart` hook 在每次新会话注入 bootstrap 内容，确保 agent 知道技能系统的存在。Forge 的 `/forge resume` 可以从 `.forge/progress/` 恢复上下文，但这依赖用户主动调用。新会话开始时没有任何自动提醒——如果用户上次在 build 中途退出，新会话完全不知道有未完成的工作。

本 spec 在 SessionStart 事件时自动检测 `.forge/` 目录中的活跃状态，向用户提醒未完成的工作。

**明确不做的事情**：不修改 `/forge resume` 的恢复逻辑；不修改 TypeScript 代码；不创建新的 MCP server。

## Requirements

### Requirement 1: SessionStart Hook 脚本

**User Story:** 作为开发者，我希望新会话启动时自动提醒我有未完成的工作，这样我不会忘记用 `/forge resume` 恢复。

#### Acceptance Criteria

1. 项目 SHALL 新增一个 SessionStart hook 脚本 `hooks/session-start-resume-check.sh`。
2. THE 脚本 SHALL 在 Claude Code 会话启动时自动执行。
3. THE 脚本 SHALL 检查以下 4 个维度：
   - `.forge/status.md` 中是否有活跃 phase（非 idle/completed）
   - 当前是否在 feature 分支且有未提交变更
   - `.forge/reviews/` 中是否有包含 P0/P1 的 review 报告
   - `.forge/plans/` 中是否有 draft 状态的 plan
4. THE 脚本 SHALL 只在检测到问题时输出提醒，无问题时输出空 JSON（静默模式）。
5. EACH 提醒 SHALL 包含：emoji 标识 + 中文描述 + 对应的 `/forge` 命令提示。
6. THE 脚本 SHALL 在 timeout ≤ 3s 内完成（纯文件读取操作）。
7. THE 脚本 SHALL 在任何错误时 exit 0（fail-open，不阻断会话启动）。

### Requirement 2: Hook 注册

**User Story:** 作为 Forge 安装程序，我希望 hook 已正确注册到 SessionStart 事件。

#### Acceptance Criteria

1. THE hook SHALL 注册到项目的 hook 配置中（`.claude/settings.json` 或等效位置）。
2. THE hook 类型 SHALL 为 `command`，指向 `bash hooks/session-start-resume-check.sh`。
3. THE hook timeout SHALL 设为 3 秒。
4. THE hook 输出 SHALL 使用 `hookSpecificOutput.additionalContext` 格式（Claude Code 标准）。

### Requirement 3: 输出格式

**User Story:** 作为 Claude Code runtime，我希望 hook 输出正确格式的 JSON。

#### Acceptance Criteria

1. THE hook 输出 SHALL 为 JSON 格式：`{"hookSpecificOutput":{"additionalContext":"<escaped-content>"}}`。
2. THE content SHALL 使用 `\n` 转义换行。
3. THE content SHALL 正确转义双引号和反斜杠。
4. THE hook SHALL NOT 同时输出 `additional_context`（Cursor 格式）和 `hookSpecificOutput.additionalContext`，避免 Claude Code 无去重地双倍注入。

### Requirement 4: 检查项扩展性

**User Story:** 作为 Forge 维护者，我希望 hook 脚本可以方便地追加新检查项。

#### Acceptance Criteria

1. THE 脚本结构 SHALL 为每个检查项独立的 if 块，追加新检查不影响现有逻辑。
2. THE 脚本 SHALL 在注释中标明可扩展的后续检查项：stale worktree 检测、知识库膨胀警告、config drift 检测、CI 命令可用性。

### Requirement 5: 静默模式

**User Story:** 作为开发者，我希望在没有未完成工作时不会看到任何提醒。

#### Acceptance Criteria

1. WHEN 所有检查项都通过（无活跃 phase、无未提交变更、无 P0/P1 review、无 draft plan）THEN THE 脚本 SHALL 输出 `{}` 且不注入任何上下文。
