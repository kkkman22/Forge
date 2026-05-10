# pms-marriott-sample

> **This is a sample pack, not a production pack.**

This pack demonstrates the three-layer customization mechanism of Forge's Pack system:

1. **New Context**: `contexts/bonvoy-loyalty.md` — adds a Bounded Context not in base PMS pack
2. **Additive Glossary**: `glossary/folio-billing.md` — adds chain-specific terms (union with base, not override)
3. **State Machine Override**: `state-machines/reservation.yaml` — inserts `AwaitingLoyaltyUpgrade` state
4. **New Scenarios**: `scenarios/bonvoy/` — adds Bonvoy-specific feature scenarios

## Installation

```bash
/forge init --pack pms --pack pms-marriott-sample
```

Note: `pms` must be enabled first (manual order enforcement).

## What Each Override Demonstrates

| Override | File | What it shows |
|----------|------|---------------|
| New Context | `contexts/bonvoy-loyalty.md` | Adding a completely new Bounded Context |
| Additive Glossary | `glossary/folio-billing.md` | Union merging of chain-specific terms |
| State Machine | `state-machines/reservation.yaml` | Full override with extra state |
| Scenarios | `scenarios/bonvoy/*.feature` (5 files) | New scenarios in a new subdomain |

## Experimental Flag

This pack declares `experimental: true` in its manifest. This is informational only and does not affect functionality.
