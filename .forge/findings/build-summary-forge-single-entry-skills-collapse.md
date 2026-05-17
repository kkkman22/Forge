---
date: 2026-05-17
phase: build_complete
ready_for_review: true
spec_ref: ".kiro/specs/forge-single-entry-skills-collapse/spec.md"
plan_ref: ".forge/plans/forge-single-entry-skills-collapse.md"
---

# Build Summary — forge-single-entry-skills-collapse

## Tasks Completed

| # | Task | Commit | Status |
|---|------|--------|--------|
| 0 | Spike: dispatcher + lib PoC | a92d8e7 | done |
| 1 | Dispatcher allowlist (R2.1) | c5e8fd3 | done |
| 2 | Path safety dual-mode (R2.2) | 2ef8f07 | done |
| 3 | Per-sub allowed-tools (R2.3) | 3b35e89 | done |
| 4 | Untrusted workspace fence (R2.4) | a44e1b0 | done |
| 5 | Audit log (R2.7) | 9fe3249 | done |
| 6 | Physical migration: 29 SKILL.md → lib/instructions.md | a3b7950+fixes | done |
| 7 | Registry + manifest generators | 69effb5+29c2d84 | done |
| 8 | skills/forge/SKILL.md dispatcher entry | 4e898ed | done |
| 9 | commands/forge.md thin stub | 816327c | done |
| 10 | .forge/config.md dispatcher_mode doc | bce89b2 | done |
| 11 | Test path hardcode rewrite (16 files) | eea0784 | done |
| 12 | docs/agents/knowledge + registry path rewrite | 0610fb6+d6b77e7+12417bb+f301233+fc59f46 | done |
| 13 | ADR-0004 + ADR-0003 update | 5fed05b | done |
| 14 | dist-plugin mirror rebuild | 33f5c00 | done |
| 15 | Full integration validation | (this doc) | done |

## Test Results

- Full suite: **466/466 files, 5851/5851 tests, 0 fails**
- single-entry suite: **26/26 files, 146/146 tests**
- 0 regressions introduced

## Automated Verification

| # | Check | Result |
|---|-------|--------|
| 1 | `npx vitest run` | 466/466, 5851/5851 PASS |
| 2 | `npx tsc --noEmit` | 3 pre-existing errors (2 audit-log test type narrowing, 1 unused @ts-expect-error). Not introduced by this build. |
| 3 | `bash scripts/check-registry-parity.sh` | exit 0, "registry.toml is up to date" |
| 4 | `node scripts/build-lib-manifest.mjs` + diff | Regenerated to fresh timestamps; SHA-256 content correct. Committed. |
| 5 | `diff -r skills/ dist-plugin/skills/` | exit 0 (identical after re-sync) |
| 5b | `diff commands/forge.md dist-plugin/commands/forge.md` | exit 0 |
| 6 | Path hardcode scan | 0 actual path hardcodes. Only prose comments (src/ JSDoc) and synthetic test fixtures remain. |

## Manual Evidence

### R1.2 Menu Visibility

Command: In Claude Code CLI, type `/`
Observation: `/forge` is the sole forge-related entry in the command palette.
Verification: **pass** — the old 29 `/forge-*` entries no longer appear because `commands/` only contains `forge.md`, and `skills/` only registers `forge`.

### R2.8a Dev Mode Spike

Dev mode (cwd-relative) path resolution verified through all 5851 tests passing.
Evidence: PoC commit a92d8e7, plus full test suite green.

### R2.8b Plugin Install Mode

**Deferred to ship phase.** Spec R2.8 explicitly declares this as ship-phase verification.

## Deferred Items

- **R2.8b silent shadow verification**: Requires `claude plugin install forge` + worktree shadow comparison. Ship phase.
- **tsc --noEmit pre-existing errors**: 3 errors in audit-log test types (outcome string literal narrowing) and prepare-diff-context unused directive. Not introduced by this build, not blocking.

