---
status: approved
feature: token-budget-compression
layout: tasks
created: 2026-04-30
spec_ref: ".forge/specs/token-budget-compression/requirements.md"
---

# Tasks

- [x] 1 Compress forge-spec SKILL.md (17.5K → ≤12K)
  - [x] 1.1 Reduce §3 Spec template to one Canonical_Example (greenfield), replace brownfield variant with one-line diff description
  - [x] 1.2 Simplify §8 full example: keep greenfield Canonical_Example, replace brownfield variant with one-line description referencing Delta chapter
  - [x] 1.3 Compress §1.5 Import Mode conversion rules table: merge verbose cell descriptions into single-line entries
  - [x] 1.4 Compress §2 Step 1 input source table and generation rules into compact format
  - [x] 1.5 Compress §4 quality standards examples and §7 edge cases table
  - [x] 1.6 Run checkpoint: `npx vitest run test/contract.test.ts test/contract.skills.test.ts` and verify `wc -c skills/forge-spec/SKILL.md` ≤ 12,000
- [x] 2 Compress forge-loop SKILL.md (14.7K → ≤10K)
  - [x] 2.1 Compress §4.2 SKILL scheduling state machine table: replace with Reference_Directive to skill-scheduler.ts and summary of non-obvious transitions
  - [x] 2.2 Compress §4.4 confirmation point preset strategy table into compact single-column format
  - [x] 2.3 Replace §12 full execution example with ≤15-line Canonical_Example, replace scenario variants with one-line diff descriptions
  - [x] 2.4 Compress §10 status file format: remove field lifecycle table that restates §3 Step 2
  - [x] 2.5 Compress §3 startup flow and §11 edge cases
  - [x] 2.6 Run checkpoint: `npx vitest run test/contract.test.ts test/contract.skills.test.ts` and verify `wc -c skills/forge-loop/SKILL.md` ≤ 10,000
- [x] 3 Compress forge-router SKILL.md (11.7K → ≤8.5K)
  - [x] 3.1 Replace §2 three-tier table with Reference_Directive to CLAUDE.md §1, retain only router-specific command sequence extensions (refactor and fix variants)
  - [x] 3.2 Compress §6 classification examples: retain one example per tier, replace remaining with one-line descriptions
  - [x] 3.3 Merge §8 behavior hints tables (§8.1, §8.2, §8.3) into single compact table with Hint | Scope | Trigger columns
  - [x] 3.4 Compress §3 signal details into compact descriptions
  - [x] 3.5 Run checkpoint: `npx vitest run test/contract.test.ts test/contract.skills.test.ts` and verify `wc -c skills/forge-router/SKILL.md` ≤ 8,500
- [x] 4 Slim CLAUDE.md §2.5 and templates/CLAUDE.md §2.5
  - [x] 4.1 Replace CLAUDE.md §2.5 detailed Restatement Checkpoint content with ≤3-line principle statement plus Reference_Directive to forge-build SKILL.md §3.2
  - [x] 4.2 Compress CLAUDE.md §2.6 output conciseness: tighten Before/After example and retained output list
  - [x] 4.3 Apply identical §2.5 and §2.6 compression to templates/CLAUDE.md
  - [x] 4.4 Run checkpoint: `npx vitest run test/contract.test.ts test/contract.skills.test.ts` and verify `wc -c CLAUDE.md` ≤ 9,500 and `wc -c templates/CLAUDE.md` ≤ 9,500
- [x] 5 Compress forge-refactor SKILL.md (8.5K → ≤6.5K)
  - [x] 5.1 Compress §2 pre-check rejection output template: retain format structure, remove full code block, replace with one-line format reference
  - [x] 5.2 Compress §3.1 Scan output format: retain table header and one example row, remove full multi-layer example
  - [x] 5.3 Simplify §6 execution flow from prose to ≤6-line numbered step list
  - [x] 5.4 Tighten §4 method library descriptions
  - [x] 5.5 Run checkpoint: `npx vitest run test/contract.test.ts test/contract.skills.test.ts` and verify `wc -c skills/forge-refactor/SKILL.md` ≤ 6,500
- [x] 6 Compress forge-test SKILL.md (7.9K → ≤6.5K)
  - [x] 6.1 Replace §3 verification rules (§3.1-§3.6) with Reference_Directive to CLAUDE.md §2.3, retain only forge-test-specific verification gate function (§3.1) and false claims table (§3.2)
  - [x] 6.2 Compress §7 examples: retain one passing example, replace failing example with one-line diff description
  - [x] 6.3 Compress §2 Layer 3 checklist output: remove full code block, retain only 7-item table
  - [x] 6.4 Run checkpoint: `npx vitest run test/contract.test.ts test/contract.skills.test.ts` and verify `wc -c skills/forge-test/SKILL.md` ≤ 6,500
- [x] 7 Compress forge-debug SKILL.md (6.7K → ≤5.5K)
  - [x] 7.1 Simplify §4 execution flow from verbose prose to ≤6-line numbered step list
  - [x] 7.2 Compress §6 four-phase example: retain Phase 1 and Phase 4 outputs, replace Phase 2-3 with two-line summaries
  - [x] 7.3 Compress §3 red flag signal table: merge "suggested action" column into signal description
  - [x] 7.4 Run checkpoint: `npx vitest run test/contract.test.ts test/contract.skills.test.ts` and verify `wc -c skills/forge-debug/SKILL.md` ≤ 5,500
- [x] 8 Compress forge-fix SKILL.md (6.3K → ≤5.5K)
  - [x] 8.1 Compress §2.1 analysis report template: remove full code block, retain section heading list with one-line descriptions
  - [x] 8.2 Compress §4 fix-note.md template: remove full code block, retain field list
  - [x] 8.3 Simplify §6 execution flow from verbose prose to ≤5-line numbered step list
  - [x] 8.4 Run checkpoint: `npx vitest run test/contract.test.ts test/contract.skills.test.ts` and verify `wc -c skills/forge-fix/SKILL.md` ≤ 5,500
- [x] 9 Final validation
  - [x] 9.1 Verify total SKILL character count ≤ 145,000: `total=0; for f in skills/*/SKILL.md; do size=$(wc -c < "$f"); total=$((total + size)); done; echo "$total"`
  - [x] 9.2 Verify CLAUDE.md ≤ 9,500 and templates/CLAUDE.md ≤ 9,500
  - [x] 9.3 Run full CI: `npm run check`
  - [x] 9.4 Verify all YAML frontmatter preserved (name, description, disable-model-invocation fields unchanged)
