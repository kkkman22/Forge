## Summary

Three follow-up fixes after v2.5.0 ship (commit `6127feb` merged to main):

1. **fix**: contract.test.ts had 13 failures — old `skills/forge-X/SKILL.md` assertions in dist bundle test (post-ship verify reported result as "partial")
2. **release**: bump `2.4.1` → `2.5.0` across 3 manifests (`.claude-plugin/plugin.json`, `dist-plugin/.claude-plugin/plugin.json`, `package.json`) + finalize CHANGELOG entry
3. **docs**: commit knowledge + ship artifacts that were not in the squash merge to main

## Verification

- `npx vitest run` → 5858/5858 PASS (was 5844 with 13 fail before fix)
- `npx tsc --noEmit` → exit 0
- All 3 manifest `version` fields = `2.5.0`
- `CHANGELOG.md` has empty `[Unreleased]` section above `[2.5.0] - 2026-05-17` with the full Skills-Collapse + Single-Entry entries preserved
- `git status --short` → clean

## Why This PR Exists

`/forge:forge-ship` performed a squash merge to main (commit `6127feb`) but:
1. Did not bump version field — manifests still said `2.4.1` despite shipping v2.5.0 content
2. Did not include knowledge/sessions/solutions/ship artifacts produced during build/review/ship
3. Did not catch the 13 contract.test.ts dist-bundle assertion failures (post-push verify caught them but the run still completed)

This PR reconciles those gaps so the manifest version matches the actual shipped content and the knowledge artifacts are preserved.

## Commits

| SHA | Subject |
|-----|---------|
| `6c126bd` | fix(forge-collapse): update contract.test.ts dist bundle assertions for collapsed structure |
| `d1ee44b` | release: bump version to 2.5.0 |
| `376a643` | docs(forge-collapse): knowledge + state artifacts from build/review/ship phases |

## References

- ADR-0003 (single-entry consolidation)
- ADR-0004 (skills collapse + dispatcher)
- Spec: `.forge/specs/forge-single-entry-skills-collapse/spec.md`
- Post-push verify report: `.forge/ship/forge-single-entry-skills-collapse-post-push-verify.md`

## Plugin Cache Note (R1.2 deferred item)

After merge, users running `claude plugin update forge-official` will receive v2.5.0. Existing v2.4.x plugin cache will be cleaned by Claude Code's 7-day grace period. This was tracked as the deferred R1.2 item in `.forge/findings/menu-visibility-2026-05-17.md`.
