---
feature: claude-md-self-evolution
layout: tasks
created: 2026-04-28
spec_ref: ".tinkerman/specs/claude-md-self-evolution/requirements.md"
---

# Implementation Plan: CLAUDE.md Self-Evolution

## Overview

This plan implements a dual-file self-evolution mechanism for Forge's CLAUDE.md system. The feature adds evolved-rules.md (max 15 error-prevention rules distilled from knowledge) and a rule-changelog.md, wires them into the session lifecycle via hooks, adds a rule distillation stage to `/forge learn`, and protects the new files via the Guarded zone. All changes are to markdown templates, SKILL.md, hooks.json, shell scripts, and tests — no TypeScript source code changes to `src/`.

## Tasks

- [x] 1. Create new template files
  - [x] 1.1 Create `templates/evolved-rules.md` template
    - Create the evolved rules template with YAML frontmatter containing `updated: "{{init_date}}"`, `rule_count: 0`, and `max_rules: {{max_rules}}` fields
    - Include the "Error-Prevention Rules" heading, description text, and a comment block documenting the expected rule format (`### R{N}: {title}` with Content, Prevents, Source, Added, Confidence, Last_triggered fields)
    - The template should have an empty rules section (no actual rules, just the format documentation comment)
    - _Requirements: 1.1, 1.3, 1.4_

  - [x] 1.2 Create `templates/rule-changelog.md` template
    - Create the rule changelog template with YAML frontmatter containing `updated: "{{init_date}}"` field
    - Include the "Rule Changelog" heading, description text, and a comment block documenting the expected entry format (`### YYYY-MM-DD — {action}: R{N} {title}` with Action, Source, Confidence, Reason fields)
    - _Requirements: 8.1, 8.5_

- [x] 2. Modify CLAUDE.md template — add Section 5
  - [x] 2.1 Add Section 5 "Self-Evolution Protocol" to `templates/CLAUDE.md`
    - Insert Section 5 after the existing Section 4 (Knowledge Discipline, ending at "知识不是写完就放着") and before the "项目信息" section
    - Section 5.1: Instruct Claude to read `.tinkerman/knowledge/evolved-rules.md` at session start and treat rules as project-specific error-prevention directives
    - Section 5.2: Enumerate five updatable knowledge categories with their sources and thresholds in a table (known-failures occurrence >= 3, instincts confidence >= 0.8, skill-feedback frequency >= 3, session journals same issue 3+ sessions, metrics 3+ session degradation)
    - Section 5.3: Define trigger conditions with explicit numeric thresholds
    - Section 5.4: Define the four-step correction protocol (propose, declare, approve, log)
    - Section 5.5: Define constraints — 15-rule cap, staleness policy (5 sessions), Guarded zone protection, Sections 1–4 immutability
    - Section 5.6: Explicitly list exclusions — architecture descriptions, file path lists, general best practices, raw knowledge data, standards enforced by existing tools
    - Use the exact content structure from the design document's "CLAUDE.md Template Section 5" component
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 9.3_

- [x] 3. Modify `templates/config.md` — add Guarded zone entries
  - [x] 3.1 Add evolved-rules.md and rule-changelog.md to the Guarded zone section in `templates/config.md`
    - Add `.tinkerman/knowledge/evolved-rules.md` with annotation: "only updatable by `/forge learn` rule distillation, not deletable outside maintenance"
    - Add `.tinkerman/knowledge/rule-changelog.md` with append-only semantics annotation
    - Place these entries in the existing "🛡️ 受保护区（Guarded）" section alongside the other Guarded entries
    - _Requirements: 9.1, 9.2_

