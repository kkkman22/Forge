---
topic: partial-spec-backlog-remediation
date: 2026-06-08
result: passed
reviewed_at_commit: 50c87762
p0_count: 0
p1_count: 0
p2_count: 0
p3_count: 0
methodology: inline-after-subagent-fix
layers: spec-check,quality-check,security-check
---

# Review Report — partial-spec-backlog-remediation

## Summary

✅ **Review passed** — no P0/P1 findings remaining after fix commit `50c87762`.

| Layer | P0 | P1 | P2 | P3 |
|-------|----|----|----|----|
| Spec Alignment (L1) | 0 | 0 | 0 | 0 |
| Code Quality (L2) | 0 | 0 | 0 | 0 |
| Security (L3) | 0 | 0 | 0 | 0 |

## Layer 1 — Spec Alignment

- **REQ-01 ConfigChange**: Registered in `hooks/hooks.json` and `dist-plugin/hooks/hooks.json` with `args` exec form, timeout 3s. Contract test verifies.
- **REQ-02 Lifecycle hooks**: PermissionDenied and WorktreeRemove registered. Existing TaskCreated/WorktreeCreate/StopFailure preserved.
- **REQ-03 Args migration**: New hooks use `args`. TaskCompleted left as `command` per spec AC3 exemption (has fallback paths).
- **REQ-04 Cleanup timeout**: `timeout: 30000` + `killSignal: SIGTERM` added to `src/cleanup-chain.ts`. Regression test AC 5.4 verifies.
- **REQ-05 Resume coverage**: `test/forge-resume/resume-phase-coverage.test.ts` created. Asserts status/progress references and phase coverage.
- **REQ-06 Superseded docs**: `.forge/docs/partial-spec-satisfaction.md` updated with non-restoration declaration and post-implementation metrics.

## Layer 2 — Code Quality

- Hook manifest entries use consistent `args` array structure.
- Cleanup timeout change is minimal and localized (2 lines added).
- Contract test helper reads both manifests and asserts lifecycle events.
- All changes pass `npm run check` (biome + tsc + vitest + dist-sync + docs).

## Layer 3 — Security

**Initial findings (pre-fix)**:
- P2: `config-changed-hook.mjs` `endsWith` path traversal — **fixed** via `resolve()` + null-byte rejection.
- P2: `worktree-remove-hook.mjs` no file locking — **fixed** via O_EXCL spin-lock.
- P2: `worktree-remove-hook.mjs` `process.cwd()` unreliable — **fixed** via `FORGE_PROJECT_ROOT` env var.
- P3: `config-changed-hook.mjs` unsanitized filenames — **fixed** via `sanitizeFilename()`.
- P3: `permission-denied-hook.mjs` Agent rationale undocumented — **fixed** via inline comment.

**Post-fix state**: All security findings resolved. No P0/P1.

## Post-Review Pipeline

- P2/P3 auto-fix: N/A (already fixed in commit `50c87762`)
- Simplify: N/A (changes are minimal, no cleanup needed)

## Ship Gate

✅ **Clear** — no P0/P1 blockers.
