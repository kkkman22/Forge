---
updated: 2026-08-11
---
# cmux Harness Reference

## Overview

Tier 2 adapter using cmux CLI for CLI verification. Provides enhanced capabilities including progress reporting.

## Detection

`detectCmuxAvailable()` checks `$CMUX_WORKSPACE_ID` env var + socket file existence.

## Capabilities

| Operation | Method |
|-----------|--------|
| Send text | cmux socket command |
| Send key | cmux socket command |
| Capture output | cmux socket command |
| Progress | `set-progress` every 5s when > 5s elapsed [R5.4] |
| Log | `log` for structured logging |
| Notify | `notify` for user notifications |

## Progress Reporting [R5.4]

Only when `controllerUsed === "cmux"`:
- Track elapsed time
- Every 5 seconds: call `set-progress`, `log`, `notify`
- Other tiers MUST NOT call cmux-specific APIs
