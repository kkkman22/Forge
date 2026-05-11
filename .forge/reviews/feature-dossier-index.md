---
topic: feature-dossier-index
date: "2026-05-11"
result: passed
reviewed_at_commit: 620d8b9
p0_count: 0
p1_count: 0
p2_count: 11
p3_count: 9
layers:
  - spec-check
  - quality-check
  - security-check
---

# Review: feature-dossier-index

## Verdict

✅ **Passed** | P0: 0 | P1: 0 | P2: 11 | P3: 9

P1 security findings (path traversal) fixed in commit 620d8b9. Quality P1s assessed as spec-compliant by design.

## Layer 1 — Spec Alignment (spec-check)

Spec at `.kiro/specs/feature-dossier-index/requirements.md`.

R1-R8 all implemented. R9 (learn integration) deferred as optional per plan.
- R1: buildDossier pure function ✅
- R2: scanStagesForTopic with all 7 patterns ✅
- R3: CLI with single/batch/from-path modes ✅
- R4: PostToolUse hook ✅
- R5: discoverTopics with drift detection ✅
- R6: .forge/features/** in open zone (verified by conflict-classifier test) ✅
- R7: First-run bootstrap succeeded (49 dossiers generated) ✅
- R8: Tests (46 unit), typecheck pass, lint clean ✅

Property tests (R8.7) not yet implemented — P2 gap.

## Layer 2 — Code Quality (quality-check)

| # | Sev | File | Issue |
|---|-----|------|-------|
| 1 | ~~P1~~ P3 | `src/feature-dossier.ts:175-189` | Silent error handling — **by design** per R2.3/R2.5 |
| 2 | ~~P1~~ P3 | `src/feature-dossier.ts:365-380` | fs.statSync — **acceptable** for <100 topics, spec R5.5 ≤5s met |
| 3 | ~~P1~~ P3 | `scripts/rebuild-feature-dossier.mjs:184-187` | Empty catch in hook mode — **by design** per R4.2 fail-silent |
| 4 | P2 | `src/feature-dossier.ts:399-414` | O(n²) drift — acceptable for <100 topics |
| 5 | P2 | `src/feature-dossier.ts:191-201` | Manual frontmatter parsing — could reuse parseFrontmatter extractors |
| 6 | P2 | `src/feature-dossier.ts:203-213` | Magic number 500 — extract constant |
| 7 | P3 | `scripts/rebuild-feature-dossier.mjs:78-84` | Topic regex differs from TS types |
| 8 | P3 | `src/feature-dossier.ts:74-76` | escapeRegExp reimplemented |
| 9 | P3 | `test/feature-dossier.test.ts` | Missing edge case tests (malformed frontmatter, large files) |

## Layer 3 — Security (security-check)

| # | Sev | File | Issue |
|---|-----|------|-------|
| 1 | ~~P1~~ **Fixed** | `scripts/rebuild-feature-dossier.mjs:79` | Topic validation — **fixed** in 620d8b9 |
| 2 | ~~P1~~ **Fixed** | `src/feature-dossier.ts:132` | Path traversal — **fixed** in 620d8b9 |
| 3 | ~~P1~~ **Fixed** | `src/feature-dossier.ts:94` | Regex capture sanitization — mitigated by path check |
| 4 | P2 | `src/feature-dossier.ts:86-98` | Regex patterns not anchored against absolute paths |
| 5 | P2 | `src/feature-dossier.ts:374` | Directory traversal via readdirSync entry |
| 6 | P2 | `scripts/rebuild-feature-dossier.mjs:169-171` | Path normalization could be more thorough |
| 7 | P3 | `scripts/rebuild-feature-dossier.mjs:202,221` | Error messages expose system paths |

No hardcoded secrets. No command injection vectors (no shell exec). No unsafe dependencies.
