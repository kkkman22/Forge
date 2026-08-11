---
feature: token-language-optimization
layout: tasks
created: 2026-04-30
spec_ref: ".tinkerman/specs/token-language-optimization/requirements.md"
---

# Tasks

## P3: Conditional SKILL Loading (Code Changes)

- [x] 1 Add "build-light" phase to skill scheduler
  - [x] 1.1 Add `"build-light"` to the `SkillPhase` union type in `src/skill-scheduler.ts`
  - [x] 1.2 Update `SKILL_COMMAND_SEQUENCES.light` from `["build", "review"]` to `["build-light", "review"]` in `src/skill-scheduler.ts`
  - [x] 1.3 Add `"build-light"` to the `COMMITABLE_PHASES` set in `src/skill-scheduler.ts`
  - [x] 1.4 Add `"build-light"` case in `determineNextSkill()` with same transition logic as `"build"` (incomplete tasks → stay in build-light, all complete → review)
  - [x] 1.5 Run type check: `npx tsc --noEmit`

- [x] 2 Update existing unit tests for skill scheduler
  - [x] 2.1 Update the existing `getCommandSequence` test for light tier in `test/skill-scheduler.test.ts` to expect `["build-light", "review"]` instead of `["build", "review"]`
  - [x] 2.2 Add unit tests for `determineNextSkill` with `currentPhase="build-light"`: incomplete tasks → stays in build-light, all complete → transitions to review
  - [x] 2.3 Add unit test for `shouldCommitForPhase("build-light", true)` → true and `shouldCommitForPhase("build-light", false)` → false
  - [x] 2.4 Run unit tests: `npx vitest run test/skill-scheduler.test.ts`

- [x] 3 Write property-based tests for P3
  - [x] 3.1 Create `test/skill-scheduler-p3.property.test.ts` with `fast-check` dependency
  - [x] 3.2 Property 1: For tier "light", `getCommandSequence` returns `["build-light", "review"]`; for all other known tiers, sequences are unchanged; for unknown tiers, defaults to standard sequence
  - [x] 3.3 Property 2: For any `SchedulerInput` with `currentPhase="build-light"`, `determineNextSkill` returns build-light when `hasIncompleteTasks=true` and review when `hasIncompleteTasks=false`
  - [x] 3.4 Property 3: `shouldCommitForPhase("build-light", success)` returns `success` for any boolean `success`
  - [x] 3.5 Property 4: For any non-empty phase string, `buildSkillAwarePrompt` output contains `forge-${phase}`
  - [x] 3.6 Run property tests: `npx vitest run test/skill-scheduler-p3.property.test.ts`

- [x] 4 Create forge-build-light SKILL file
  - [x] 4.1 Create `skills/forge-build-light/SKILL.md` with YAML frontmatter (`name: forge-build-light`, `description` in Chinese, `disable-model-invocation: true`)
  - [x] 4.2 Write §1 Overview adapted for light path (~200 chars)
  - [x] 4.3 Write §2 Light Path Execution rules (direct task execution, no pre-checks) adapted from forge-build §3.1
  - [x] 4.4 Write §3 TDD Rules as reference directive to CLAUDE.md §2.1
  - [x] 4.5 Write §4 Execution Discipline as reference directive to forge-build §6
  - [x] 4.6 Write §5 Status Updates as reference directive to forge-build §7
  - [x] 4.7 Verify character count ≤ 4,000: `wc -c skills/forge-build-light/SKILL.md`
  - [x] 4.8 Run contract tests: `npx vitest run test/contract.test.ts test/contract.skills.test.ts`

- [x] 5 P3 final validation
  - [x] 5.1 Run full test suite: `npm run check`
  - [x] 5.2 Verify `wc -c skills/forge-build-light/SKILL.md` ≤ 4,000

## P2: Mixed Language Conversion (Documentation Only)

