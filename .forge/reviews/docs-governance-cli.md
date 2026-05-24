---
topic: docs-governance-cli
date: "2026-05-24"
result: pass
reviewed_at_commit: "7996411a"
p0_count: 0
p1_count: 0
p2_count: 4
p3_count: 3
methodology: subagent-parallel
layers:
  - spec-check
  - quality-check
  - security-check
---

# Review Report: docs-governance-cli (Batch 2)

## Summary

Three-layer parallel review completed. **No P0/P1 blocking issues found.** 4 P2 and 3 P3 findings identified.

## Findings

### P2 (Should Fix)

| # | Layer | File | Issue |
|---|-------|------|-------|
| 1 | Q | scripts/*.ts (6 files) | `collectMdFiles` function duplicated across check-docs-frontmatter, check-docs-bilingual, check-docs-staleness, build-docs-embeds, check-docs-embeds, migrate-docs-frontmatter, scan-literal-mismatches. Should extract to shared utility (e.g., `src/docs-governance/cli/scan-files.ts`). |
| 2 | Q | scripts/check-docs-embeds.ts + scripts/build-docs-embeds.ts | `buildRegistry()` and `loadSsotData()` functions duplicated between the two embed scripts. |
| 3 | S | .github/workflows/docs-governance.yml | No `permissions:` block. Default GITHUB_TOKEN has write access — should restrict to `contents: read`. |
| 4 | Q | scripts/migrate-docs-frontmatter.ts | `--apply` mode writes files without backup. Should create `.bak` or require `--apply --force` for destructive operation. |

### P3 (Advisory)

| # | Layer | File | Issue |
|---|-------|------|-------|
| 5 | Q | .githooks/pre-commit | No performance budget enforcement (P18: ≤1s lightweight, ≤5s standard). Consider adding timeout. |
| 6 | Q | scripts/check-docs-updated.ts | `--fix` mode auto-stages files via `git add`. Could surprise users who expected only file modification. |
| 7 | S | scripts/install-hooks.ts | Line 66: `execSync('git config core.hooksPath ${GITHOOKS_DIR}')` — GITHOOKS_DIR is a constant, not user input, so safe. No issue, just noting for audit trail. |

## Positive Findings

- All 13 CLI scripts follow consistent pattern (computeExitResult, formatDiagnostics/formatNdjson, severityToExitCode)
- Exit codes are correct: 0=OK, 1=error, 2=critical, 3=internal via computeExitResult
- No hardcoded secrets or credentials
- execSync usage is safe — only git commands with trusted inputs (file paths from git, not CLI args)
- Pre-commit hook implements correct decision tree with grace period support
- CI workflow includes bypass detection (--no-verify trailer check)
- 406 tests across 34 files, all passing
- embed-sync.ts implements idempotent rendering with P13 external byte preservation

## Spec Coverage

| Task | Script | Status |
|------|--------|--------|
| 2.5 check-docs-root-whitelist.ts | ✅ | (batch 1) |
| 3.4 check-docs-frontmatter.ts | ✅ | --json |
| 3.5 check-docs-bilingual.ts | ✅ | --json |
| 3.8 build-docs-index.ts | ✅ | writes INDEX.md + INDEX.en.md |
| 3.9 check-docs-index.ts | ✅ | byte-level sync gate |
| 3.10 migrate-docs-frontmatter.ts | ✅ | --apply/--dry-run |
| 4.2 check-docs-staleness.ts | ✅ | --json, --ci |
| 4.4 check-docs-updated.ts | ✅ | --fix, --json |
| 4.6 check-docs-links.ts | ✅ | --json |
| 4.8 check-docs-quota.ts | ✅ | --allow-grow, --json |
| 4.9 .githooks/pre-commit | ✅ | decision tree + grace period |
| 4.10 install-hooks.ts | ✅ | postinstall |
| 4.11 docs-governance.yml | ✅ | CI + bypass detect |
| 6.5 build-docs-embeds.ts | ✅ | --dry-run |
| 6.6 (embed-sync.ts) | ✅ | core module |
| 6.7 check-docs-embeds.ts | ✅ | sync gate |
| 6.9 scan-literal-mismatches.ts | ✅ | pattern scanner |

**Deferred**: 4.12 (grace_period_until config), 5.1-5.4 (learn integration), 7.1-7.5 (documentation wave).

## Verdict

**PASS** — P0:0 | P1:0 | P2:4 | P3:3
