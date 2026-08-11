---
updated: 2026-08-11
---
# cmux Integration — Abort Phase

## Overview

When cmux is installed, Forge abort signals task cancellation to the cmux sidebar.

## Integration Points

- **Events**: `sdk-driver.ts` writes `abort` event to `.tinkerman/events.ndjson`
- **Sidebar**: Phase transitions to "idle" state
- **Notifications**: Abort triggers cmux notification

## How It Works

1. User invokes `/tinkerman abort`
2. Status file updated to empty task
3. `sync-once.mjs` detects status change → emits sidebar_state reset
4. cmux sidebar shows idle state

## Zero-Impact

Abort proceeds identically without cmux. Task state cleanup is unaffected.

## Related Files

- `scripts/cmux-mirror/sync-once.mjs` — hook-triggered sync
- `scripts/cmux-mirror/mirror.mjs` — daemon watches for state changes
