---
feature: output-bloat-control
layout: tasks
created: 2026-04-30
spec_ref: ".forge/specs/output-bloat-control/requirements.md"
---

# Implementation Plan: Output Bloat Control

## Overview

This plan implements four output-side token optimizations for Forge (Layer 2), ordered by ROI. All changes are documentation/configuration modifications — markdown frontmatter edits, markdown content updates, and new documentation files. No new scripts or external dependencies are introduced.

Key implementation notes:
- Agent files exist in TWO directories (`agents/` and `.claude/agents/`) — changes must be synced
- `.claude/agents/` is currently missing `explore.md`, `debugger.md`, and `critic.md` — these must be copied/created during sync
- Validation is structural: grep frontmatter fields, compare directories, verify markdown sections

## Tasks

- [x] 1. Implement Agent-level model routing
  - [x] 1.1 Add `model: haiku` to `agents/explore.md` frontmatter
    - Add `model: haiku` field to the existing YAML frontmatter block
    - Preserve all existing fields (`name`, `description`, `disallowedTools`)
    - _Requirements: 1.1, 1.7, 1.10_

  - [x] 1.2 Update `agents/spec-check.md` frontmatter from `model: inherit` to `model: sonnet`
    - Change the existing `model: inherit` to `model: sonnet`
    - Preserve all other fields unchanged
    - _Requirements: 1.2, 1.7_

  - [x] 1.3 Update `agents/quality-check.md` frontmatter from `model: inherit` to `model: sonnet`
    - Change the existing `model: inherit` to `model: sonnet`
    - Preserve all other fields unchanged
    - _Requirements: 1.2, 1.7_

  - [x] 1.4 Update `agents/security-check.md` frontmatter from `model: inherit` to `model: sonnet`
    - Change the existing `model: inherit` to `model: sonnet`
    - Preserve all other fields unchanged
    - _Requirements: 1.2, 1.7_

  - [x] 1.5 Add `model: inherit` to `agents/debugger.md` frontmatter
    - Add explicit `model: inherit` field to the existing YAML frontmatter block
    - Currently `debugger.md` has no `model` field — make it explicit
    - _Requirements: 1.6, 1.7_

  - [x] 1.6 Verify `agents/critic.md` already has `model: inherit` — no change needed
    - Confirm `critic.md` frontmatter already contains `model: inherit`
    - Confirm decide agents (`architect.md`, `product.md`, `security.md`, `designer.md`) retain `model: inherit`
    - _Requirements: 1.3, 1.4, 1.5_

  - [x] 1.7 Sync all agent files to `.claude/agents/` directory
    - Copy `agents/explore.md` → `.claude/agents/explore.md` (file currently missing in `.claude/agents/`)
    - Copy `agents/debugger.md` → `.claude/agents/debugger.md` (file currently missing in `.claude/agents/`)
    - Copy `agents/critic.md` → `.claude/agents/critic.md` (file currently missing in `.claude/agents/`)
    - Update `.claude/agents/spec-check.md` frontmatter: `model: inherit` → `model: sonnet`
    - Update `.claude/agents/quality-check.md` frontmatter: `model: inherit` → `model: sonnet`
    - Update `.claude/agents/security-check.md` frontmatter: `model: inherit` → `model: sonnet`
    - Ensure all 10 agent files exist in both directories with identical frontmatter
    - _Requirements: 1.9_

  - [x] 1.8 Validate agent model routing
    - Grep all `model:` fields across `agents/` and `.claude/agents/` to confirm correct values
    - Verify `explore` → `haiku`, `spec-check`/`quality-check`/`security-check` → `sonnet`, all others → `inherit`
    - Diff `agents/` vs `.claude/agents/` to confirm frontmatter consistency across both directories
    - Confirm no concrete model names (e.g., `glm-5.1`, `claude-sonnet-4-20250514`) appear in any frontmatter
    - _Requirements: 1.7, 1.8, 1.9, 1.10_

- [x] 2. Checkpoint — Validate Requirement 1 complete
  - Ensure all agent frontmatter changes are correct and synced, ask the user if questions arise.

