---
name: forge-loop-signals
description: Visual signals for Forge Loop long-running iterations in cmux sidebar
trigger: forge loop signals, cmux loop, loop monitor
---

# Forge Loop Signals

Displays Forge Loop iteration state in the cmux sidebar — running, interrupted, or terminated.

## Loop States Displayed

- **Running** (blue): Active iteration in progress
- **Interrupted** (red): Loop stopped by error or user
- **Terminated** (green): Loop completed all iterations

## Activation

Automatic when Mirror_Daemon detects Loop events in the `.forge/events.ndjson` stream.

## Requirements

- Mirror_Daemon running (`scripts/cmux-mirror/mirror.mjs`)
- Forge Loop active (`/forge loop`)
- cmux installed

## Zero-Impact

Loop execution is unaffected. Signals are display-only.
