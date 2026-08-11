# src/domain/ — In-Repo DDD Reference Domain

> **@non-production — NOT FOR PRODUCTION.** This is a readable, modifiable
> reference implementation of a DDD PMS (Property Management System) domain.
> It is **not** a Forge runtime module, is **not** shipped in the Forge dist
> bundle, and is **not** compiled by the main Forge build.

## What this is

A dogfood reference domain that demonstrates how to build a DDD aggregate that
**consumes the `src/state-machine/` engine** as its transition truth source. It
exists to resolve two sunk costs (see
`.tinkerman/decisions/2026-06-27-domain-example-reference-impl.md`):

1. **state-machine engine** — was an orphan (no real production consumer). The
   `Reservation` aggregate is its first load-bearing importer.
2. **`mutation_critical_modules`** in `packs/pms/pack.yaml` — referenced
   `src/domain/folio/**/*.ts` as an empty path; this domain makes such paths real.

## Current scope (slice A)

One aggregate: **Reservation** (the reservations bounded context). The other 7
contexts (front-desk / housekeeping / folio-billing / night-audit /
rate-inventory / channel-integration / reporting) ship later (slice A.2).

```
src/domain/
├── tsconfig.json                  # composite project ref (build-isolated)
├── index.ts                       # module placeholder (@non-production header)
└── reservations/
    ├── reservation.ts             # aggregate root (consumes state-machine engine)
    ├── reservation-machine.ts     # adapter the generated property tests drive
    ├── values.ts                  # value objects (StayPeriod / GuestInfo / RoomAssignment)
    ├── events.ts                  # domain events (PII-free)
    ├── repository.ts → service.ts # repository interface + in-memory impl + App Service
    └── errors.ts                  # InvalidTransitionError / GuardFailedError / InvalidValueError
```

Tests live in `test/` (the project vitest config collects `test/**`, not
`src/domain/**`): `reservation-transitions`, `reservation-values`,
`reservation-service`, `reservation.scenarios` (BDD), and
`reservation-state-properties.generated` (derived from yaml — the generated
body is adapted for compilation; see that file's `@generated` header).

## How it works

The `Reservation` aggregate does **not** hand-roll a transition switch. It loads
`packs/pms/state-machines/reservation.yaml` via
`loadStateMachineDefinition` (`src/state-machine/`) and asks the engine whether a
`(from, event)` transition is legal. Business guards (e.g. `payment_captured`)
are evaluated in the aggregate — the aggregate owns domain knowledge, the engine
owns transition-structure legality.

```ts
import { loadStateMachineDefinition } from "../../state-machine/index.js";
const def = loadStateMachineDefinition(reservationYaml);
const t = def.transitions.find((tr) => tr.from === state && tr.event === event);
if (!t) throw new InvalidTransitionError(state, event);
```

## Build isolation (INV-1)

- `src/domain/tsconfig.json` — `composite: true`, compiles standalone:
  `npx tsc --noEmit -p src/domain/tsconfig.json`
- root `tsconfig.json` excludes `src/domain/**` — the main Forge `tsc --noEmit`
  never compiles this directory.
- `scripts/check-domain-safety.mjs` enforces:
  - no unsafe runtime surface in `src/domain/` (eval / SQL / fs / network / secrets)
  - engine side (`src/` minus `src/domain/`) never imports the domain (one-way dep)
  - every `src/domain/*.ts` carries a `@non-production` header

## Compile & test

```bash
# standalone compile of the reference domain
npx tsc --noEmit -p src/domain/tsconfig.json

# the domain's tests run as part of the main suite
npm run check
```

## Adapting this to your own domain

This is a **reference**, not a library. Copy the patterns (aggregate consuming a
state-machine, value objects, PII-free events, in-memory repository with a
real-persistence TODO) into your own codebase. Do not import from
`src/domain/` in production Forge code — the `check-domain-safety` lint forbids
engine→domain imports precisely to keep this a one-way reference.
