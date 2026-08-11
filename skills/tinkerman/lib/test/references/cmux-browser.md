---
updated: 2026-08-11
---
# cmux Browser QA Reference

## Overview

When cmux is installed, `/tinkerman test` can use `cmux browser` commands for browser-based QA verification. This is a fallback — not required for Forge to function.

## Integration Point

- **Script**: `scripts/cmux-mirror/browser-qa.mjs`
- **Trigger**: `/tinkerman test` phase, only when `cmuxAvailable()` returns true
- **Zero-Impact**: If cmux is not installed, browser QA is skipped entirely

## Three-State Verdict

| Verdict | Meaning |
|---------|---------|
| `pass` | All browser steps completed successfully |
| `fail` | One or more steps returned a non-zero exit code |
| `inconclusive` | cmux unavailable, browser unsupported, or error occurred |

## QA Steps

1. `cmux browser navigate about:blank` — initialize browser
2. `cmux browser evaluate document.readyState` — verify page context
3. `cmux browser screenshot` — capture visual state

## Artifact

On completion, writes `.tinkerman/.cmux-browser-qa.json` containing `{ verdict, failures, steps, timestamp }`.

## Requirements (R8)

- R8.1: Unavailable → inconclusive
- R8.2: Unsupported browser → inconclusive
- R8.3: All pass → pass
- R8.4: Step fail → fail
- R8.5: Artifact written on request
- R8.6: EPIPE → inconclusive
- R8.7: Valid verdict type
- R8.8: Never throws
- R8.9: CTK yield during capture
