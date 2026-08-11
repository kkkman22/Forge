---
updated: 2026-08-11
---
# cmux Integration — Build Phase

## Overview

When cmux is installed, Forge build progress is reflected in the cmux sidebar as tasks complete.

## Integration Points

- **Events**: `sdk-driver.ts` writes Events_NDJSON entries at 9 lifecycle hooks (task start, task complete, phase transitions)
- **Sync**: `sync-once.mjs` hooks fire on `UserPromptSubmit`, `PostToolUse(Write|Edit)`, and `Stop` events
- **Sidebar**: Task name, progress counter, and current phase displayed

## How It Works

1. Build starts → `sdk-driver.ts` appends `{"type": "build_start", ...}` to `.tinkerman/events.ndjson`
2. Each task completion appends `{"type": "task_complete", ...}`
3. `sync-once.mjs` hooks detect `.tinkerman/` file changes
4. State diff → cmux CLI commands (set_status, set_progress, sidebar_state)

## Events_NDJSON Schema

```json
{"schema_version": 1, "type": "build_start", "timestamp": "...", "payload": {"task": "...", "tier": "..."}}
{"schema_version": 1, "type": "task_complete", "timestamp": "...", "payload": {"task_id": 1, "commit": "..."}}
```

## Zero-Impact

Without cmux, events are still written to `.tinkerman/events.ndjson` (useful for auditing). No cmux CLI calls are made.

## Related Files

- `src/sdk-driver.ts` — Events_NDJSON writer (≤100 lines added)
- `scripts/cmux-mirror/sync-once.mjs` — hook-triggered sync
- `hooks/hooks.json` — 3 sync-once hook entries
