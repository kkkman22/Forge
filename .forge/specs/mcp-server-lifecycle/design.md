---
feature: mcp-server-lifecycle
status: locked
date: 2026-06-04
workflow_variant: quick-plan
---

# Design Document

主题：Forge MCP server 进程生命周期管理。

## Overview

在 `src/mcp/server.ts` 的现有启动流程末尾追加 shutdown 逻辑。不引入新文件，不改变工具注册流程，仅增加进程信号处理和 stdin EOF 监听。

设计目标：

1. 收到 SIGTERM/SIGINT 时优雅关闭 McpServer。
2. stdin EOF 时同样触发关闭（覆盖父进程崩溃场景）。
3. 防止 double-shutdown 竞态。
4. 5 秒超时强制退出兜底。

## Architecture

```
Claude Code (parent)                    MCP Server (child)
        │                                      │
        │  ← SIGTERM ──────────────────────→   │
        │                              信号处理 │──► gracefulShutdown()
        │                                      │     ├ server.close()
        │  ← 管道关闭 (EOF) ───────────────→   │     └ process.exit(0)
        │                              stdin 监听 │──► gracefulShutdown()
        │                                      │
        │  ← kill -9 (无法捕获) ───────────→   │
        │                              管道断开  │──► stdin EOF → shutdown
        │                                      │
```

信号和 stdin EOF 共享同一个 `gracefulShutdown()` 入口，通过 `isShuttingDown` 标志防止重复执行。

## Components and Interfaces

### gracefulShutdown 函数

```ts
async function gracefulShutdown(signal: string): Promise<void>
```

- 幂等：首次调用执行关闭流程，后续调用直接返回。
- 步骤：`server.close()` → 等待完成 → `process.exit(0)`。
- 错误处理：`server.close()` 失败时记 stderr 并 `process.exit(1)`。

### 信号注册

```ts
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT",  () => gracefulShutdown("SIGINT"));
```

### stdin EOF 监听

```ts
process.stdin.on("end",     () => gracefulShutdown("stdin EOF"));
process.stdin.on("error",   () => gracefulShutdown("stdin error"));
```

StdioServerTransport 内部会消费 stdin，但 `end`/`error` 事件仍可被监听。

### 超时兜底

```ts
const FORCE_EXIT_TIMEOUT_MS = 5000;
```

在 `gracefulShutdown` 入口处设置 `setTimeout(() => process.exit(1), FORCE_EXIT_TIMEOUT_MS)`。正常关闭时用 `clearTimeout` 取消。

## Data Models

无新增数据模型。仅在 `server.ts` 模块作用域内使用一个 `isShuttingDown` 布尔标志。

## Error Handling

| 错误类型 | 处理 |
|---|---|
| `server.close()` 抛异常 | 记录 stderr，`process.exit(1)` |
| shutdown 5 秒超时 | `process.exit(1)` 强制退出 |
| stdin error 事件 | 与 stdin EOF 同处理，触发 shutdown |
| double-shutdown 竞态 | `isShuttingDown` 标志忽略后续调用 |

## Testing Strategy

| 层级 | 内容 |
|---|---|
| 单元 | `gracefulShutdown` 幂等性、信号触发、stdin EOF 触发 |
| 集成 | 子进程场景：kill SIGTERM → 进程退出；关闭 stdin → 进程退出；正常 MCP 调用不受影响 |
| 竞态 | 同时发送 SIGTERM + 关闭 stdin，进程只退出一次 |

## Rollout

直接修改 `src/mcp/server.ts`，`npm run build` 后生效。无需配置开关，纯增量逻辑，不影响现有功能。

## Open Questions

无。
