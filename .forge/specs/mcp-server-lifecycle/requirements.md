---
feature: mcp-server-lifecycle
status: locked
date: 2026-06-04
workflow_variant: quick-plan
---

# Requirements Document

主题：Forge MCP server 进程生命周期管理，防止孤儿进程。

## Introduction

`src/mcp/server.ts` 通过 `StdioServerTransport` 与 Claude Code 通信。当 Claude Code 会话结束时（正常退出或崩溃），server 进程可能未被正确清理，变为孤儿进程（PPID=1），持续占用 100% CPU。根因是 server 缺少信号处理和 stdin EOF 检测，无法感知父进程已退出。

本特性为 MCP server 增加两层防护：信号处理（Layer 1）和 stdin EOF 检测（Layer 2），确保父进程退出后 server 能自动终止。

## Glossary

- **孤儿进程**：父进程已退出但子进程仍在运行，PPID 变为 1（被 launchd/init 接管）。
- **StdioServerTransport**：MCP SDK 提供的 stdio 传输层，通过 stdin/stdout 管道与父进程通信。
- **stdin EOF**：父进程关闭管道写入端时，子进程 stdin 收到 EOF（end-of-file）信号。
- **Graceful shutdown**：先关闭 server 连接、清理资源，再退出进程。

## Requirements

### Requirement 1: 信号处理（Layer 1）

**User Story:** 作为运行 MCP server 的系统，我希望收到 SIGTERM/SIGINT 时能优雅关闭，释放资源后退出。

#### Acceptance Criteria

- 当进程收到 SIGTERM 时，系统应当关闭 McpServer 连接并以 exit code 0 退出。
- 当进程收到 SIGINT 时，系统应当关闭 McpServer 连接并以 exit code 0 退出。
- 当 shutdown 过程中发生错误时，系统应当记录错误到 stderr 后以 exit code 1 退出。
- 当 shutdown 被触发时，系统应当防止重复触发（防止 double-shutdown 竞态）。

### Requirement 2: stdin EOF 检测（Layer 2）

**User Story:** 作为通过 stdio 管道连接的 MCP server，我希望当父进程关闭管道（崩溃/kill -9）时能自动检测并退出。

#### Acceptance Criteria

- 当 stdin 收到 EOF（end 事件）时，系统应当触发与 SIGTERM 相同的 graceful shutdown 流程。
- 当 stdin 收到 error 事件时，系统应当同样触发 graceful shutdown。
- 当 graceful shutdown 在 5 秒内未完成时，系统应当强制退出（process.exit(1)）。
- 当 stdin EOF 和信号同时到达时，系统应当只执行一次 shutdown（复用 double-shutdown 防护）。

## Non-functional Requirements

- **零新依赖**：不引入新的 npm 包，仅使用 Node.js 内置 API。
- **性能**：shutdown 流程应在 100ms 内完成（不含外部命令等待）。
- **向后兼容**：不影响现有 MCP 工具注册和调用逻辑。

## Out of Scope

- **孤儿检测（Layer 3）**：不做 PPID 轮询检测，因为 stdio 模式下父进程死必然断管道，Layer 1 + Layer 2 已全覆盖。
- **进程管理器集成**：不引入 PM2 / systemd 等外部进程管理。
- **HTTP/SSE 传输**：仅针对 StdioServerTransport，其他传输模式不在范围内。
