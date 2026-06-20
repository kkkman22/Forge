---
id: "ADR-0006"
title: "Layered Test Pyramid: Reshape accept/test from Flat E2E to Four-Layer Composition"
status: "accepted"
date: "2026-06-20"
deciders:
  - "@maintainer"
related_adrs:
  - "ADR-0005"
---

# ADR-0006: Layered Test Pyramid — Reshape accept/test from Flat E2E to Four-Layer Composition

## Context

Forge's automated-test story is currently **flat** — only two layers exist and the middle is empty:

```
accept (api/ui/cli/mixed)  ←  E2E only, mixed runner is a no-op SKIP
test   Layer 1             ←  bare vitest run
```

Three concrete code-level defects make this flat model insufficient for data-driven, permission-heavy frontends (e.g. an admin dashboard where an API response determines which business branch and UI the user sees):

1. **`mixedRunner` is a no-op** (`src/accept-driver.ts:414-419`). Any scenario whose Given/When/Then text matches more than one keyword category (`classifyScenarioType` at `src/accept.ts:310-312` returns `"mixed"` when `hits > 1`) is immediately SKIP'd with reason `"mixed runner not yet implemented"`. The hardest scenarios — exactly those that couple API data to UI rendering — are the ones Forge never verifies.

2. **API runner discards the response body** (`src/accept-driver.ts:697-701`). `buildCurlArgs` passes `-o /dev/null -w "%{http_code}"`, so `evaluateApiVerdict` (`src/accept-driver.ts:652-661`) can only match a 3-digit status code in `stdout`. There is **no way** to assert `data.role === "admin"` or any field value — the entire "API data determines UI branch" contract is unverifiable.

3. **No component / contract layer exists.** `ScenarioType` (`src/accept.ts:2`) enumerates only `"api" | "ui" | "cli" | "mixed" | "unknown"`. There is no notion of a fast, isolated, MSW-backed component test or a response-shape contract test. The only execution tiers are "real curl" or "real browser" — both slow and both requiring a live backend.

The industry-validated answer to this class of problem is a **test pyramid**: push the combinatorial explosion (N roles × M screens × K data states) down into cheap, isolated layers (unit + component), and reserve expensive E2E for a handful of critical paths. Today Forge offers no place to land that decomposition — every AC either becomes a brittle E2E or gets verified by a bare `vitest run` with no routing discipline.

This ADR does **not** mandate a specific tool stack (MSW / Playwright / Pact) on user projects. Forge must remain dependency-neutral ("never install browser/test deps" — `skills/forge/lib/control-ui/instructions.md:53-56`). The decision is about **how Forge routes, classifies, and aggregates verification**, not which runner a project uses.

## Decision

Reshape Forge's verification model from "flat accept + bare test" to a **four-layer composition** routed by a single contract field. Five changes, ordered by leverage:

### Change 1 (keystone): `Verify-By: <layer>` becomes a mandatory, layered contract

`Verify-By` already exists in the spec AC whitelist (`skills/forge/lib/spec/instructions.md:120`, enforced by `scripts/check-spec-contract.sh`). Extend its accepted grammar from flat tools to **layered tool specs**:

| `Verify-By` value | Layer | Typical runner |
|---|---|---|
| `vitest:unit` | 1 — pure logic | project vitest, matrix'd pure functions |
| `vitest:component` | 3 — isolated component + MSW | project vitest + `@vue/test-utils` / Testing Library + MSW |
| `bash:contract` | 2 — response-shape contract | JSON Schema / OpenAPI / Pact verification |
| `forge_exec:e2e` | 4 — real end-to-end | Playwright / Cypress / agent-browser |
| `manual` | — | human visual / interaction sign-off |

**Rule**: every AC **must** declare exactly one layer. `check-spec-contract.sh` rejects any AC whose `Verify-By` lacks the `:layer` suffix (with a grandfathering `contract_legacy: true` escape, mirroring the existing legacy gate at `src/contract-validator.ts:81`). This is the single forcing function: once a spec is locked, the decomposition is committed and every downstream stage knows where each AC lives.

Why this is the keystone: Forge does not need to *implement* component testing. It only needs to *route* the AC to the project's existing runner and *aggregate* the verdicts per layer. `Verify-By: <layer>` is the routing key.

### Change 2: extend `ScenarioType` with two new layers

`src/accept.ts:2`:

```ts
export type ScenarioType =
  | "unit" | "component" | "contract"   // ← NEW
  | "api" | "ui" | "cli" | "mixed" | "unknown";
```

