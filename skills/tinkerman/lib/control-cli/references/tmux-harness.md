---
updated: 2026-08-11
---
# tmux Harness Reference

## Overview

Tier 3 adapter using `tmux` for CLI/TUI verification. Sends keystrokes and captures pane output.

## Detection

`detectTmuxAvailable()` runs `which tmux` — returns true if found.

## Commands

| Operation | tmux command |
|-----------|-------------|
| Create session | `tmux new-session -d -s <id>` |
| Send text | `tmux send-keys -t <id> '<text>' Enter` |
| Send key | `tmux send-keys -t <id> <key>` |
| Capture pane | `tmux capture-pane -t <id> -p` |
| Kill session | `tmux kill-session -t <id>` |

## Error Handling

- Session creation failure → return `{ ok: false, reason }`
- All tmux errors caught and reported as tier failure reason
- Session cleaned up on success or failure
