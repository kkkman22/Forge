---
status: completed
feature: context-optimization
layout: requirements
created: 2026-05-01
tier: standard
---
# Requirements Document

## Introduction

Forge 当前的上下文预算管理（context-budget-management）通过 SKILL.md 中的 prompt 指令引导模型在上下文中"心算"裁剪工具输出。这种事后压缩方式有两个根本限制：（1）数据已经进入上下文，裁剪只减少后续引用的 token 消耗，不减少首次进入的消耗；（2）裁剪依赖模型自觉执行，遵从率不稳定。

借鉴 context-mode 项目（github.com/mksglu/context-mode）的沙箱执行思想，本功能通过构建 Forge 自有的 MCP server（forge-context），在协议层拦截大输出——命令在子进程中执行，server 端裁剪后只返回摘要，原始数据不进入上下文。同时引入 Think in Code 范式，引导 explore agent 在批量文件分析时用脚本替代逐个 Read。

预估收益：标准路径工具输出 token 从 ~17K 降到 ~5K（-70%），explore agent 上下文消耗从 ~35K 降到 ~3K（-90%）。

**明确不做的事情**：不引入 FTS5/SQLite 知识库（Forge 的 `.tinkerman/` 文件系统状态已足够）；不做会话事件持久化（Forge 用 Subagent 隔离 + 文件系统状态替代）；不做 Hook 层路由拦截（会与 Forge 现有 Hook 冲突）；不引导安装 context-mode（Agent prompt 注入冲突风险太高）。

## Glossary

- **forge-context**：Forge 自有的 MCP server，提供沙箱命令执行和输出裁剪能力。通过 stdio transport 与 Claude Code 通信。
- **forge_exec**：MCP 工具。在子进程中执行 shell 命令，根据退出码和输出大小决定返回策略（小输出直接返回，大输出提取关键行，失败完整透传）。
- **forge_git**：MCP 工具。执行 git 查询命令（diff/status/log），server 端解析为结构化摘要返回。
- **forge_read**：MCP 工具。在子进程中对多个文件执行分析脚本，只返回 stdout 结论，文件内容不进入上下文。
- **Think in Code**：编程式探索范式。当需要分析多个文件时，写脚本在子进程中执行分析，让上下文只接收结论而非原始数据。
- **事前拦截**：MCP 层面的输出裁剪——数据在 server 端裁剪后才返回给模型，原始数据不进入上下文。与"事后压缩"（数据已进入上下文后由模型心算裁剪）相对。
- **context-budget.ts**：Forge 现有的上下文预算管理模块，包含 6 个裁剪器的纯函数实现（序列化/反序列化）。本功能将其中 Test/Git 裁剪逻辑迁移到 MCP server 端执行，原纯函数保留用于测试和 fallback。

## Requirements

### Requirement 1: forge-context MCP Server 基础架构

**User Story:** As a developer, I want a Forge-native MCP server that runs as a stdio subprocess, so that Claude Code can call Forge-specific tools for sandboxed command execution and output trimming.

#### Acceptance Criteria

1. THE forge-context MCP server SHALL be implemented as a Node.js process using `@modelcontextprotocol/sdk` with `StdioServerTransport`, registering all tools via `McpServer.registerTool()`.
2. THE forge-context MCP server SHALL register exactly three tools: `forge_exec`, `forge_git`, and `forge_read`.
3. THE forge-context MCP server entry point SHALL be located at `src/mcp/server.ts` and compile to `dist/src/mcp/server.js`.
4. THE forge-context MCP server SHALL start within 500ms and respond to MCP `initialize` handshake without errors.
5. THE forge-context MCP server SHALL use `zod` for input schema validation of all tool parameters.
6. WHEN the forge-context MCP server encounters an unhandled error, it SHALL return an MCP error response with `isError: true` and a descriptive message, without crashing the server process.

### Requirement 2: forge_exec 沙箱命令执行工具

**User Story:** As a developer, I want to run shell commands through an MCP tool that automatically trims large successful output, so that test runs, lint checks, and CI commands don't flood my context window.

#### Acceptance Criteria

1. THE forge_exec tool SHALL accept parameters: `command` (string, required) and `timeout` (number, optional, default 30000ms).
2. THE forge_exec tool SHALL execute the command in a child subprocess via `child_process.execFile` (or equivalent), capturing stdout, stderr, and exit code.
3. WHEN the command exits with code 0 AND stdout is ≤30 lines, THE forge_exec tool SHALL return the full stdout unchanged.
4. WHEN the command exits with code 0 AND stdout exceeds 30 lines, THE forge_exec tool SHALL return a trimmed summary containing: exit code and total line count, key lines matching patterns (pass/fail/error/warn/coverage/test count), and the last 5 lines of output.
5. WHEN the command exits with a non-zero code, THE forge_exec tool SHALL return the complete stdout and stderr without any trimming (Forge iron rule: failure output is never compressed).
6. WHEN the command exceeds the timeout, THE forge_exec tool SHALL kill the subprocess and return an error response indicating timeout.
7. THE forge_exec tool description SHALL clearly state its intended use cases (test runners, lint, typecheck, CI commands, any command producing >30 lines of output) and when NOT to use it (file mutations, git writes, interactive commands), so that the model selects the correct tool without prompt-level routing.