- [x] 3. Implement prose compression rules in CLAUDE.md §2.6
  - [x] 3.1 Append prose compression rules subsection to `CLAUDE.md` §2.6
    - Add vocabulary compression rules after existing §2.6 content: omit articles (a/an/the), filler words (just/really/basically/actually/simply), pleasantries (sure/certainly/of course/happy to); use short synonyms; allow sentence fragments; pattern: `[thing] [action] [reason]. [next step].`
    - Add behavior rules: file edit → output change summary (e.g., `+5 lines in src/config.ts`), not echo file content; non-Decision_Point → give recommendation and execute, don't list alternatives; non-Decision_Point prose ≤200 tokens; Decision_Point format: `[reason] → [choice] → [basis]`
    - Expand Structured_Output exemption list to include: TDD markers, P5 evidence chains, Restatement summaries, Closure_First_Probe results, review reports, code blocks, commit messages, security warnings, irreversible operation confirmations, routing analysis, pre-build check results
    - Add safety valve: prose compression yields to information completeness (error diagnostics, security warnings retain full detail)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.9_

  - [x] 3.2 Sync prose compression rules to `templates/CLAUDE.md` §2.6
    - Apply identical prose compression rules subsection to `templates/CLAUDE.md` §2.6
    - Ensure template variables (e.g., `{{project_name}}`) are preserved in the template file
    - Verify §2.6 content is equivalent between `CLAUDE.md` and `templates/CLAUDE.md` (accounting for template variables)
    - _Requirements: 2.8_

  - [x] 3.3 Validate prose compression rules
    - Confirm `CLAUDE.md` §2.6 contains all four subsections (vocabulary, behavior, exemption list, safety valve)
    - Diff `CLAUDE.md` §2.6 against `templates/CLAUDE.md` §2.6 to confirm content parity
    - Confirm Structured_Output exemption list is complete (all 11 items from design)
    - _Requirements: 2.1, 2.7, 2.8_

- [x] 4. Checkpoint — Validate Requirements 1-2 complete
  - Ensure all agent routing and prose compression changes are correct, ask the user if questions arise.

- [x] 5. Implement Restatement summary compression in forge-build SKILL
  - [x] 5.1 Replace Restatement Summary Format in `skills/forge-build/SKILL.md` §3.2
    - Replace the 5-block format definition with the new 3-block format:
      - Block 1: Progress (completed task list + next task)
      - Block 2: Next step (full title and file path)
      - Block 3: Active hints (from status.md hints + 1 most relevant instinct pattern match with confidence)
    - Remove the "执行纪律重申" (execution discipline restatement) block entirely
    - Merge "匹配的直觉模式" (instinct pattern matches) block into the "活跃提示" (active hints) block, keeping only 1 most relevant match
    - _Requirements: 3.2, 3.3, 3.4, 3.5_

  - [x] 5.2 Update Token Cost Constraint in `skills/forge-build/SKILL.md`
    - Change `≤1,500 tokens` to `≤800 tokens` in the Token Cost Constraint section
    - Update the calculation example: `10 tasks (N=3) total overhead ≤ 10%` — adjust if needed for new budget
    - Confirm exception-triggered Restatement block remains exempt from 800t budget
    - _Requirements: 3.1, 3.6, 3.7_

  - [x] 5.3 Validate Restatement compression
    - Confirm `skills/forge-build/SKILL.md` §3.2 shows 3-block format (not 5-block)
    - Confirm Token Cost Constraint reads `≤800 tokens`
    - Confirm exception block rules are preserved (追加在 3 块后, not subject to 800t limit)
    - Grep for any remaining references to `1,500 tokens` or `1500 tokens` in the SKILL file
    - _Requirements: 3.1, 3.2, 3.5, 3.6, 3.7_

- [x] 6. Checkpoint — Validate Requirements 1-3 complete
  - Ensure all agent routing, prose compression, and Restatement compression changes are correct, ask the user if questions arise.

- [x] 7. Create opusplan mode documentation
  - [x] 7.1 Create `docs/opusplan-guide.md`
    - Document how opusplan works: plan mode uses opus (complex reasoning), execution mode uses sonnet (code generation)
    - Document activation methods: `/model opusplan` in session, or `claude --model opusplan` at startup
    - Document expected cost savings: 20-40%, depending on reasoning/execution ratio
    - Document complementary relationship with Agent-level model routing (Requirement 1): opusplan controls main Agent layering, Agent routing controls Subagent model selection
    - Include note that opusplan is a voluntary user choice — Forge does not force-enable it
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 7.2 Add opusplan reference link to `README.md`
    - Add a brief mention and link to `docs/opusplan-guide.md` in an appropriate section of README.md (e.g., Token Efficiency section)
    - Do not add opusplan to any configuration file or auto-enable mechanism
    - _Requirements: 4.1, 4.5_

  - [x] 7.3 Validate opusplan documentation
    - Confirm `docs/opusplan-guide.md` contains all required sections: how it works, activation, cost savings, complementary relationship, voluntary note
    - Confirm no Forge config file or script references opusplan as a forced/default setting
    - Confirm README.md contains a link to the opusplan guide
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.7_

- [x] 8. Final checkpoint — Validate all requirements complete
  - Run `npm run check` to confirm no build/lint regressions from documentation changes
  - Verify all 4 requirements are covered: agent model routing, prose compression, Restatement compression, opusplan documentation
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All changes are documentation/configuration modifications — no new executable code
- Property-based testing does not apply (no functions, no input/output transformations)
- Tasks are ordered by ROI priority: Requirement 1 (model routing, highest savings) → Requirement 4 (opusplan docs, lowest effort)
- Agent files must be synced across `agents/` and `.claude/agents/` — `.claude/agents/` is currently missing 3 files (explore, debugger, critic)
- Validation tasks use grep and diff to structurally verify changes
- The `npm run check` in the final checkpoint catches any accidental regressions
