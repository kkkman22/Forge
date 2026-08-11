---
updated: 2026-08-11
---
# Node PTY Fallback Reference

## Overview

Tier 4 adapter using `node:child_process` spawn + pipe as last resort. Optionally uses `node-pty` if installed in user's project [R5.9].

## Detection

Always available as last-tier fallback. If `require('node-pty')` succeeds in user project, enhanced PTY mode is used.

## Capabilities

| Mode | stdin | stdout | stderr | Interactive |
|------|-------|--------|--------|-------------|
| spawn + pipe | Write | Read | Read | No (piped) |
| node-pty (optional) | Write | Read | Read | Yes |

## Constraints

- Forge's `package.json` MUST NOT add `node-pty` as dependency [R5.9]
- `require('node-pty')` is guarded — failure falls back to spawn+pipe
- Timeout: 30s default, configurable via options
