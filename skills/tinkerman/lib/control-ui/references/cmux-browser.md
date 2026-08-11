---
updated: 2026-08-11
---
# cmux Browser Adapter Reference

## Overview

Tier 2 adapter using cmux browser CLI commands for UI verification [R6.4].

## Capabilities

| Capability | cmux command | Purpose |
|-----------|-------------|---------|
| a11y snapshot | `snapshot --interactive --compact` | Structured accessibility tree |
| Screenshot | `screenshot --out <path>` | Visual capture |
| Post-interaction snapshot | `--snapshot-after` | Auto-capture after click/fill |
| Session persist | `state save` / `state load` | Skip repeated login flows |
| JS errors | `console list` / `errors list` | Error capture |
| Custom wait | `wait --function <js>` | Wait for app readiness |
