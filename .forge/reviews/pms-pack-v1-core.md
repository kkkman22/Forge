---
topic: "pms-pack-v1-core"
date: "2026-05-10"
result: "pass"
reviewed_at_commit: "c3678a9e33193b6a4a75a5b723d1e37a10244f8d"
p0_count: 0
p1_count: 0
p2_count: 4
p3_count: 10
layers:
  - name: spec-check
    status: pass
    findings: 0
  - name: quality-check
    status: pass
    findings: 14
  - name: security-check
    status: pass
    findings: 10
---

# Review: pms-pack-v1-core

## Layer 1 — Spec Alignment

R4 (State Machine Engine): AC1-AC4, AC6 verified. Engine exposed via `loadStateMachineDefinition`, `validateDefinition`, `deriveStatePropertyTests`. ST001-ST005 validation rules implemented. Property test derivation generates fast-check code fragments. Zero-Pack-Zero-Impact holds.

R5 (Forced Acceptance Gate): AC1-AC4, AC7 verified. `shouldBlockShip` in accept-gate.ts with 6-case logic. `checkShipGateWithAcceptance` in ship.ts integrates gate. Zero-Pack no-block confirmed.

R6 (Mutation Testing): AC1-AC3, AC6-AC8 verified. SKILL.md ≤150 lines with 8 mutation categories. Stryker integration via `npx stryker run`. Sprint 2 warn-only. Artifact written to `.forge/mutation/`.

R8 (XML Iron Law Tags): AC1-AC5 verified. 4 IRON-LAW tags in CLAUDE.md. 5 HARD-GATE tags across skill files and config.md. Uniqueness validated by check-iron-laws.sh (10 unique names). No wording changes.

R9 (Rationalization Expansion): AC1-AC5 verified. 15+ entries in 5 sub-categories with Chinese rebuttals.

Scope creep: None detected. Delta files (CLAUDE.md, templates/CLAUDE.md) contain only IRON-LAW tag wrapping as specified.

## Layer 2 — Code Quality (4 P2, 6 P3)

| # | Sev | File | Issue |
|---|-----|------|-------|
| 1 | P2 | `src/mutate.ts:296-298` | Hardcoded concurrency `2` and timeout `600_000` — make configurable via options |
| 2 | P2 | `src/build-micro-review.ts:114` | Magic number `0.5` keyword threshold — extract as `KEYWORD_MATCH_THRESHOLD` |
| 3 | P2 | `src/accept-gate.ts:87` | Regex `/##\s+Scenarios\b/` could match unintended content — add word boundary |
| 4 | P2 | `src/mutate.ts:292` | Magic number `2` for JSON indent — extract as constant |
| 5 | P3 | `src/build-micro-review.ts:76-82` | Complex pluralization logic — extract to `normalizeWord()` function |
| 6 | P3 | `src/build-micro-review.ts:96` | Magic number `1` for min word length |
| 7 | P3 | `src/build.ts:241` | Magic number `10` for output line limit |
| 8 | P3 | `src/state-machine/loader.ts:47` | Generic error message — use named `YAMLParseError` class |
| 9 | P3 | `src/state-machine/property-derivation.ts` | `as any` in generated templates — acceptable for code templates |
| 10 | P3 | `src/mutate.ts:296` | Config path could use path normalization for defense-in-depth |

## Layer 3 — Security & Risk (0 P0, 0 P1, 3 P2→downgraded, 7 P3)

**Claims investigated and downgraded:**

| Original | Actual | File | Reason |
|----------|--------|------|--------|
| P1 command injection | P3 advisory | `src/mutate.ts:296` | `execFileSync` does NOT spawn shell. Args are array. Config path is trusted. |
| P1 YAML deserialization | P3 advisory | `src/state-machine/loader.ts:45` | `yaml` 2.8.4 default `parse()` uses CORE_SCHEMA, no `!!js/function` support. |
| P2 ReDoS | P3 advisory | `src/build-micro-review.ts:56-69` | Anchored regex on git diff output (trusted source). No backtracking risk. |
| P2 code injection | P3 advisory | `src/state-machine/property-derivation.ts` | Generated template strings, not executed code. |
| P2 regex injection | P3 advisory | `src/accept-gate.ts:111` | Static regex pattern on artifact content. |
| P2 dependency risk | P3 advisory | `package.json` | Stryker 9.6.1 is mainstream; recommend periodic `npm audit`. |
| P2 ship.ts injection | Invalid | `src/ship.ts:396` | Line is `output.slice(0, 5000)` — string slicing, not command execution. |

## Summary

✅ Pass | P0: 0 | P1: 0 | P2: 4 | P3: 10

All P1 claims were false positives upon verification. P2 findings are cosmetic/configuration improvements that don't affect correctness or security. No ship blockers.
