---
updated: 2026-08-11
---
# Plan Split Wizard

> Triggered when user inputs "split" in response to Plan Structure Warning.

## Flow

1. **Identify Sprint boundaries**: Parse plan for `### Sprint N — <title>` headings
2. **Generate sub-plans**: Create `.forge/plans/<topic>-sprint-<n>.md` for each Sprint
3. **Each sub-plan** contains:
   - Subset of tasks belonging to that Sprint
   - Own frontmatter with `status: draft`
   - `spec_ref` pointing to original spec
   - `parent_plan: "<topic>"` for traceability
4. **Present summary**: Show list of generated sub-plans with task counts
5. **User confirms** → each sub-plan goes through own Self-Check + Approval cycle

## Split Rules

- Tasks without explicit Sprint membership go to the nearest preceding Sprint
- Cross-Sprint dependencies become inter-plan dependencies (noted in remarks)
- Shared setup tasks (dependency install, config) are duplicated into first sub-plan that needs them
- Each sub-plan must form a valid standalone plan (own verify commands, own commits)

## Not For

- Plans with < 2 Sprint groupings (no meaningful split)
- Plans already containing `monolith_acknowledged: true`
