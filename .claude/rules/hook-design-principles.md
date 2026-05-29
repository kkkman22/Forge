# Hook Design Principles

## Priority Order

When implementing hooks for Forge, follow this priority order:

1. **type: mcp_tool** — Direct MCP tool call, no process spawn (lowest overhead)
2. **exec form (args[])** — Structured command array, no shell parsing
3. **command string** — Legacy fallback, shell-interpreted (highest overhead)

## Exec Form (R8)

Prefer `args: ["node", "..."]` over `command: "node ..."`:

```json
// Preferred
{"args": ["node", "${CLAUDE_PLUGIN_ROOT}/scripts/foo.mjs"], "timeout": 5}

// Avoid (unless shell features needed)
{"command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/foo.mjs\" 2>/dev/null || true"}
```

Benefits:
- No shell interpretation → no injection risk
- Structured args → no quoting issues
- ~30% fewer process overhead (no shell layer)

Use `command` only for complex inline shell logic (pipes, conditionals, glob expansion).

## If Conditions (R8)

Add `if` conditions to reduce unnecessary hook spawns:

```json
{"matcher": "Write|Edit", "if": "exists(.forge/.sandbox-active.json)", "args": [...]}
{"matcher": "Bash", "if": "Bash(git commit*)", "args": [...]}
```

Common `if` patterns:
- `exists(path)` — File existence check before spawn
- `ToolName(pattern)` — Input content matching
- `ToolName` — Simple tool name filter (alternative to `matcher`)

## type: mcp_tool (R14)

For hooks whose sole purpose is calling forge-context tools:

```json
{"type": "mcp_tool", "server": "forge-context", "tool": "forge_git", "input": {"command": "status"}}
```

Requirements:
- forge-context MCP server must be connected
- Failure strategy: exit 0 (never block the workflow)
- Only applicable when the hook does no additional logic

## Hook Lifecycle Events (v2.1.153+)

| Event | Purpose | Can Block |
|-------|---------|-----------|
| SessionStart | Initialize session state | No |
| UserPromptSubmit | Pre-process user input | No |
| PreToolUse | Gate tool execution | Yes (exit 2) |
| PostToolUse | Post-process tool results | No |
| MessageDisplay | Modify displayed output | No |
| PreCompact | Save state snapshot before compaction | No |
| CwdChanged | React to directory change | No |
| FileChanged | React to file system changes | No |
| Stop | Session cleanup | No |

## Fail-Open Design

All hooks should exit 0 on error unless intentionally blocking:

- **Blocking hooks** (PreToolUse): exit 2 to block, exit 0 to allow
- **Non-blocking hooks** (all others, including PreCompact): always exit 0, use stderr for diagnostics

## Timeout Guidelines

| Hook Type | Recommended Timeout |
|-----------|-------------------|
| Read-only checks | 2-3s |
| File system writes | 5s |
| External process calls | 5-10s |
| MCP tool calls | 3s |
