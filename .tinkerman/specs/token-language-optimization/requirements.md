---
status: completed
feature: token-language-optimization
layout: requirements
created: 2026-04-30
tier: standard
implementation_note: "R4 Build_Light_SKILL path migrated by forge-single-entry-skills-collapse from skills/forge-build-light/SKILL.md to skills/forge/lib/build-light/instructions.md. Verified 2026-06-13: 2809 chars (≤4000), frontmatter present, AC2 sections (overview/light-path/TDD-ref/discipline-ref/status-ref) present, AC4 forbidden sections appear only as 'skips ...' mentions not as section headings."
---
# Requirements Document

## Introduction

The Forge project's SKILL documents, CLAUDE.md, agent definitions, and templates are written primarily in Chinese. Analysis of Claude's BPE tokenizer shows Chinese characters consume approximately 1.5–2x more tokens than equivalent English text. The project already has i18n support (`src/i18n.ts`, `src/locale-detector.ts`, `src/skill-resolver.ts`) with locale-aware SKILL file resolution (SKILL.zh.md / SKILL.md fallback).

This spec covers two independent optimization strategies:

- **P2 — Mixed Language Strategy (~15–20% token savings):** Convert structural/data content (table headers, enumerations, section headings, output format templates) to English across all 16 SKILL files, CLAUDE.md, templates/CLAUDE.md, and 10 agents/*.md files, while keeping core behavioral instructions, user-visible messages, and contextual explanations in Chinese.

- **P3 — Conditional SKILL Loading (~15K savings for light path):** Split the forge-build SKILL.md (27K, the largest single file) into a lightweight variant for light-tier tasks, and modify the skill scheduler and prompt builder to load the lightweight variant when the tier is "light".

Both strategies are independently implementable. P2 is documentation-only (no code changes). P3 requires TypeScript code changes to `src/skill-scheduler.ts` and `src/context-accumulator.ts`.

## Glossary

- **Mixed_Language_Strategy**: The approach of converting structural content (tables, headings, enumerations, format templates) to English while retaining behavioral instructions and user-visible messages in Chinese, to reduce BPE token consumption.
- **Structural_Content**: Table headers, table cell data, enumeration list items, section headings, markdown formatting keywords, and output format template structural parts. These are not user-visible messages and do not require Chinese semantics for correct interpretation.
- **Behavioral_Content**: Core behavioral instructions, principles, user-visible output messages (e.g., error messages with emoji prefixes), contextual explanations requiring precise Chinese semantics, and YAML frontmatter `description` fields used by contract tests.
- **SKILL_File**: A `SKILL.md` document inside `skills/<forge-command>/` that defines the behavioral rules, flow, and output format for a specific Forge command.
- **Agent_Definition**: A markdown file inside `agents/` that defines the role, responsibilities, and behavioral rules for a specific Forge agent (e.g., `agents/architect.md`, `agents/critic.md`).
- **Skill_Scheduler**: The module at `src/skill-scheduler.ts` that determines the next SKILL phase based on current state and provides command sequences per tier.
- **Context_Accumulator**: The module at `src/context-accumulator.ts` that builds skill-aware prompts by mapping SKILL phases to SKILL file content.
- **Skill_Resolver**: The module at `src/skill-resolver.ts` that resolves locale-aware SKILL file paths with fallback (SKILL.zh.md → SKILL.md).
- **SkillPhase**: The TypeScript union type in `src/skill-scheduler.ts` that enumerates all valid SKILL phase identifiers (e.g., "router", "plan", "build", "review").
- **Build_Light_SKILL**: A new lightweight SKILL file at `skills/forge-build-light/SKILL.md` containing only the sections needed for light-tier task execution (~3K characters).
- **Contract_Tests**: The test suite at `test/contract.test.ts` and `test/contract.skills.test.ts` that validates structural invariants of SKILL files, CLAUDE.md templates, and project assets.
- **BPE_Tokenizer**: Byte Pair Encoding tokenizer used by Claude to convert text into tokens. Chinese characters typically require more tokens per semantic unit than equivalent English text.

## Requirements

### Requirement 1: Convert Structural Content to English in SKILL Files

**User Story:** As a Forge maintainer, I want structural content in all 16 SKILL files converted to English while keeping behavioral instructions in Chinese, so that BPE token consumption is reduced by ~15–20% without changing agent behavior.

#### Acceptance Criteria

1. WHEN the Mixed_Language_Strategy is applied to a SKILL_File, THE Mixed_Language_Strategy SHALL convert all table headers from Chinese to English (e.g., `检查条目` → `Check Item`, `验证方法` → `Method`, `阻断条件` → `Block Condition`).
2. WHEN the Mixed_Language_Strategy is applied to a SKILL_File, THE Mixed_Language_Strategy SHALL convert all table cell content that is structural data from Chinese to English (e.g., `扫描 .tinkerman/specs/ 下所有 spec.md 的 YAML status` → `Scan all spec.md YAML status under .tinkerman/specs/`).
3. WHEN the Mixed_Language_Strategy is applied to a SKILL_File, THE Mixed_Language_Strategy SHALL convert all section headings from Chinese to English (e.g., `## 3. 三条执行路径` → `## 3. Three Execution Paths`).
4. WHEN the Mixed_Language_Strategy is applied to a SKILL_File, THE Mixed_Language_Strategy SHALL convert enumeration list items that describe structural rules or forbidden behaviors from Chinese to English (e.g., `优化代理信号而放弃冻结目标` → `Optimizing proxy signals over frozen goals`).
5. WHEN the Mixed_Language_Strategy is applied to a SKILL_File, THE Mixed_Language_Strategy SHALL convert output format template structural parts to English while preserving user-visible messages in Chinese (e.g., `🚫 Build 前置检查未通过` remains in Chinese).
6. WHEN the Mixed_Language_Strategy is applied to a SKILL_File, THE Mixed_Language_Strategy SHALL preserve all YAML frontmatter `description` fields in Chinese, as these are validated by Contract_Tests.
7. WHEN the Mixed_Language_Strategy is applied to a SKILL_File, THE Mixed_Language_Strategy SHALL preserve core behavioral instructions and principles in Chinese (e.g., `测试先于代码，验证先于声明` remains unchanged).
8. FOR ALL 16 SKILL_Files processed by the Mixed_Language_Strategy, THE Contract_Tests SHALL pass with zero failures.

### Requirement 2: Convert Structural Content to English in CLAUDE.md and Template

**User Story:** As a Forge maintainer, I want structural content in CLAUDE.md and templates/CLAUDE.md converted to English, so that every session loads fewer tokens for the project constitution document.

#### Acceptance Criteria

1. WHEN the Mixed_Language_Strategy is applied to CLAUDE.md, THE Mixed_Language_Strategy SHALL convert all table headers and table cell structural data from Chinese to English.
2. WHEN the Mixed_Language_Strategy is applied to CLAUDE.md, THE Mixed_Language_Strategy SHALL convert all section headings from Chinese to English.
3. WHEN the Mixed_Language_Strategy is applied to CLAUDE.md, THE Mixed_Language_Strategy SHALL preserve the `项目信息` section field values that are validated by Contract_Tests (project name, tech stack, security level, init date).
4. WHEN the Mixed_Language_Strategy is applied to templates/CLAUDE.md, THE Mixed_Language_Strategy SHALL apply the same conversions as applied to CLAUDE.md, preserving all template placeholders (e.g., `{{project_name}}`, `{{tech_stack}}`).
5. WHEN the compressed CLAUDE.md and templates/CLAUDE.md are validated, THE Contract_Tests SHALL pass with zero failures, including §5 Self-Evolution section assertions and all template placeholder assertions.

### Requirement 3: Convert Structural Content to English in Agent Definitions

**User Story:** As a Forge maintainer, I want structural content in all 10 agent definition files converted to English, so that agent context loading consumes fewer tokens.

#### Acceptance Criteria

1. WHEN the Mixed_Language_Strategy is applied to an Agent_Definition, THE Mixed_Language_Strategy SHALL convert all table headers, section headings, and enumeration structural items from Chinese to English.
2. WHEN the Mixed_Language_Strategy is applied to an Agent_Definition, THE Mixed_Language_Strategy SHALL preserve behavioral instructions and role-specific principles in Chinese.
3. FOR ALL 10 Agent_Definition files in `agents/`, THE Mixed_Language_Strategy SHALL produce valid markdown with no broken formatting.
4. WHEN the full CI check is run (`npm run check`), THE CI suite SHALL pass with zero failures.

### Requirement 4: Create forge-build-light SKILL File

**User Story:** As a Forge maintainer, I want a lightweight variant of forge-build SKILL.md that contains only the sections needed for light-tier tasks, so that light-path context is reduced from ~27K to ~3K characters.

#### Acceptance Criteria

1. THE Build_Light_SKILL SHALL be created at `skills/forge-build-light/SKILL.md` with valid YAML frontmatter containing `name: forge-build-light` and a `description` field.
2. THE Build_Light_SKILL SHALL contain §1 overview (adapted for light path), §3.1 light path execution rules, §4 TDD rules (as a reference directive to CLAUDE.md §2.1), §6 execution discipline (as a reference directive to forge-build §6), and §7 status updates (as a reference directive to forge-build §7).
3. THE Build_Light_SKILL SHALL have a character count of ≤4,000.
4. THE Build_Light_SKILL SHALL NOT contain §2 pre-checks (light path skips Spec and Plan gates), §3.2 standard path, §3.3 full path, §3.4 Closure-First probes (light path skips probes), or §3.5 Final Validation details.
5. WHEN the Build_Light_SKILL is validated, THE Contract_Tests SHALL pass with zero failures for the new skill file.

### Requirement 5: Add "build-light" Phase to Skill Scheduler

**User Story:** As a Forge maintainer, I want the Skill_Scheduler to support a "build-light" phase that is used in the light-tier command sequence, so that light tasks load the lightweight build SKILL instead of the full 27K file.

#### Acceptance Criteria

1. THE Skill_Scheduler SHALL include `"build-light"` in the SkillPhase union type.
2. WHEN the tier is `"light"`, THE Skill_Scheduler SHALL return the command sequence `["build-light", "review"]` instead of `["build", "review"]`.
3. WHEN the `determineNextSkill` function receives `currentPhase` of `"build-light"`, THE Skill_Scheduler SHALL apply the same state transition logic as `"build"` (incomplete tasks → stay in build-light, all tasks complete → review).
4. WHEN the `shouldCommitForPhase` function receives phase `"build-light"` with `success: true`, THE Skill_Scheduler SHALL return `true` (build-light produces code changes that should be committed).
5. WHEN the `getCommandSequence` function is called with tier `"light"`, THE Skill_Scheduler SHALL return `["build-light", "review"]`.
6. FOR ALL existing tiers other than `"light"`, THE Skill_Scheduler SHALL return unchanged command sequences.

### Requirement 6: Map "build-light" Phase to forge-build-light SKILL in Context Accumulator

**User Story:** As a Forge maintainer, I want the Context_Accumulator to map the "build-light" phase to the forge-build-light SKILL file, so that light-tier tasks load the lightweight SKILL content instead of the full forge-build SKILL.

#### Acceptance Criteria

1. WHEN the Context_Accumulator builds a skill-aware prompt with phase `"build-light"`, THE Context_Accumulator SHALL reference `forge-build-light` in the execution directive (e.g., `Execute the **forge-build-light** SKILL for this iteration.`).
2. WHEN the Skill_Resolver resolves the SKILL file for `forge-build-light`, THE Skill_Resolver SHALL return the path `skills/forge-build-light/SKILL.md`.
3. WHEN the phase is `"build"` (not `"build-light"`), THE Context_Accumulator SHALL continue to reference `forge-build` as before, with no behavioral change.

### Requirement 7: Token Savings Measurement and Validation

**User Story:** As a Forge maintainer, I want measurable evidence that the optimizations achieve their target savings, so that the investment in mixed-language conversion and conditional loading is justified.

#### Acceptance Criteria

1. WHEN P2 (Mixed_Language_Strategy) is complete, THE total BPE token count across all modified files SHALL be reduced by at least 10% compared to the pre-optimization baseline (measured using `npx tiktoken` or equivalent tokenizer tool).
2. WHEN P3 (conditional loading) is complete, THE light-tier context size SHALL be reduced from ~27K characters (full forge-build) to ≤4,000 characters (forge-build-light).
3. WHEN all optimizations are complete, THE full CI check (`npm run check`) SHALL pass with zero failures.
4. WHEN all optimizations are complete, THE Contract_Tests (`npx vitest run test/contract.test.ts test/contract.skills.test.ts`) SHALL pass with zero failures.

### Requirement 8: Rollback Safety via i18n Fallback

**User Story:** As a Forge maintainer, I want the original Chinese SKILL files preserved as locale-specific fallbacks, so that mixed-language issues can be rolled back without reverting git commits.

#### Acceptance Criteria

1. IF the Mixed_Language_Strategy causes AI output language confusion or behavioral degradation, THEN THE Skill_Resolver SHALL support restoring Chinese-only behavior by placing the original Chinese SKILL files at `skills/<forge-command>/SKILL.zh.md` and setting the locale to `"zh"`.
2. THE existing Skill_Resolver locale fallback mechanism (SKILL.zh.md → SKILL.md) SHALL remain functional and unmodified after all changes.
3. THE existing locale detection priority chain in `src/locale-detector.ts` (CLI → config → env → system → default) SHALL remain functional and unmodified after all changes.

### Requirement 9: Behavioral Semantics Preservation for Mixed Language

**User Story:** As a Forge maintainer, I want all behavioral semantics preserved after mixed-language conversion, so that agent behavior is identical before and after the optimization.

#### Acceptance Criteria

1. FOR ALL files processed by the Mixed_Language_Strategy, THE Mixed_Language_Strategy SHALL preserve all rules, thresholds, decision logic, state transitions, and output format specifications — changing only the language of structural elements, not the substance.
2. FOR ALL SKILL_Files processed by the Mixed_Language_Strategy, THE Mixed_Language_Strategy SHALL preserve all section headings that match the pattern `## <number>.` to maintain Contract_Test assertions for numbered section headings.
3. FOR ALL SKILL_Files processed by the Mixed_Language_Strategy, THE Mixed_Language_Strategy SHALL preserve the YAML_Frontmatter block (name, description, disable-model-invocation fields) byte-for-byte identical to the original.
4. IF a Chinese behavioral instruction is converted to English by mistake, THEN THE Contract_Tests or manual review SHALL detect the semantic drift and the instruction SHALL be restored to Chinese.

### Requirement 10: Independence of P2 and P3 Implementations

**User Story:** As a Forge maintainer, I want P2 (mixed language) and P3 (conditional loading) to be independently implementable and deployable, so that either can be rolled back without affecting the other.

#### Acceptance Criteria

1. THE P2 implementation (mixed language conversion) SHALL consist exclusively of markdown file edits with no TypeScript code changes.
2. THE P3 implementation (conditional loading) SHALL consist of TypeScript code changes to `src/skill-scheduler.ts` and `src/context-accumulator.ts`, plus the creation of `skills/forge-build-light/SKILL.md`, with no dependency on P2 mixed-language conversions.
3. WHEN P2 is deployed without P3, THE system SHALL function correctly with the original `"build"` phase and full forge-build SKILL.
4. WHEN P3 is deployed without P2, THE system SHALL function correctly with Chinese-only SKILL files and the new `"build-light"` phase.