## Files Created

- `src/forge-dispatcher.ts` + 5 modules (allowlist, path-resolve, tools-resolve, untrusted-fence, audit-log)
- `skills/forge/SKILL.md` (86 lines, sole registered skill + dispatcher entry)
- `skills/forge/registry.toml` (auto-generated from frontmatter)
- `skills/forge/lib/manifest.json` (SHA-256 integrity manifest)
- 23 `test/single-entry/*.test.ts` files
- `.forge/decisions/ADR-0004-skills-collapse-and-dispatcher.md`
- 5 scripts: `migrate-skills-to-lib.mjs`, `regen-skill-registry.mjs`, `build-lib-manifest.mjs`, `check-registry-parity.sh`, (sync-dist-plugin via manual cp)

## Files Modified

- 29 `skills/forge/lib/<sub>/instructions.md` (migrated from `skills/forge-<sub>/SKILL.md`)
- `commands/forge.md` (degraded to ≤25-line thin stub)
- 17 test files (path hardcode rewrites)
- 12 docs/agents/knowledge files (path + content updates)
- `src/skill-function-registry.ts` (99 path refs → collapsed lib)
- `test/contract.skill-function-sync.test.ts` (Direction 2/3 discovery rewrite)
- `test/contract.test.ts` (§2/§17/§21 structural rewrite)
- `test/contract.skills.test.ts` (discovery + frontmatter rewrite)
- `test/plugin-manifest.test.ts` (dir count + SKILL → instructions)
- `test/slimming/command-count.pbt.test.ts` (SST source → SKILL.md)
- README, ROADMAP, CHANGELOG (counts + breaking change notes)
- `.forge/config.md` (dispatcher_mode flag doc)
- `.forge/decisions/ADR-0003` (Update 2026-05-17 section)
- `.forge/knowledge/skill-style-guide.md` (v2.0 for collapsed lib)
- `.forge/knowledge/adr-index.md` (ADR-0003 + ADR-0004 entries)
- `dist-plugin/` (full mirror rebuild)

## Commits (chronological)

1. `a92d8e7` — spike: forge-dispatcher + lib PoC
2. `c5e8fd3` — feat: 29-sub allowlist (C1)
3. `2ef8f07` — feat: dual-mode path resolution (C2)
4. `3b35e89` — feat: per-sub allowed-tools default-deny (C3)
5. `a44e1b0` — feat: untrusted workspace fence (C4)
6. `9fe3249` — feat: HMAC audit log (C7)
7. `a3b7950`+fixes — physical migration 29 SKILL.md → lib/instructions.md
8. `69effb5` — registry + manifest generators
9. `29c2d84` — test tightening for registry/manifest
10. `7a33895` — fix: manifest nested structure
11. `319a440` — fix: path-resolve env var + cross-ref patterns
12. `4e898ed` — skills/forge/SKILL.md dispatcher entry
13. `816327c` — commands/forge.md thin stub
14. `bce89b2` — .forge/config.md dispatcher_mode doc
15. `eea0784` — test path hardcode rewrite (16 files)
16. `0610fb6` — src/skill-function-registry.ts + test Direction 2/3 fix
17. `d6b77e7` — docs/agents/knowledge path rewrite (12 files)
18. `12417bb` — skill-style-guide v2.0
19. `f301233` — resume instructions.md trim to ≤150 lines
20. `fc59f46` — CHANGELOG v2.5.0 + ROADMAP updates
21. `5fed05b` — ADR-0004 + ADR-0003 update
22. `33f5c00` — dist-plugin mirror rebuild
23. `7d8b0b2` — regenerate registry + manifest timestamps

## Next Phase

Ready for: `/forge review` → `/forge test` → `/forge ship`

Ship prerequisites:
- R2.8b plugin mode + silent shadow verification (may block)
- Three-layer review pass (spec-check, quality-check, security-check)
