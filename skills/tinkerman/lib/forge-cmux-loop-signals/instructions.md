---
updated: 2026-08-11
description: "Use when Forge Loop iterations are running and cmux sidebar signals are needed (requires cmux)"
dispatch_mode: inline
allowed_tools:
  - Read
  - Bash
---

# Forge Loop Signals

Displays Forge Loop iteration state in the cmux sidebar — running, interrupted, or terminated.

## 1. Overview

This skill displays Forge Loop iteration state in the cmux sidebar — running, interrupted, or terminated.

## Loop States Displayed

- **Running** (blue): Active iteration in progress
- **Interrupted** (red): Loop stopped by error or user
- **Terminated** (green): Loop completed all iterations

## Activation

Automatic when Mirror_Daemon detects Loop events in the `.tinkerman/events.ndjson` stream.

## Requirements

- Mirror_Daemon running (`scripts/cmux-mirror/mirror.mjs`)
- Forge Loop active (`/tinkerman loop`)
- cmux installed

## Zero-Impact

Loop execution is unaffected. Signals are display-only.
