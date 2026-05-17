## Summary

`/forge:forge-learn` outputs for v2.5.0 session (forge-single-entry-skills-collapse).

## Contents

1. **R9 evolved rule** — "Verdict Claims Must Cite Evidence and Be Re-verified". Added to `.forge/knowledge/evolved-rules.md`, rule_count 8 → 9.
   - Backed by 5+ instances of self-reported PASS contradicted by independent verification during this session
   - Cross-references: `forge:forge-review` quality gate, `forge:forge-test` verification iron law, spec.md `update_after_lock` pattern

2. **R8 confidence bump** 0.85 → 0.9 — re-triggered during learn pass; cross-references added to solutions doc + ADR-0004

3. **Learn report** at `.forge/findings/learn-report-forge-single-entry-skills-collapse.md`:
   - 4 execution quality dimensions scored
   - Overall verdict: needs-improvement (security stubs reached review; 13 stale tests leaked)
   - 3 problem patterns, 3 solution patterns (existing), 4 pitfall records, 3 decision rationales, 3 reusable patterns
   - 4 ranked action items
   - Knowledge base health: 9/15 rules, no stale, cross-refs added

4. **Solutions doc confidence** 0.85 → 0.9 with cross-references

## Verification

- All 3 file changes are docs-only
- No source code or test changes
- Builds on existing artifacts merged in PR #14 (sessions/solutions stub)

## References

- v2.5.0 main commit: `6029ce6`
- Tag: `v2.5.0`
- ADR-0004: `.forge/decisions/ADR-0004-skills-collapse-and-dispatcher.md`
- Hotfix PR: #14 (merged)