Crucially, `classifyScenarioType` (`src/accept.ts:303`) stops guessing by keyword. For derived scenarios it falls back to keywords, but for explicit scenarios it **reads `Verify-By: <layer>` as the authoritative source of `type`**. This removes the fragile keyword heuristic for the cases that matter most.

### Change 3: add three delegates (not new engines) to `RUNNERS`

`src/accept-driver.ts:426`:

```ts
export const RUNNERS: readonly Runner[] = [
  unitRunner, componentRunner, contractRunner,  // ← NEW (delegates)
  apiRunner, agentBrowserRunner, cliRunner,
  // mixedRunner retired — composition now lives in `component`
];
```

The three new runners do **not** start a browser or hit a real API. They are thin shells that call `forge_exec` against the **project's own** test command (the one named in `.forge/config.md` `ci_check_command`, or `npm run test:unit` / `test:component` / `test:contract` by convention), scoped to the AC's `Evidence` file. They return `{ok, reason, stdout_tail}` and let `aggregateVerdicts` do the rest.

This preserves Forge's neutrality: no new test framework is pulled in. If a project has no component test suite, `componentRunner` returns `INCONCLUSIVE` with `reason: "no component suite configured"` — honest, non-blocking, surfacing the gap rather than masking it.

### Change 4: fix the API runner's body-blindness

`src/accept-driver.ts:697` (`buildCurlArgs`) gains an `assertBody` option; when the AC's `Then` references a `data.<path>` assertion, curl keeps the body instead of `-o /dev/null`. `evaluateApiVerdict` (`src/accept-driver.ts:652`) gains a JSONPath-style body matcher so `Then the response data.role shall be "admin"` is actually checked. Status-code matching is retained unchanged for back-compat.

### Change 5: per-layer health in `aggregateVerdicts`

`src/accept-driver.ts:443`:

```ts
return {
  pass, fail, skip, warn, inconclusive,
  blocksShip: fail > 0,
  layerHealth: { unit, component, contract, e2e },          // ← NEW
  pyramidShape: classifyPyramid(byLayer),                    // ← NEW
};
```

`pyramidShape` flags the anti-pattern where E2E scenario count is high while unit/component counts are zero — the exact "combinatorial explosion hoisted into E2E" smell this ADR exists to kill.

### New stage responsibilities

| Stage | Before | After |
|---|---|---|
| `spec` | AC carries `Verify-By` tool | AC carries `Verify-By: <layer>` (enforced) |
| `test` Layer 1 | bare `vitest run` | runs `unit + component + contract` suites, routed by `Verify-By` |
| `accept` | runs all scenario types including mixed (SKIP) | runs only `api/ui/cli` (E2E); composition moved to `component` layer |
| `mixed` runner | SKIP stub | retired |

## Rejected Alternatives

### Alternative A: Implement the `mixed` runner (UI-pre → API → UI-post)

**Decision**: Rejected.

**Reasoning**: A mixed runner requires inter-step state passing (capture an API response, feed it into the next UI step). This is a full sub-system with its own orchestration, fixtures, and failure modes. More importantly it keeps the combinatorial explosion in the **most expensive** layer. The pyramid approach dissolves the same need by asserting the data→branch coupling at the component layer (MSW-injected, milliseconds) and leaving only the critical path to E2E. Building `mixed` would entrench the wrong layering.

### Alternative B: Make Forge ship its own component-testing engine (built-in MSW / Storybook)

**Decision**: Rejected.

**Reasoning**: Violates the dependency-neutrality principle documented in `skills/forge/lib/control-ui/instructions.md:53-56` (R6.5 — "Forge MUST NOT install browser dependencies"). Forge is an orchestrator, not a test runner. Users who already have Storybook + MSW, or Vitest + Testing Library, should have their existing stack routed to — not replaced. Change 3's delegate pattern delivers the routing without the engine.

### Alternative C: Keep flat model, just add body assertions to the API runner (Change 4 only)

**Decision**: Rejected (insufficient).

**Reasoning**: Body assertions fix defect #2 but leave defects #1 and #3 untouched. A project with 5 roles × 8 screens would still express every data→UI branch as an E2E scenario. The body-aware API runner is necessary (Change 4 ships it) but not sufficient — without the layer routing (Changes 1-3) and the pyramid health signal (Change 5), the combinatorial cost stays in the wrong layer.

### Alternative D: Tool-driven, per-AC free-form `Verify-By` (status quo)

**Decision**: Rejected.

