---
feature: mcp-server-lifecycle
status: locked
date: 2026-06-04
workflow_variant: quick-plan
---

# Tasks

## T-01 实现信号处理与 stdin EOF 检测

- **目标**：在 `src/mcp/server.ts` 中添加 graceful shutdown 逻辑，防止孤儿进程。
- **关联需求**：Requirement 1、Requirement 2

### TDD 步骤

#### RED：先写测试

1. 在 `test/mcp/server.integration.test.ts` 追加以下测试用例：
   - **SIGTERM 退出测试**：启动 server 子进程 → 发送 SIGTERM → 断言进程在 5 秒内退出且 exit code 为 0。
   - **stdin 关闭退出测试**：启动 server 子进程（stdio pipe 模式）→ 关闭子进程 stdin → 断言进程在 5 秒内退出。
   - **正常 MCP 调用不受影响**：复用现有集成测试，断言工具调用正常返回。

#### GREEN：实现

2. 在 `src/mcp/server.ts` 中：
   - 在 `server.connect(transport)` 之后添加 `gracefulShutdown` 函数。
   - 注册 `SIGTERM`、`SIGINT` 信号处理。
   - 监听 `process.stdin` 的 `end` 和 `error` 事件。
   - 设置 5 秒超时强制退出兜底。
   - 用 `isShuttingDown` 标志防止重复触发。

#### REFACTOR：整理

3. 确认代码风格与现有 `server.ts` 一致。
4. 运行 `npm run check` 验证类型、lint、测试全通过。

### 验收标准

- SIGTERM 发送后进程在 5 秒内退出，exit code 0。
- stdin 关闭后进程在 5 秒内退出。
- 现有 MCP 集成测试不受影响。
- `npm run check` 全绿。
