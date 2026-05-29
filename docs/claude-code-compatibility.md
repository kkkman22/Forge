[← INDEX](./INDEX.md) | [English Version](./claude-code-compatibility.en.md)

# Claude Code Compatibility

Forge requires Claude Code CLI v2.1.153 or later for full functionality.

## Minimum Version: v2.1.153

## Feature Availability by Version

| Feature | Min Version | Forge Requirement | Degradation |
|---------|-------------|-------------------|-------------|
| Hook lifecycle (SessionStart, etc.) | v2.1.83 | R1 | Hooks silently ignored |
| `autoMode.hard_deny` | v2.1.139 | R6 | Manual mode enforcement via prompt |
| `worktree.baseRef` | v2.1.139 | R7 | Default branch used |
| MessageDisplay hook | v2.1.139 | R2 | No output folding |
| PreCompact/PostCompact hooks | v2.1.139 | R13 | No snapshot/restore on compact |
| CwdChanged/FileChanged hooks | v2.1.139 | R16 | No branch/file monitoring |
| `disallowedTools` frontmatter | v2.1.139 | R3 | No tool restriction |
| `userConfig` in plugin.json | v2.1.153 | R10 | Default values used |
| Hook `args[]` exec form | v2.1.139 | R8 | Falls back to `command` string |
| Hook `if` conditions | v2.1.153 | R8 | Conditions ignored, hook always runs |
| `type: "mcp_tool"` hooks | v2.1.153 | R14 | Falls back to spawn command |
| `/goal` command | v2.1.153 | R4 | Goal feature disabled |
| `claude agents` dispatch | v2.1.153 | R5 | Inline subagent mode |
| `_meta.maxResultSizeChars` | v2.1.153 | R11 | Default truncation |
| PostToolUse `updatedToolOutput` | v2.1.139 | R15 | No warning injection |
| Plugin bin/ scripts | v2.1.139 | R12 | Scripts not on PATH |

## Degradation Strategy

When a feature is unavailable, Forge degrades gracefully:

1. **Hook features** — Hooks that fail or are unrecognized are silently ignored (fail-open design)
2. **Config fields** — Unknown fields in plugin.json are ignored by older Claude Code versions
3. **Frontmatter** — Unknown frontmatter keys in agent/skill files are ignored
4. **MCP tools** — If forge-context server is unavailable, hooks that depend on it exit 0

## bin/ Commands

| Command | Description |
|---------|-------------|
| `forge-doctor` | Project health check |
| `forge-status` | Show current task status |
| `forge-restate` | Trigger restatement checkpoint (optional `--check` tool) |

All bin/ commands support `--help`.