**Reasoning**: The current flat whitelist (`vitest | bash | forge_git | forge_exec | manual`) gives no signal about *which layer* an AC belongs to, so `aggregateVerdicts` cannot report layer health and the spec contract cannot enforce that combinatorial scenarios land in the cheap layer. The `:layer` suffix is a one-token addition with outsized routing value — it is the cheapest of the five changes and does the most work.

## Consequences

### Positive

- **Combination cost drops 1-2 orders of magnitude**: a 5×8 role×screen matrix moves from 40 E2E scenarios to 40 unit/component cases (ms-s latency) plus 3-5 E2E critical paths.
- **Honest verdicts**: `componentRunner` returning `INCONCLUSIVE` when a project has no component suite is strictly more informative than today's silent SKIP / green-by-default.
- **Layer health visibility**: `layerHealth` + `pyramidShape` surface the "E2E-heavy anti-pattern" explicitly in the acceptance report.
- **Spec-driven coverage**: `Verify-By: <layer>` turns "test coverage" from a code metric into a "requirements coverage" contract — every locked AC has a named owner file (`Evidence`).
- **Neutrality preserved**: no user-facing dependency is added; existing Playwright/MSW/Pact users get routed to, not replaced.

### Negative

- **Spec friction**: existing specs must migrate `Verify-By` values to the `:layer` grammar. Mitigated by the `contract_legacy: true` grandfathering gate already in `src/contract-validator.ts:81`.
- **More runners to test**: three new `Runner` entries each need unit + property coverage (the `routeResponseByCode`-style pure functions especially).
- **Classification shift**: moving from keyword-based `classifyScenarioType` to `Verify-By`-driven typing changes behavior for any project relying on the keyword heuristic. The derived-scenario path keeps keywords as a fallback, so the blast radius is limited to explicit scenarios that now read `Verify-By`.
- **Docs burden**: `spec` / `test` / `accept` SKILLs and `AGENTS.md` testing sections must be updated; this ADR is the anchor.

### Neutral / expected

- `mixed` as a `ScenarioType` is retained in the union (back-compat for parsed specs) but no runner serves it; classification no longer produces it for `Verify-By`-annotated scenarios.

## Rollback Plan

Each change is independently reversible:

1. **Change 1**: revert `scripts/check-spec-contract.sh` to accept bare tool names; the `:layer` suffix becomes optional, not mandatory.
2. **Change 2**: remove `unit | component | contract` from `ScenarioType`; `classifyScenarioType` returns to keyword-only.
3. **Change 3**: remove the three delegate runners from `RUNNERS`; restore `mixedRunner` to the array.
4. **Change 4**: revert `buildCurlArgs` to always `-o /dev/null`; drop the body branch in `evaluateApiVerdict`.
5. **Change 5**: revert `aggregateVerdicts` to the flat `{pass,fail,skip,warn,inconclusive,blocksShip}` shape.

Because the five changes are layered (1 enables 2-3; 3 enables 5; 4 is independent), rolling back Change 1 alone effectively disables the new routing without breaking compilation — ACs simply lose their layer tag and fall back to keyword classification.

## Implementation Order (by leverage, each independently shippable)

1. **Change 1** (1 day) — `Verify-By: <layer>` enforcement in `check-spec-contract.sh` + `spec` SKILL. Highest leverage, lowest cost. Ship first.
2. **Change 5** (1 day) — `layerHealth` + `pyramidShape` in `aggregateVerdicts` (pure function, easy to property-test).
3. **Change 2** (1 day) — extend `ScenarioType`, make `classifyScenarioType` prefer `Verify-By`.
4. **Change 4** (2 days) — API body assertion (`buildCurlArgs` + `evaluateApiVerdict` + JSONPath matcher).
5. **Change 3** (3-4 days) — three delegate runners + their property tests.
6. Docs sync: `skills/forge/lib/{spec,test,accept}/instructions.md`, `AGENTS.md` testing sections.

Each step carries its own property tests (per `AGENTS.md §2.1` TDD enforcement) and atomic commit (per `AGENTS.md §2.3`).

## Cross-References

- `AGENTS.md §2.1` TDD enforcement — every change ships RED→GREEN→REFACTOR.
- `AGENTS.md §2.3` verification iron law — each change must run its verification command before claiming done.
- `skills/forge/lib/control-ui/instructions.md:53-56` — the dependency-neutrality constraint this ADR respects (Alternative B rejection).
- `src/contract-validator.ts:81` — the `contract_legacy` grandfathering gate reused for `Verify-By` migration.
- ADR-0005 — precedent for a multi-level fallback/ladder design with reversible escape hatches.
