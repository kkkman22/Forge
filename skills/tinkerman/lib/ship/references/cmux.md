---
updated: 2026-08-11
---
# cmux Integration — Ship Phase

## Overview

When cmux is installed, Forge ship phase signals completion to the cmux sidebar.

## Integration Points

- **Events**: `sdk-driver.ts` writes `ship_complete` event to `.forge/events.ndjson`
- **Sidebar**: Phase transitions to "ship" icon (paperplane), then to "idle" or "learn"
- **Notifications**: Ship completion triggers cmux notification

## How It Works

1. Ship phase starts → phase icon changes to paperplane
2. Ship completes → notification sent, phase transitions
3. If full tier → auto-advance to learn phase

## Zero-Impact

Ship proceeds identically without cmux. The ship gate checks and commit verification are unaffected.

## Related Files

- `src/sdk-driver.ts` — lifecycle events
- `scripts/cmux-mirror/mirror.mjs` — daemon watches for state changes
- `scripts/cmux-mirror/sync-once.mjs` — hook-triggered sync