### Requirement 3: forge_git Git 摘要工具

**User Story:** As a developer, I want git query operations to return structured summaries instead of raw output, so that large diffs and status listings don't consume excessive context.

#### Acceptance Criteria

1. THE forge_git tool SHALL accept parameters: `subcommand` (enum: "diff", "status", "log") and `args` (string, optional, additional git arguments).
2. WHEN subcommand is "diff", THE forge_git tool SHALL execute `git diff --stat` and return a file-level summary containing: file count, per-file added/removed line counts, and total change statistics. The format SHALL match the existing `serializeGitDiff` output format from `context-budget.ts`.
3. WHEN subcommand is "status", THE forge_git tool SHALL execute `git status --porcelain` and return a categorized summary containing: staged/modified/untracked file counts and file lists (max 10 per category). The format SHALL match the existing `serializeGitStatus` output format from `context-budget.ts`.
4. WHEN subcommand is "log", THE forge_git tool SHALL execute `git log --oneline -20` (or user-specified count via args) and return the output directly.
5. WHEN any git command fails, THE forge_git tool SHALL return the complete error output with `isError: true`.

### Requirement 4: forge_read 批量文件分析工具

**User Story:** As a developer, I want to analyze multiple files through a sandboxed script execution, so that file contents don't enter my context window when I only need structural information.

#### Acceptance Criteria

1. THE forge_read tool SHALL accept parameters: `paths` (string array, required, file paths to analyze), `script` (string, required, analysis script code), and `language` (enum: "javascript" | "shell", default "javascript").
2. THE forge_read tool SHALL make file contents available to the script via environment or injection (e.g., `FORGE_FILES` environment variable containing JSON array of paths), execute the script in a child subprocess, and return only stdout.
3. THE forge_read tool SHALL NOT return file contents in its response — only the script's stdout output enters the context.
4. WHEN the script execution fails (non-zero exit or timeout), THE forge_read tool SHALL return the error output with `isError: true`.
5. THE forge_read tool SHALL enforce a 30-second default timeout for script execution.

### Requirement 5: init.sh MCP 配置集成

**User Story:** As a developer, I want `forge init` to automatically register the forge-context MCP server, so that the MCP tools are available without manual configuration.

#### Acceptance Criteria

1. THE init.sh script SHALL add a `forge-context` entry to the `mcpServers` section of `.claude/settings.json` during initialization, pointing to the compiled server entry point.
2. WHEN `.claude/settings.json` already contains an `mcpServers` section, THE init.sh script SHALL merge the `forge-context` entry without overwriting existing MCP server configurations.
3. WHEN `.claude/settings.json` already contains a `forge-context` entry, THE init.sh script SHALL skip the MCP configuration step to avoid overwriting user customizations.
4. THE MCP configuration SHALL use the correct path to the compiled server: `"command": "node"` with `"args"` pointing to `<FORGE_ROOT>/dist/src/mcp/server.js`.

### Requirement 6: SKILL.md 工具调用指导更新

**User Story:** As a developer, I want SKILL documents to guide the model toward using MCP tools for large-output operations, so that the context savings are realized in practice.

#### Acceptance Criteria

1. THE `skills/forge-build/SKILL.md` Context Budget Management section SHALL update the Hard Token Limits table to indicate that test output, git diff, git status, and general command output are handled by `forge_exec` / `forge_git` with server-side trimming, replacing the previous "MUST truncate" prompt-level directives for these categories.
2. THE `skills/forge-build/SKILL.md` Three-Layer Output Truncation Defense section SHALL be updated to list forge-context MCP as the primary layer, `run-with-trim.sh` as fallback, and AI Trimming Iron Law as the third layer.
3. THE `skills/forge-test/SKILL.md` SHALL update Layer 1 (Unit Tests) and Layer 3 (Pre-Completion Checklist) execution guidance to use `forge_exec` for running test and CI commands.
4. THE SKILL.md updates SHALL preserve all existing non-context-budget content (TDD rules, quality gates, Closure-First probes, severity grading, verification iron law) without modification.
5. THE Explore_Summarizer, Review_Summarizer, and Subagent_Summary_Protocol prompt-level directives SHALL be preserved unchanged, as these perform semantic compression that MCP cannot replace.

