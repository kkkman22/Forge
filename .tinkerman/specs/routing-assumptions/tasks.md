---
feature: routing-assumptions
layout: tasks
created: 2026-05-01
spec_ref: ".tinkerman/specs/routing-assumptions/requirements.md"
---

# Tasks

## Task 1: Update router.ts types

- [x] 1.1 Add `assumptions: string[]` field to `RoutingResult` interface in `src/router.ts`
- [x] 1.2 Update `classifyTask` function to include `assumptions: []` in its return value
- [x] 1.3 Run `npm run typecheck` to verify no type errors
- [x] 1.4 Update existing router property tests to verify `assumptions` field is always present and is a `string[]`

## Task 2: Update forge-router SKILL.md routing output template

- [x] 2.1 Add "假设" section to §2 Step 2 routing analysis output template, after "行为提示" and before confirmation prompt
- [x] 2.2 Add assumption generation guidance to §1 Step 1 (analysis dimensions: tech stack, impact scope, implementation pattern, data layer, brownfield/greenfield)
- [x] 2.3 Add assumption format specification: `N. <判断>（基于 <来源>）` with `→ 如有不符请纠正` footer
- [x] 2.4 Add §2 Step 3 user override handling for assumptions: user corrects an assumption → update and proceed; user doesn't respond → proceed with stated assumptions

## Task 3: Update forge-router SKILL.md status file format

- [x] 3.1 Add `assumptions` field to §5 status.md YAML frontmatter template (string array, optional)
- [x] 3.2 Document that `assumptions` field is optional for backward compatibility
- [x] 3.3 Add note that downstream SKILLs (forge-build Closure-First Probes) MAY read assumptions to detect deviations

## Task 4: Verify and test

- [x] 4.1 Run `npm run check` to confirm all tests pass
- [x] 4.2 Verify contract.test.ts passes (SKILL frontmatter unchanged)
- [x] 4.3 Verify existing router tests pass without modification