- [x] 6 Convert SKILL files batch 1 (largest files first)
  - [x] 6.1 Convert `skills/forge-build/SKILL.md`: table headers, section headings, enumeration structural items, output format template structure → English; preserve YAML frontmatter, behavioral instructions, user-visible messages in Chinese
  - [x] 6.2 Convert `skills/forge-learn/SKILL.md`: same conversion rules
  - [x] 6.3 Convert `skills/forge-plan/SKILL.md`: same conversion rules
  - [x] 6.4 Convert `skills/forge-review/SKILL.md`: same conversion rules
  - [x] 6.5 Run checkpoint: `npx vitest run test/contract.test.ts test/contract.skills.test.ts`

- [x] 7 Convert SKILL files batch 2
  - [x] 7.1 Convert `skills/forge-spec/SKILL.md`: same conversion rules
  - [x] 7.2 Convert `skills/forge-loop/SKILL.md`: same conversion rules
  - [x] 7.3 Convert `skills/forge-router/SKILL.md`: same conversion rules
  - [x] 7.4 Convert `skills/forge-refactor/SKILL.md`: same conversion rules
  - [x] 7.5 Run checkpoint: `npx vitest run test/contract.test.ts test/contract.skills.test.ts`

- [x] 8 Convert SKILL files batch 3
  - [x] 8.1 Convert `skills/forge-test/SKILL.md`: same conversion rules
  - [x] 8.2 Convert `skills/forge-debug/SKILL.md`: same conversion rules
  - [x] 8.3 Convert `skills/forge-fix/SKILL.md`: same conversion rules
  - [x] 8.4 Convert `skills/forge-decide/SKILL.md`: same conversion rules
  - [x] 8.5 Run checkpoint: `npx vitest run test/contract.test.ts test/contract.skills.test.ts`

- [x] 9 Convert SKILL files batch 4
  - [x] 9.1 Convert `skills/forge-ship/SKILL.md`: same conversion rules
  - [x] 9.2 Convert `skills/forge-status/SKILL.md`: same conversion rules
  - [x] 9.3 Convert `skills/forge-resume/SKILL.md`: same conversion rules
  - [x] 9.4 Convert `skills/forge-abort/SKILL.md`: same conversion rules
  - [x] 9.5 Run checkpoint: `npx vitest run test/contract.test.ts test/contract.skills.test.ts`

- [x] 10 Convert CLAUDE.md and templates/CLAUDE.md
  - [x] 10.1 Convert `CLAUDE.md`: table headers, section headings, enumeration structural items → English; preserve YAML frontmatter values (项目信息 section), behavioral instructions, Self-Evolution §5 content validated by contract tests
  - [x] 10.2 Convert `templates/CLAUDE.md`: same conversions as CLAUDE.md; preserve all template placeholders (`{{project_name}}`, `{{tech_stack}}`, `{{security_level}}`, `{{knowledge_limit}}`, `{{init_date}}`)
  - [x] 10.3 Run checkpoint: `npx vitest run test/contract.test.ts test/contract.skills.test.ts`

- [x] 11 Convert agent definition files
  - [x] 11.1 Convert `agents/architect.md`: table headers, section headings, enumeration structural items → English; preserve behavioral instructions and role-specific principles in Chinese
  - [x] 11.2 Convert `agents/critic.md`: same conversion rules
  - [x] 11.3 Convert `agents/debugger.md`: same conversion rules
  - [x] 11.4 Convert `agents/designer.md`: same conversion rules
  - [x] 11.5 Convert `agents/explore.md`: same conversion rules
  - [x] 11.6 Convert `agents/product.md`: same conversion rules
  - [x] 11.7 Convert `agents/quality-check.md`: same conversion rules
  - [x] 11.8 Convert `agents/security-check.md`: same conversion rules
  - [x] 11.9 Convert `agents/security.md`: same conversion rules
  - [x] 11.10 Convert `agents/spec-check.md`: same conversion rules
  - [x] 11.11 Run checkpoint: `npx vitest run test/contract.test.ts test/contract.skills.test.ts`

- [x] 12 P2 final validation
  - [x] 12.1 Run full CI: `npm run check`
  - [x] 12.2 Measure BPE token savings across all modified files and verify ≥10% reduction
