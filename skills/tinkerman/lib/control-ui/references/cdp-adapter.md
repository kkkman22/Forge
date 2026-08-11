---
updated: 2026-08-11
---
# CDP Adapter Reference

## Overview

Tier 4 adapter using Chrome DevTools Protocol (CDP) via WebSocket for UI verification.

## Detection

Attempts WebSocket connection to `http://localhost:9222` (default Chrome debugging port). Requires user to start Chrome with `--remote-debugging-port=9222`.

## Capabilities

- Connect to running Chrome instance
- Navigate to target URL
- Capture DOM snapshots
- Execute JavaScript
- Take screenshots via CDP `Page.captureScreenshot`

## Error Handling

- Connection refused → return `{ ok: false, reason }` for tier failure
- Timeout → 10s connection timeout
