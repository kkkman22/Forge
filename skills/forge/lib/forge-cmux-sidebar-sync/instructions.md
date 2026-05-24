---
description: "Keep cmux sidebar in sync with Forge lifecycle state changes. Requires cmux installed."
dispatch_mode: inline
allowed_tools:
  - Read
  - Bash
---

# Forge Sidebar Sync

Keeps the cmux sidebar panel updated with current Forge phase, tier, and task progress.

## When This Activates

Automatically via `sync-once.mjs` hooks when Forge state files change. No manual trigger needed.

## What It Shows

- Current phase (decide → spec → plan → build → review → test → ship → learn)
- Task tier color coding (green/blue/red)
- Progress counter (done/total)

## Requirements

- cmux installed and available in `$PATH`
- `.forge/` directory present (Forge project initialized)

## Zero-Impact

If cmux is not installed, this skill does nothing. Forge operates identically with or without cmux.
