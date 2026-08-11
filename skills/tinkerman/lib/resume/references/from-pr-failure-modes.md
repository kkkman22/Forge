---
updated: 2026-08-11
---
# --from-pr Failure Modes Reference

Detailed failure mode handling for `/tinkerman resume --from-pr`.

| Scenario | Script Behavior | SKILL Presentation |
|----------|----------------|-------------------|
| PR URL format invalid | exit 3 | "URL format invalid, check input" |
| `gh`/`glab` not installed | fetcher returns `none`, continues | Warning: "gh not installed, degraded to branch inference" |
| Remote API timeout (10s) | fetcher returns `none`, continues | Warning: "Remote query timeout" |
| PR not found | exit 1 | "PR not found" + suggest `gh auth status` |
| Slug resolution all sources fail | Interactive: prompt; Non-interactive: exit 1 | List `.forge/specs/` for selection |
| CC `--from-pr` not supported | Continue Forge-only, print warning | "CC version <2.1.29, session not restored, Forge state only" |
| `.forge/status.md` conflict | Interactive: prompt; Non-interactive: exit 1 | Show diff between current and proposed slug |
| Network unavailable | fetcher returns `none`, continues | Warning + degrade to branch inference |
