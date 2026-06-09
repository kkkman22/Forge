---
title: 'Claude Code 兼容性参考'
category: reference
audience:
  - daily-developer
  - maintainer
updated: 2026-06-09
owner: forge-maintainers
---

[← INDEX](./INDEX.md)

# Claude Code Compatibility

Forge requires Claude Code CLI v2.1.163 or later for full functionality.

## Minimum Version: v2.1.163

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
| **Managed version settings** (`requiredMinimumVersion`) | **v2.1.163** | **R1** | **No version gate; soft diagnostic only** |
| **Stop/SubagentStop `additionalContext`** | **v2.1.163** | **R2** | **Falls back to stdout reminder** |
| **Resume session id consistency** | **v2.1.163** | **R4** | **Session namespace may diverge across hook/Bash/MCP** |
| **Hook `if` Bash expansion fix** | **v2.1.163** | **R8** | **Incorrect Bash expansion in conditions** |
| `--safe-mode` | v2.1.169 | Operator guidance | Forge uses `FORGE_DIAGNOSTIC_MODE` for optional injection suppression |
| `/cd` | v2.1.169 | Operator guidance | Workdir changes remain user controlled |
| `disableBundledSkills` | v2.1.169 | Compatibility note | Forge does not require bundled-skill disablement |
| `claude agents --json --all`, `id`, `state` | v2.1.169 | Forge implemented | Inline fallback when agents dispatch is unavailable |
| Context-window-scaled CLAUDE.md warning | v2.1.169 | Forge helper/docs | Falls back to configured `context_budget` |
| Background sessions preserve flags | v2.1.169 | Forge metadata persistence | Missing metadata is treated as legacy status |

## v2.1.169 Assessment

Assessment source: Claude Code v2.1.169 changelog dated 2026-06-08.

| Capability | Forge Action | Degradation |
|------------|--------------|-------------|
| Claude Code `--safe-mode` | Documented as operator troubleshooting. Forge diagnostic mode is separate: `FORGE_DIAGNOSTIC_MODE=1` keeps `/forge` callable while suppressing optional SessionStart injections such as evolved rules and session title hints. | Normal Forge behavior when env var is absent |
| `/cd` command | Operator guidance only; Forge still relies on the current process workdir and worktree checks. | User manually changes directory |
| `disableBundledSkills` | Compatibility note only; Forge does not depend on disabling bundled skills. | No Forge behavior change |
| `claude agents --json --all` plus JSON `id` and `state` | Dispatcher preserves `id`/`state`, treats non-completed states as failed for orchestration, and can pass `--all`. | Inline subagent fallback |
| Context-window-scaled CLAUDE.md warning | Forge exposes model-window-aware threshold helpers when a context window is configured or inferable. Token estimates such as `Math.ceil(text.length / 4)` are conservative approximations; actual tokenization depends on the model and runtime. Forge does not read Claude's live context percentage without a verified API. | Uses configured `.forge/config.md` `context_budget` |
| Background session flag preservation | Forge records allowlisted execution metadata such as Claude version, dispatch mode, diagnostic mode, tier, branch, and selected `FORGE_*` flag names for resume/debug context. | Old status files parse with empty metadata |

## v2.1.163 New Capabilities

### 1. Managed Version Settings
Forge uses `requiredMinimumVersion` in plugin configuration to declare the minimum Claude Code version. On SessionStart, `scripts/bootstrap-check.mjs` validates the current version and outputs diagnostics for incompatible versions.

### 2. Stop/SubagentStop additionalContext
`scripts/stop-additional-context.mjs` uses `hookSpecificOutput.additionalContext` to provide structured feedback when Forge detects:
- Missing verification evidence during active phases
- Incomplete tasks at session end
- Auto-advance gaps (no-idle iron law)
- Subagent failures with retry guidance

On versions < 2.1.163, Stop hooks fall back to existing stdout reminders.

### 3. Plugin Health Diagnostics
`forge-doctor` now checks:
- Claude Code version compatibility (>= 2.1.163)
- Plugin manifest integrity and version consistency
- Hook configuration completeness (all key events)
- Bin script availability (`--help` verification)
- MCP server source/dist availability

Run `forge-doctor --json` for structured output with `fixHint` per check.

### 4. Session ID Consistency
`src/session-id.ts` provides a unified session id resolver with priority chain:
hook stdin `session_id` → `CLAUDE_CODE_SESSION_ID` → `CLAUDE_SESSION_ID` → pid fallback.

This ensures consistent lock/cache namespace across hooks, Bash scripts, and MCP server.

### 5. Path Equivalence Security
`src/path-equivalence.ts` provides canonicalization for `~`, `$HOME`, `${HOME}`, relative paths, and symlink targets. Integrated into `src/sandbox-phased.ts` to prevent bypassing frozen-zone and deny rules via path equivalence.

### 6. Background Process Reaping
`execCommandTracked()` in `src/mcp/tools/forge-exec.ts` spawns commands in detached process groups. On shell exit or timeout, it kills the entire process group and reaps remaining background processes via `src/process-tree-cleaner.ts`. The MCP server's graceful shutdown calls `ProcessRegistry.shutdownAll()`.

## Degradation Strategy

When a feature is unavailable, Forge degrades gracefully:

1. **Hook features** — Hooks that fail or are unrecognized are silently ignored (fail-open design)
2. **Config fields** — Unknown fields in plugin.json are ignored by older Claude Code versions
3. **Frontmatter** — Unknown frontmatter keys in agent/skill files are ignored
4. **MCP tools** — If forge-context server is unavailable, hooks that depend on it exit 0
5. **Version gate** — If `claude --version` is unavailable, bootstrap outputs soft diagnostic only
6. **Stop additionalContext** — If not supported, Stop hooks output legacy stdout reminders
7. **Session id** — If hook/Bash/MCP sources disagree, resolver logs warning but continues

## bin/ Commands

| Command | Description |
|---------|-------------|
| `forge-doctor` | Project health check (version, plugin, hooks, bin, MCP) |
| `forge-status` | Show current task status |
| `forge-restate` | Trigger restatement checkpoint (optional `--check` tool) |

All bin/ commands support `--help`.
