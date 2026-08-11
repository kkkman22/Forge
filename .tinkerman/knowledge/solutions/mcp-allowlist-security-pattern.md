---
created: "2026-06-06"
feature: audit-remediate-p0p1
tags: [security, mcp, allowlist, defense-in-depth]
confidence: 0.85
---

# MCP Tool Security: Allowlist > Deny-list

## Problem Pattern
MCP tools (forge_exec, forge_read) that accept user-controlled commands/scripts need input validation. Deny-list approach (block known-bad patterns) is insufficient — new bypass vectors emerge (e.g., `globalThis.process`, `import()`, `Buffer`).

## Solution
**Strict allowlist** as primary defense layer:
- `forge_exec`: Hardcoded `READONLY_COMMAND_ALLOWLIST` Set (~30 safe binaries). Command rejected unless first word matches.
- `forge_read`: `DANGEROUS_SCRIPT_PATTERNS` expanded to block `require('fs')`, `import()`, `Buffer`, `WebAssembly`, `process.binding`, `process.env`.
- `path-validator.ts`: `realpathSync` check catches symlink escapes that lexical `relative()` misses.

## Key Design Decisions
1. Allowlist is hardcoded (not configurable) — prevents runtime override
2. Shell metachar detection (`; && || | > < &`) as second layer — blocks chaining even if command is allowed
3. `ALWAYS_DENIED_SUBCOMMANDS` Map for allowed commands with dangerous subcommands (git commit/push, npm publish)
4. `node` in allowlist but `-e` scripts in forge_read are separately validated by DANGEROUS_SCRIPT_PATTERNS

## Pitfalls Hit
- `sh -c` blocked by allowlist → integration test rewrote to `node -e` with comma operator
- Semicolons in `node -e` caught by metachar detection → use comma operator `(expr1, expr2)`
- Coverage branches dip non-deterministically between runs — don't aim for exact threshold

## Reusable For
- Any MCP tool that accepts user input for execution
- Any security boundary migration from deny-list to allowlist
- CI publish gate hardening pattern (needs: [check, security-audit, plugin-validate])
