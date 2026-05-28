# Platform Feature Verification: Claude Code v2.1.153

**Date**: 2026-05-28
**Topic**: claude-code-uplift-2.1.153 Open Questions Resolution

## Verdicts

### Q1: auto mode hard_deny schema
**Verdict**: VERIFIED (simple form)
Claude Code hard_deny 接受 string 形式（如 `"Bash(git push *)"`）和 object 形式。Object 形式的 `matchCondition` 是 Forge 自定义语义，不在 Claude Code 原生支持中。实现策略：使用简单 string 形式 + PreToolUse hook 做条件检查。

### Q2: /goal programmatic API
**Verdict**: DEGRADED (text output)
/goal 是 REPL 命令，无 SDK/API 接口。forge-plan/forgo-build 主流程无法自动 setGoal。降级策略：三档路由确认后输出 `/goal "..."` 命令文本供用户手动复制。R4 AC1 的"自动"改为"提示"。

### Q3: _meta maxResultSizeChars in MCP TS SDK
**Verdict**: VERIFIED (annotations)
MCP SDK `server.tool()` 注册工具时可通过 annotations 传递 `_meta`。`anthropic/maxResultSizeChars` 是 Claude Code 特定注解，放在 `tools/list` 响应的工具对象上。需在 `registerForgeGit` 等函数中通过 SDK 的 annotations 参数注入。

### Q4: claude ultrareview on enterprise providers
**Verdict**: DEGRADED (requires manual testing)
ultrareview 可能依赖 Anthropic 直连后端，Bedrock/Vertex 可用性未确认。实现策略：wrap in try/catch，命令失败时降级到 L1。运行时检测 `claude ultrareview --help` 退出码判断可用性。

### Q5: bin/ on Windows
**Verdict**: VERIFIED (Unix-only)
Forge 未声明 Windows 支持。bin/ 脚本使用 `#!/usr/bin/env node` shebang，仅 Unix 有效。标注 Unix-only 即可。

## Additional Findings

- forge-doctor / forge-status / forge-restate 脚本当前不存在。T12 需 CREATE 而非 MOVE。设计文档中的"移动"是基于假设存在的脚本名。实际 bin/ 内容需重新评估。
- scripts/ 中有 --help 的脚本：build-dist.sh, archive-spec.sh, dist-resync.sh, install-dist.sh, init.sh, prune-event-logs.sh 等。可考虑将部分适合的脚本迁入 bin/。
