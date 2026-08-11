# ADR: mcp_tool Hook Audit — No Suitable Candidates Found

**Date**: 2026-05-28
**Status**: Accepted
**Requirement**: R14 (type:mcp_tool hooks)

## Context

Spec R14 required converting hooks whose "sole purpose is calling forge-context tools" from `type:command` spawn to `type:mcp_tool` direct invocation.

## Audit Findings

After auditing all 30 hooks in plugin.json, **none meet the criteria** for mcp_tool conversion:

| Hook | Does more than call MCP? | Verdict |
|------|--------------------------|---------|
| inject-evolved-rules.mjs | Reads files, parses frontmatter, outputs JSON | Not suitable |
| bootstrap-check.mjs | Reads files, checks directories | Not suitable |
| inject-plan-context.mjs | Reads files, builds context | Not suitable |
| check-context-boundary.mjs | Reads source, parses imports, checks ownership | Not suitable |
| postooluse-inject-warnings.mjs | Reads files, checks frozen zones, parses YAML | Not suitable |
| pre-compact-hook.mjs | Reads files, parses frontmatter, checks timestamps | Not suitable |
| cwd-changed-hook.mjs | Runs git, checks branch patterns | Not suitable |
| file-changed-hook.mjs | Reads files, parses status | Not suitable |
| message-display-hook.mjs | Reads stdin, tokenizes text, folds prose | Not suitable |

Every hook performs additional processing beyond what a single MCP tool call could achieve.

## Decision

Document the audit finding and defer mcp_tool conversion until:
1. A future hook is added whose sole purpose is querying forge-context
2. The forge-context MCP server exposes simpler query endpoints that could replace multi-step hook logic

## Consequences

- Hooks remain as `type:command` with exec form `args[]` (safe, no shell injection)
- Performance impact is minimal — the exec form already eliminates shell overhead
- The `hook-design-principles.md` documents the mcp_tool pattern for future use
