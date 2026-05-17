---
topic: forge-single-entry-skills-collapse
phase: build_complete
date: 2026-05-17
ready_for_review: true
spec_ref: ".kiro/specs/forge-single-entry-skills-collapse/spec.md"
plan_ref: ".forge/plans/forge-single-entry-skills-collapse.md"
adr: "ADR-0004"
---

# Build Summary — forge-single-entry-skills-collapse

## Phase Status

Build phase complete. Ready for `/forge review`.

## Tasks Completed (15/15 + 1 spike + multiple fix-ups)

| # | Task | Main Commit |
|---|------|-------------|
| 0 | Wave 0 spike | a92d8e7 + 7f8f51f |
| 1 | RED R1 contracts | 75d3211 |
| 2 | RED R2 contracts | e12e8f7 |
| 3 | RED R3-R6 contracts | a5e9bcf |
| 4a | Allowlist + path | 8cec47f |
| 4b | Tools + fence | 12af279 |
| 4c | Audit log + HMAC | 13853bd |
| 4d | Chokepoint orchestrator | d6ef6a0 |
| 5 | Migration script | f1eb7de |
| 6 | Physical migration | a3b7950 (+ 5 fix commits) |
| 7 | Registry + manifest | 9ea04a1 (+ 3 fix commits) |
| 8 | Dispatcher SKILL.md | 4e898ed |
| 9 | commands/forge.md stub | 816327c |
| 10 | dispatcher_mode flag doc | bce89b2 |
| 11 | Test path rewrites | eea0784 |
| 12 | Docs/agents/knowledge/lib | 0610fb6 (+ 4 commits) |
| 13 | ADR-0004 | 5fed05b |
| 14 | dist-plugin sync | 33f5c00 |
| 15 | Final validation | (this commit) |

## Test Results (final)

- Full suite: 466/466 files, 5851/5851 tests, 0 fails
- single-entry: 26/26 files, 146/146 tests
- 0 regressions

## Automated Verification (Task 15 §1-7)

| # | Check | Result |
|---|-------|--------|
| 1 | vitest full suite | PASS (466/466, 5851/5851) |
| 2 | tsc --noEmit | PASS (exit 0 — fixed audit-log type narrowing + stale @ts-expect-error) |
| 3 | check-registry-parity.sh | PASS (exit 0, "registry.toml is up to date") |
| 4 | manifest determinism | PASS (regenerated, committed) |
| 5 | dist-plugin sync | PASS (diff -r exit 0 both skills/ and commands/) |
| 6 | path hardcode scan | PASS (only prose comments in src/ JSDoc + synthetic test fixtures) |
| 7 | dispatch-mode-rule | PASS (3/3) |

## Manual Evidence

| # | Item | Status | Evidence |
|---|------|--------|----------|
| R1.2 | / menu visibility | pass-pending-ship-cache-refresh | menu-visibility-2026-05-17.md — 29 `forge:forge-<sub>` still visible from v2.4.0 plugin cache |
| R2.8a | Dev mode spike | PASS | worktree-spike-2026-05-17.md |
| R2.8b | Plugin mode + silent shadow | DEFERRED | ship phase gate |

## Fixes Applied During Validation

1. `test/prepare-diff-context.test.ts` — removed stale `@ts-expect-error` (script now exists)
2. `test/single-entry/audit-log.test.ts` — added `as const` to `outcome` fields (string literal narrowing)
3. `skills/forge/lib/manifest.json` — regenerated (timestamp update)
4. `dist-plugin/skills/forge/lib/manifest.json` — synced to match

## Deferred Items (must complete before ship)

1. **R2.8b Plugin mode verification** — install plugin and re-run lib
   path resolution check. Failure → ship blocked, fallback to v2.5.1.
2. **R1.2 Plugin cache refresh** — after v2.5.0 ship, user runs
   `claude plugin update forge-official` to flush v2.4.0 cache.
   Verify `/` menu no longer shows 29 `forge:forge-<sub>` entries.

## Files Created

### Source
- `src/forge-dispatcher.ts` (chokepoint orchestrator)
- `src/forge-dispatcher/allowlist.ts`
- `src/forge-dispatcher/path-resolve.ts`
- `src/forge-dispatcher/tools-resolve.ts`
- `src/forge-dispatcher/untrusted-fence.ts`
- `src/forge-dispatcher/audit-log.ts`

### Skill
- `skills/forge/SKILL.md` (86 lines)
- `skills/forge/registry.toml` (auto-generated)
- `skills/forge/lib/manifest.json` (sha256 integrity)
- `skills/forge/lib/<29 subs>/instructions.md` (migrated)

### Tests (23 files)
- `test/single-entry/*.test.ts`

### Scripts (4 files)
- `scripts/migrate-skills-to-lib.mjs`
- `scripts/regen-skill-registry.mjs`
- `scripts/build-lib-manifest.mjs`
- `scripts/check-registry-parity.sh`

### Docs
- `.forge/decisions/ADR-0004-skills-collapse-and-dispatcher.md`
- `.forge/findings/worktree-spike-2026-05-17.md`
- `.forge/findings/menu-visibility-2026-05-17.md`
- `.forge/findings/build-summary-forge-single-entry-skills-collapse.md`

## Files Modified

- `commands/forge.md` (195 → 13 lines, thin stub)
- 17 test files (path rewrites)
- 12 docs/agents/knowledge files (path + content updates)
- `src/skill-function-registry.ts` (99 path refs rewritten)
- `README.md`, `ROADMAP.md`, `CHANGELOG.md`
- `.forge/config.md` (dispatcher_mode flag doc)
- `.forge/decisions/ADR-0003-...` (Update 2026-05-17 section)
- `.forge/knowledge/skill-style-guide.md` (v2.0)
- `.forge/knowledge/adr-index.md` (ADR-0004 entry)
- `dist-plugin/` (mirror rebuild)

## Next Phase

Ready for: `/forge review`

Reviewers will validate:
- Layer 1 (spec-check): C1-C10 controls vs spec R2.x acceptance criteria
- Layer 2 (quality-check): dispatcher code quality, error handling,
  test coverage, naming
- Layer 3 (security-check): topic allowlist, path safety, tool scoping,
  untrusted fence, audit log integrity, registry tamper protection

P0/P1 findings → block ship. P2/P3 → discuss.

After review pass: `/forge test` (smoke + behavior verification) →
`/forge ship` (with R2.8b plugin mode gate as ship blocker check).