- [x] 4. Modify `hooks/hooks.json` — add SessionStart and Stop hooks
  - [x] 4.1 Add SessionStart hook entry for evolved-rules.md injection
    - Add a new hook entry to the existing SessionStart array that conditionally outputs evolved-rules.md content
    - Use `if [ -f .tinkerman/knowledge/evolved-rules.md ]; then echo '=== Evolved Rules ==='; cat .tinkerman/knowledge/evolved-rules.md; fi` as the command
    - Include a positive integer timeout (5 seconds)
    - Ensure the command uses a conditional `if [ -f` check so projects without evolved-rules.md produce no errors
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 4.2 Add Stop hook entry for pending correction proposals reminder
    - Add a new hook entry to the existing Stop array that checks for pending proposals and counts them
    - Use `if [ -f .tinkerman/knowledge/evolved-rules.md ] && grep -q 'PENDING' .tinkerman/knowledge/evolved-rules.md 2>/dev/null; then count=$(grep -c 'PENDING' .tinkerman/knowledge/evolved-rules.md 2>/dev/null || echo 0); echo "⚠️ 有 $count 条待审核的规则提案。运行 /forge learn 查看并审批。"; fi` as the command
    - The command must indicate the number of pending proposals (use `grep -c` for counting)
    - Ensure the command uses `2>/dev/null` for safe grep failure handling
    - _Requirements: 7.1, 7.2_

- [x] 5. Checkpoint — Verify templates and hooks are valid
  - Ensure all new/modified templates exist and contain expected content. Ensure hooks.json is valid JSON and passes existing semantic validation. Ask the user if questions arise.

- [x] 6. Modify `skills/forge-learn/SKILL.md` — add Rule Distillation stage
  - [x] 6.1 Add "Error-Prevention Rule Distillation" stage to forge-learn SKILL.md
    - Insert the new stage after Section 6.3 (cross-project pattern detection, "跨项目模式检测") and before the session cleanup stage ("会话层清理" in the Section 9 execution flow)
    - Document the complete algorithm: read evolved-rules.md and four data sources, apply thresholds to generate candidates, apply exclusion filter, conflict detection, capacity management, present proposals to user, write approved rules, update changelog
    - Include the transformation process: extract raw pattern, distill into concise rule statement, declare what error the rule prevents
    - Document all five threshold conditions matching the requirements (known-failures >= 3, instincts >= 0.8, skill-feedback >= 3, session journals >= 3, metrics degradation >= 3 sessions)
    - Document the silent pass behavior when no qualifying entries are found
    - Document staleness detection (last_triggered older than 5 sessions) and retirement proposals
    - Document the rule value calculation for retirement ranking (confidence × recency_factor)
    - Reference all four data sources explicitly
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 8.2, 8.3, 8.4, 13.1, 13.2, 13.3, 13.4, 14.1, 14.2, 14.3_

  - [x] 6.2 Update the execution flow diagram in Section 9 of forge-learn SKILL.md
    - Add the "Error-Prevention Rule Distillation" box to the flow diagram between "跨项目模式检测" and "会话层清理"
    - Ensure the flow diagram accurately reflects the new stage's position
    - _Requirements: 3.1_

- [x] 7. Modify `scripts/init.sh` — handle new template placeholders
  - [x] 7.1 Add evolved-rules.md template processing to init.sh
    - Add a block that copies `templates/evolved-rules.md` to `.tinkerman/knowledge/evolved-rules.md` with `{{init_date}}` replaced by the current date and `{{max_rules}}` replaced by `15`
    - Use the existing `init_date` variable and `sed` pattern consistent with other template processing in the script
    - Guard with `if [[ -f "${FORGE_ROOT}/templates/evolved-rules.md" ]]` for graceful handling when template is missing
    - Place the new block in Step 2 alongside the existing metrics.md and tool-health.md template processing
    - _Requirements: 11.1, 11.2, 11.3_

  - [x] 7.2 Add rule-changelog.md template processing to init.sh
    - Add a block that copies `templates/rule-changelog.md` to `.tinkerman/knowledge/rule-changelog.md` with `{{init_date}}` replaced by the current date
    - Use the same guard and sed pattern as evolved-rules.md
    - _Requirements: 11.4_

