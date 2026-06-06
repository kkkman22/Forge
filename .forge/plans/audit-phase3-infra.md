# Phase 3 — Infrastructure & Cleanup Plan

> Tier: Standard | Branch: `forge/audit-phase3-infra`
> Source: PROJECT_AUDIT_REPORT.md Phase 3 (5 items, excluding Tracing)

---

## Task Summary

| # | Task | Files | Risk | Dependencies |
|---|------|-------|------|-------------|
| T1 | Shadow Migration cleanup | state.ts, config-store.ts, schemas/*, tests | Medium | None |
| T2 | Token estimation CJK | New `src/token-estimate.ts`, tests | Low | None |
| T3 | findMentionedTerms tests | grill.ts, test/grill.test.ts | Low | None |
| T4 | SKILL-src parity script | New `scripts/skill-parity-check.mjs`, tests | Low | None |
| T5 | Metrics aggregation | event-writer.ts, dispatch-record.ts, tests | Low | T1 (clean state first) |

Execution order: **T1 → T2 → T3 → T4 → T5** (cleanup first, then additive)

---

## T1: Shadow Migration Cleanup

**Goal**: Remove all legacy parse paths now that Zod is the default (Phase 2 flipped gate).

### Changes

1. **`src/state.ts`**:
   - Remove `parseStatusFileLegacy()` function (~55 lines)
   - Remove `parseReviewReportLegacy()` function (~60 lines)
   - Change `parseStatusFileGraceful()` → directly call `parseStatusFileViaSchema()`
   - Change `parseReviewReportGraceful()` → directly call `parseReviewReportViaSchema()`
   - Remove `FORGE_USE_ZOD_PARSER` env var checks

2. **`src/config-store.ts`**:
   - Remove `parseConfigLegacy()` function (~40 lines)
   - Change `parseConfigGraceful()` → directly call `parseConfigViaSchema()`
   - Remove `FORGE_USE_ZOD_PARSER` env var check

3. **Test updates**:
   - `test/state-schema-shadow.test.ts` → Remove legacy-path assertions, keep schema-only
   - `test/config-store-schema-shadow.test.ts` → Same
   - `test/state-review-schema-shadow.test.ts` → Same
   - `test/state-resilience.test.ts` → Update expectations (Zod validates differently)
   - `test/config-store-resilience.test.ts` → Update expectations
   - `test/state/parse-review-report-legacy.test.ts` → Remove or rename to schema test
   - `test/zod-default.test.ts` → Update (gate removed, just verify schema works)

### TDD Cycle
1. RED: Write test that `parseStatusFileGraceful` calls schema regardless of env var
2. GREEN: Remove legacy path, inline schema call
3. REFACTOR: Rename `parseStatusFileViaSchema` → inline into `parseStatusFileGraceful`
4. Repeat for config and review report

### Verification
- `npx vitest run test/state test/config-store` — all pass
- `grep -r "FORGE_USE_ZOD_PARSER" src/` — returns nothing
- `grep -r "parseStatusFileLegacy\|parseReviewReportLegacy\|parseConfigLegacy" src/` — returns nothing

---

## T2: Token Estimation CJK Optimization

**Goal**: Create locale-aware token estimation utility.

### Implementation

1. **New file `src/token-estimate.ts`**:
   ```typescript
   export function tokenEstimate(text: string): number {
     if (text.length === 0) return 0;
     // CJK ranges: Han, Hiragana, Katakana
     const cjkCount = (text.match(/[一-鿿぀-ゟ゠-ヿ가-힯]/g) ?? []).length;
     const nonCjkLength = text.length - cjkCount;
     // CJK: ~1.5 chars/token, Latin: ~4 chars/token
     return Math.ceil(cjkCount / 1.5 + nonCjkLength / 4);
   }
   ```

2. **New test file `test/token-estimate.test.ts`**:
   - Empty string → 0
   - Pure English "Hello world" → ~3
   - Pure CJK "你好世界" → ~3 (4 chars / 1.5)
   - Mixed "Hello你好" → ~4
   - Korean "안녕하세요" → ~3
   - Long mixed text accuracy

### TDD Cycle
1. RED: Write 6 tests for token estimate
2. GREEN: Implement function
3. REFACTOR: Extract CJK regex constant

### Verification
- `npx vitest run test/token-estimate.test.ts`

---

## T3: findMentionedTerms Tests + Minor Optimization

**Goal**: Add test coverage for the untested `findMentionedTerms` function in grill.ts.

### Implementation

1. **Export `findMentionedTerms`** from grill.ts (currently private — add `@internal` export)

2. **New test file `test/grill-mentioned-terms.test.ts`**:
   - Empty description → empty array
   - Single term match → returns that term
   - Multiple terms, returns in order of first appearance
   - Alias match → returns the parent term
   - Case-insensitive matching
   - No matches → empty array
   - Dedup: same term matched by multiple aliases → single entry

### TDD Cycle
1. RED: Write 7 tests (function not exported yet)
2. GREEN: Export function from grill.ts
3. REFACTOR: No optimization needed — O(n*m) is fine for current glossary sizes

### Verification
- `npx vitest run test/grill-mentioned-terms.test.ts`

---

## T4: SKILL-src Parity Validation Script

**Goal**: Create an automated script that checks instructions.md rules have src/ counterparts.

### Implementation

1. **New file `scripts/skill-parity-check.mjs`**:
   - Scans all `skills/forge/lib/*/instructions.md`
   - Extracts rule markers: `IRON-LAW`, `<important`, `铁律`, rule IDs
   - Scans `src/` for matching enforcement functions
   - Uses `skill-function-registry.ts` for function-to-skill mapping
   - Reports: covered rules, uncovered rules, unknown rules
   - Exit 0 if all enforceable rules covered, exit 1 if gaps found

2. **New test file `test/scripts/skill-parity-check.test.ts`**:
   - Verify script runs successfully on current codebase
   - Verify it detects a deliberately missing rule
   - Verify it passes when all rules are covered

### TDD Cycle
1. RED: Write test that script exits 0
2. GREEN: Implement script with basic extraction
3. REFACTOR: Add more rule patterns, improve reporting

### Verification
- `node scripts/skill-parity-check.mjs`
- `npx vitest run test/scripts/skill-parity-check.test.ts`

---

## T5: Metrics Aggregation Extension

**Goal**: Extend existing event system with phase duration tracking.

### Implementation

1. **`src/event-writer.ts`** — Add `writePhaseEvent()` helper:
   - Fields: phase, tier, task_slug, duration_ms, success, error_count
   - Reuses existing JSONL format and redaction

2. **`src/dispatch-record.ts`** — Add aggregation helpers:
   - `summarizeDispatches(records)` → { total, avg_duration_ms, error_rate, by_phase }
   - Pure function, testable

3. **New test file `test/dispatch-summary.test.ts`**:
   - Empty records → empty summary
   - Single record → correct aggregation
   - Multiple records → averages and rates
   - Mixed success/failure → correct error rate

### TDD Cycle
1. RED: Write 4 tests for dispatch summary
2. GREEN: Implement `summarizeDispatches`
3. REFACTOR: Add `writePhaseEvent` to event-writer

### Verification
- `npx vitest run test/dispatch-summary.test.ts`

---

## Verification Iron Law (Final)

After all tasks:
```bash
npx vitest run          # all tests pass
npx tsc --noEmit        # type clean
npx biome check src/    # lint clean
```