### Requirement 7: run-with-trim.sh Fallback 增强

**User Story:** As a developer, I want the shell wrapper to provide better output filtering as a fallback when MCP is unavailable, so that context savings are still achieved in degraded mode.

#### Acceptance Criteria

1. THE `scripts/run-with-trim.sh` success path SHALL be enhanced to extract key lines matching patterns (pass/fail/error/warn/coverage/test count) instead of only showing the last 10 lines, when output exceeds 30 lines.
2. THE `scripts/run-with-trim.sh` failure path SHALL continue to pass through complete output unchanged (Forge iron rule).
3. THE `scripts/run-with-trim.sh` SHALL remain functional as a standalone shell script with no dependencies on the MCP server.

### Requirement 8: Think in Code 行为规则（已实施）

**User Story:** As a developer, I want the explore agent to use scripted analysis for batch file operations, so that file contents don't flood the agent's context window during code exploration.

**Status:** ✅ Already implemented in `agents/explore.md` and synced to `.claude/agents/explore.md`.

#### Acceptance Criteria

1. THE `agents/explore.md` SHALL include a "Think in Code" section with pre-built script templates for: module structure overview (file + export signatures), dependency analysis (import/require relationships), and test coverage check (source files with/without corresponding test files).
2. THE `agents/explore.md` SHALL enforce a rule that when the target directory contains more than 5 files, the agent MUST use Think in Code scripts instead of individual Read operations.
3. THE Think in Code scripts SHALL support multiple languages: TypeScript/JavaScript (export/import), Python (def/class), and Go (func) via grep patterns.
4. THE `agents/explore.md` search strategy SHALL be updated to include "batch structural analysis (Think in Code scripts)" as a search angle, and the broad-to-narrow strategy SHALL prioritize Think in Code scripts for initial overview before targeted Read operations.
5. THE scripts SHALL be pre-built templates (not generated by the agent at runtime), because the explore agent uses the haiku model which has limited script-writing reliability. The agent only needs to substitute `<DIR>` with the target directory path.

### Requirement 9: 向后兼容性与 Forge Loop 兼容

**User Story:** As a developer, I want the new MCP-based context optimization to be fully backward compatible, so that existing Forge workflows and the autonomous Forge Loop continue to work without modification.

#### Acceptance Criteria

1. ALL existing `context-budget.ts` pure functions (serializers, deserializers, CLASSIFICATION_MAP) SHALL be preserved without modification, as they are used for testing, Forge Loop fallback, and SKILL.md format reference.
2. ALL existing hooks in `hooks/hooks.json` (check-frozen, check-sandbox, auto-resume, plan context injection, progress reminders) SHALL remain unchanged and functional.
3. THE forge-context MCP server SHALL be an additive capability — Forge workflows SHALL function correctly when the MCP server is unavailable (degraded mode using run-with-trim.sh and prompt-level directives).
4. ALL existing tests SHALL continue to pass after the changes (`npm run check`).
5. THE forge-context MCP server SHALL be transparent to Forge Loop — when Forge Loop drives Claude Code via Agent SDK, the MCP tools registered in `.claude/settings.json` SHALL be available to the agent within each iteration without any Forge Loop code changes.

---

## 附录：合并来源

本 spec 于 2026-05-29 合并了以下 spec 的需求内容。被合并者的原 requirements.md 保留在 `.tinkerman/specs/_archived/` 中供历史参考。

### 来源 1: context-bloat-control

原 spec 聚焦于六项具体优化措施，按 ROI 排序：
1. CLAUDE_MD 结构化瘦身 — 将详细内容移至 Reference_Doc
2. Trimming 铁律强制执行 — 定义硬约束 token 限制
3. 三层输出截断防御 — RTK + Run_With_Trim + AI Trimming
4. Code Review Graph 集成优化探针 — 基于图的精确查询
5. 并行 Agent 并发控制 — HTTP 429 降级策略
6. 阶段级会话边界文档化 — Session_Boundary 记录

关键差异：context-bloat-control 侧重于 prompt 层面的行为规则和文档瘦身，context-optimization 侧重于 MCP 层面的技术实现。两者互补。

### 来源 2: context-budget-management

原 spec 聚焦于系统性的上下文预算管理框架，包含：
- 信息生命周期分类框架（Persistent / Phase-scoped / Ephemeral / Write-and-discard）
- 各类信息的摘要化和裁剪策略（Explore、Review、Test、Git、Subagent）
- SKILL 文档集成
- Restatement Checkpoint 集成
- 上下文预算可观测性
- 裁剪结果的解析器往返一致性

关键差异：context-budget-management 定义了分类体系和裁剪策略，context-optimization 通过 MCP server 实现了其中 git/test/command 的技术方案。
