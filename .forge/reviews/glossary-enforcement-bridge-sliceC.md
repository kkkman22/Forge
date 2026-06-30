# Review — glossary-enforcement-bridge (slice C)

> PR: #148 · Branch: `feat/glossary-enforcement-sliceC`
> Spec: `.forge/specs/glossary-enforcement-bridge/` (5 REQ, 5 INV, locked)
> Date: 2026-06-29 · Reviewers: spec-check / quality-check / security-check (parallel subagents)

## Verdict: PASS (ship-eligible)

Three layers complete. **P0:0 P1:2 (fixed) P2:2 (fixed) P3:several (non-blocking)**.

## Layer 1 — spec-check: PARTIAL → fixed

- REQ-1/3/5 + INV-1..5: PASS.
- **P1-1 (fixed)**: REQ-2.2 deviation — loader reimplemented `ensureGlossaryExists` semantics (sync/async gap) instead of composing it. Honest spec amendment documenting the async reimplementation as the conformance path.
- **P1-2 (fixed)**: REQ-4.2 — build/review phases (named in spec) weren't wired. Added enforcement-glossary source notes to both instruction call-sites + registered in skill-function-registry.
- P2-1 (noted, accepted): `loadEnabledPacks` errors vs warnings channel — the loader forwards warnings per REQ-2.5 literal text; errors are a separate channel.

## Layer 2 — quality-check: 1 P2 (fixed) + P3

- **P2-1 (fixed, real correctness defect)**: `mergeGlossaries` `covered` set was built only from flat — never updated as pack entries appended → pack-vs-pack term collisions (two packs defining "Guest") produced DUPLICATE appended entries. Fixed: append updates `covered` (first-pack-wins). 2 new tests (term-collision + alias-collision).
- P2-3 (noted): seeding logic duplicates `glossary-driver.ts`'s `buildInitialGlossary` — accepted (fs-contract-independent stamping; low drift risk; would require exporting an internal helper).
- P3: "no allocation" wording imprecision; missing "Validates:" header convention; asymmetric empty-string handling. Non-blocking.

## Layer 3 — security-check: PASS, no P0/P1

- **P2-1 (fixed)**: pack glossary strings now reach enforcement (widened from advisory). Added 信任边界 note to decide function-contracts (pack fields are data, never commands — same boundary as slice B advisory).
- P3-1: seeding `glossaryPath` not confined to rootDir — internal-only option, not reachable from untrusted input. Hardening suggestion only.
- P3-2..6 (verified safe): no TOCTOU; flat-sovereignty prevents shadow-suppression; flood-DoS linear-bounded; merge deterministic; **slice-B path-traversal guard NOT bypassed** (loadEnforcementGlossary consumes guarded loader output, adds no new untrusted path resolution); no new absolute-path info disclosure.

## Fixes applied

| Finding | Severity | Fix |
|---------|----------|-----|
| REQ-2.2 spec deviation (sync/async) | P1 | spec amendment documenting async reimplementation |
| build/review not wired (REQ-4.2) | P1 | instruction notes + registry entries |
| pack-vs-pack dedup defect | P2 (quality) | `covered` updated on append + 2 tests |
| enforcement trust-boundary framing | P2 (security) | 信任边界 note in decide function-contracts |

## Post-fix validation

- `npm run check` EXIT=0 — 737 files / 9063 passed
- merge tests 11/11 (incl. new pack-vs-pack dedup)
- skill-function-sync 411/411 (build/review registered)