- [x] 8. Add contract tests for new templates and cross-file consistency
  - [x] 8.1 Add contract tests to `test/contract.test.ts`
    - Add a new test group "Contract: evolved rules templates" that verifies:
      - `templates/evolved-rules.md` exists
      - `templates/rule-changelog.md` exists
      - evolved-rules.md template contains YAML frontmatter with `updated`, `rule_count`, `max_rules` fields
      - rule-changelog.md template contains YAML frontmatter with `updated` field
    - Add a new test group "Contract: CLAUDE.md self-evolution section" that verifies:
      - CLAUDE.md template contains a "Self-Evolution" heading (Section 5)
      - Section references `evolved-rules.md`
      - Section documents the five knowledge categories
      - Section documents the 15-rule cap
      - Section documents exclusions
    - Add a new test group "Contract: hooks.json evolved rules integration" that verifies:
      - SessionStart contains a hook entry referencing `evolved-rules.md`
      - SessionStart evolved-rules hook uses conditional `if [ -f` check
      - SessionStart evolved-rules hook has a positive integer timeout
      - Stop contains a hook entry for pending proposals (referencing `PENDING` or `evolved-rules.md`)
    - Add a new test group "Contract: config.md evolved rules protection" that verifies:
      - config.md template lists `evolved-rules.md` in the Guarded zone section
      - config.md template lists `rule-changelog.md` in the Guarded zone section
    - Add a new test group "Contract: forge-learn SKILL.md rule distillation" that verifies:
      - `skills/forge-learn/SKILL.md` contains a "Rule Distillation" or equivalent heading
      - SKILL.md references all four data sources (known-failures, instincts, skill-feedback, metrics)
      - SKILL.md documents all five threshold conditions
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [x] 8.2 Write property test for evolved-rules.md round-trip
    - Create `test/contract.evolved-rules.property.test.ts`
    - **Property 1: Evolved rules file round-trip**
    - **Validates: Requirements 14.4**
    - Implement a `formatEvolvedRules()` function that takes a set of rules and produces the evolved-rules.md format (frontmatter + rule sections)
    - Implement a `parseEvolvedRules()` function that parses the formatted string back into structured rule data
    - Use fast-check arbitraries to generate random rule sets (title, content, prevents, source, added date, confidence 0.3–0.9, last_triggered date)
    - Assert that formatting then parsing produces an equivalent set of rules with all fields preserved
    - Use `{ numRuns: 200 }` consistent with existing property tests
    - Tag: `Feature: claude-md-self-evolution, Property 1: Evolved rules file round-trip`

- [x] 9. Checkpoint — Run verification suite
  - Run `npm run check` (typecheck + lint + test + README metrics check) and ensure all tests pass. Ask the user if questions arise.

- [x] 10. Update project root CLAUDE.md
  - [x] 10.1 Add Section 5 to the project root `CLAUDE.md`
    - Add a Section 5 "Self-Evolution Protocol" that matches the content structure defined in the CLAUDE.md template
    - Reference `.tinkerman/knowledge/evolved-rules.md` as the location of evolved rules
    - Place after the existing content sections, maintaining consistency with the template
    - _Requirements: 12.1, 12.2_

- [x] 11. Final verification and build
  - [x] 11.1 Run full verification
    - Run `npm run check` to verify typecheck + lint + test all pass
    - Run `bash scripts/build-dist.sh` to verify the dist bundle builds successfully and includes the new templates
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 11.2 Final checkpoint
    - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property test validates the evolved-rules.md format round-trip (the only correctness property in the design)
- Contract tests are the primary testing mechanism since this feature modifies templates and configuration, not TypeScript source code
- The `build-dist.sh` script automatically includes new templates in the dist bundle (copies entire `templates/` directory)
- No TypeScript source code changes to `src/` are needed for this feature
