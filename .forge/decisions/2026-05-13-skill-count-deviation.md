---
date: "2026-05-13"
topic: "skill-count-deviation"
status: "deviation-recorded"
---

# Skill Count Deviation Report

## Current State

| Metric | Count |
|--------|-------|
| `skills/forge-*/SKILL.md` files | 29 |
| Pack-conditional excluded (forge-mutate) | 1 |
| Generated command files | 28 |
| SST subcommands (commands/forge.md) | 22 |
| R17 target range | 18-22 |

## Deviation Analysis

**SST (22) falls within target range (18-22).** The 22 registered subcommands are the user-facing surface.

The 6 "hidden" skills (28 - 22) are accessible through routing but not listed as direct `/forge <subcommand>` entries:
- `forge-grill` — invoked via routing or explicit `/forge grill`
- `forge-zoom-out` — invoked via routing
- `forge-storm` — DDD event storming, sub-step of `/forge spec`
- `forge-decide-teams` — Agent Teams PoC (explicitly retained)
- `forge-router` — internal routing logic, not user-facing
- `forge-mutate` — pack-conditional, excluded from default

## Pending Reductions (R14/R16 decisions)

After 14-day usage metrics window:
- R14: potential merge of refactor/fix/fix-conflicts → forge-maintenance (-2 to -3 skills)
- R16: potential merge of grill → decide, zoom-out → debug (-0 to -2 skills)

Best case after decisions: 22 - 5 = 17 (below range, needs adjustment)
Worst case: 22 (no merges, already in range)

## Conclusion

**No action needed now.** SST=22 is within the 18-22 target. R14/R16 evaluations will determine if further reduction is warranted. Deviation file serves as the justification record per R17.2.
