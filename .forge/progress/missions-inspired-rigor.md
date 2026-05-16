# Progress: missions-inspired-rigor

## Status: review-pass + test-pass

### Wave 1: R1 — Validation Contract ✅
- [x] T1: contract-validation.test.ts (RED) — 9 tests
- [x] T2: contract-validator.ts + spec SKILL + spec-check agent (GREEN)
- [x] T3: mark-legacy-contracts.sh — 18 specs marked

### Wave 2: R2 — Handoff Schema ✅
- [x] T4: handoff-schema.test.ts (RED) — 14 tests
- [x] T5: handoff-schema.ts + build SKILL (GREEN)

### Wave 3: R3 — Known-failures ✅
- [x] T6: known-failures-append.test.ts (RED) — 9 tests
- [x] T7: known-failures-recurrence.test.ts (RED) — 4 tests
- [x] T8: known-failures.ts + 3 review agents + review SKILL (GREEN)

### Wave 4: R4 — Events-cursor ✅
- [x] T9: events-cursor-resume.test.ts (RED) — 8 tests
- [x] T10: events-cursor.ts + forge-loop SKILL (GREEN)
- [x] T11: forge-resume SKILL (GREEN)

### Wave 5: Deferred
- [ ] T12: Dogfooding (manual)
- [ ] T13: ROADMAP update (manual)

## Test Results
- 5608/5612 tests pass (4 pre-existing failures unrelated to this PR)
- 44 new tests across 5 test files covering R1-R4

## Commits
1. `eea1d58` feat(spec): R1 validation contract
2. `2f9f1b4` chore(spec): mark 18 locked specs as contract_legacy
3. `8a3b25c` feat(build): R2 handoff schema
4. `b68d78a` feat(review): R3 known-failures
5. `b96c22d` feat(loop): R4 events-cursor + fresh-context
6. `142439e` fix: SKILL line count + test null-safety + dist resync
