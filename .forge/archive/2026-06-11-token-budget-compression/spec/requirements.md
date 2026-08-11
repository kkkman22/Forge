---
status: archived
archived_reason: "被 forge-single-entry-skills-collapse 重构为 skills/forge/lib/*/instructions.md 单入口结构，原 skills/forge-*/SKILL.md 路径已不存在（CLAUDE.md 9.4K 已达标）"
archived_replacement: "forge-single-entry-skills-collapse (skills/forge/lib/*/instructions.md)"
feature: token-budget-compression
layout: requirements
created: 2026-04-30
tier: standard
---
# Requirements Document

## Introduction

The Forge project has 16 SKILL documents totaling ~178K characters. A previous optimization (skill-document-optimization spec) successfully compressed the top 4 files (forge-build, forge-learn, forge-plan, forge-review). This spec targets the remaining 7 unoptimized SKILL files and CLAUDE.md/templates/CLAUDE.md for further token budget reduction. The goal is to reduce total SKILL size to ≤145K characters and CLAUDE.md to ≤9K characters, using proven compression strategies (Canonical Example, Reference Directive, table compression, flow diagram simplification, example deduplication) without changing behavioral semantics.

## Glossary

- **SKILL_File**: A `SKILL.md` document inside `skills/<forge-command>/` that defines the behavioral rules, flow, and output format for a specific Forge command.
- **Compression_Engine**: The process that applies compression strategies to SKILL files and CLAUDE.md, producing semantically equivalent but shorter documents.
- **Reference_Directive**: A one-line pointer (e.g., `→ See CLAUDE.md §X.Y`) that replaces duplicated rule text by referencing the authoritative source.
- **Canonical_Example**: A single full-fidelity example retained per output format type; variant scenarios are replaced with one-line diff descriptions.
- **Table_Compression**: Merging verbose multi-paragraph descriptions into compact table rows, removing redundant columns.
- **Flow_Diagram_Simplification**: Replacing ASCII art flowcharts or verbose multi-step prose with ≤15-line numbered step lists.
- **Example_Deduplication**: Keeping one example per concept and replacing scenario variants with one-line descriptions.
- **YAML_Frontmatter**: The `---`-delimited metadata block at the top of each SKILL file containing `name`, `description`, and optionally `disable-model-invocation` fields.
- **Contract_Tests**: The test suite at `test/contract.test.ts` and `test/contract.skills.test.ts` that validates structural invariants of SKILL files, CLAUDE.md templates, and project assets.
- **Behavioral_Semantics**: The set of rules, thresholds, flows, decision logic, and output formats defined in a SKILL file that govern agent behavior. Compression must preserve these exactly.

## Requirements

### Requirement 1: Compress forge-spec SKILL.md (17.5K → ~11K)

**User Story:** As a Forge maintainer, I want to compress forge-spec from 17.5K to ~11K characters, so that the token budget consumed by this SKILL is reduced by ~37% without losing any behavioral rules.

#### Acceptance Criteria

1. WHEN the Compression_Engine processes forge-spec SKILL.md, THE Compression_Engine SHALL reduce the Spec template example in §3 to one Canonical_Example and replace the greenfield/brownfield variants with one-line diff descriptions.
2. WHEN the Compression_Engine processes forge-spec SKILL.md, THE Compression_Engine SHALL simplify the §8 full example by retaining only the greenfield Canonical_Example and replacing the brownfield variant with a one-line description referencing the Delta chapter.
3. WHEN the Compression_Engine processes forge-spec SKILL.md, THE Compression_Engine SHALL compress the §1.5 Import Mode conversion rules table by merging verbose cell descriptions into single-line entries.
4. WHEN the Compression_Engine processes forge-spec SKILL.md, THE Compression_Engine SHALL compress the §2 Step 1 input source table and generation rules into a compact format.
5. THE compressed forge-spec SKILL.md SHALL have a character count of ≤12,000.
6. WHEN the compressed forge-spec SKILL.md is validated, THE Contract_Tests SHALL pass with zero failures.

### Requirement 2: Compress forge-loop SKILL.md (14.7K → ~9K)

**User Story:** As a Forge maintainer, I want to compress forge-loop from 14.7K to ~9K characters, so that the token budget is reduced by ~39%, especially by removing state machine descriptions that duplicate code in skill-scheduler.ts.

#### Acceptance Criteria

1. WHEN the Compression_Engine processes forge-loop SKILL.md, THE Compression_Engine SHALL compress the §4.2 SKILL scheduling state machine table by removing rows that duplicate the state transitions already implemented in `skill-scheduler.ts`, retaining only a Reference_Directive to the code and a summary of non-obvious transitions.
2. WHEN the Compression_Engine processes forge-loop SKILL.md, THE Compression_Engine SHALL compress the §4.4 confirmation point preset strategy table into a compact single-column format.
3. WHEN the Compression_Engine processes forge-loop SKILL.md, THE Compression_Engine SHALL replace the §12 full execution example with a Canonical_Example of ≤15 lines and replace scenario variants (fix loop, circuit breaker, worktree, resume) with one-line diff descriptions.
4. WHEN the Compression_Engine processes forge-loop SKILL.md, THE Compression_Engine SHALL compress the §10 status file format section by removing the field lifecycle table that restates information already present in §3 Step 2.
5. THE compressed forge-loop SKILL.md SHALL have a character count of ≤10,000.
6. WHEN the compressed forge-loop SKILL.md is validated, THE Contract_Tests SHALL pass with zero failures.

### Requirement 3: Compress forge-router SKILL.md (11.7K → ~8K)

**User Story:** As a Forge maintainer, I want to compress forge-router from 11.7K to ~8K characters, so that the token budget is reduced by ~32%, primarily by deduplicating routing rules that overlap with CLAUDE.md §1.

#### Acceptance Criteria

1. WHEN the Compression_Engine processes forge-router SKILL.md, THE Compression_Engine SHALL replace the §2 three-tier table with a Reference_Directive to CLAUDE.md §1 and retain only the router-specific command sequence extensions (refactor and fix variants).
2. WHEN the Compression_Engine processes forge-router SKILL.md, THE Compression_Engine SHALL compress the §6 classification examples by retaining one example per tier (light, standard, full) and replacing the remaining examples with one-line descriptions.
3. WHEN the Compression_Engine processes forge-router SKILL.md, THE Compression_Engine SHALL compress the §8 behavior hints reference tables (§8.1, §8.2, §8.3) by merging the three tables into a single compact table with columns: Hint | Scope | Trigger.
4. THE compressed forge-router SKILL.md SHALL have a character count of ≤8,500.
5. WHEN the compressed forge-router SKILL.md is validated, THE Contract_Tests SHALL pass with zero failures.

### Requirement 4: Compress forge-refactor SKILL.md (8.5K → ~6K)

**User Story:** As a Forge maintainer, I want to compress forge-refactor from 8.5K to ~6K characters, so that the token budget is reduced by ~29% through template deduplication and flow simplification.

#### Acceptance Criteria

1. WHEN the Compression_Engine processes forge-refactor SKILL.md, THE Compression_Engine SHALL compress the §2 pre-check rejection output template by retaining only the format structure and removing the full code block example, replacing it with a one-line format reference.
2. WHEN the Compression_Engine processes forge-refactor SKILL.md, THE Compression_Engine SHALL compress the §3.1 Scan output format by retaining the table header and one example row, removing the full multi-layer example.
3. WHEN the Compression_Engine processes forge-refactor SKILL.md, THE Compression_Engine SHALL simplify the §6 execution flow from prose to a ≤6-line numbered step list.
4. THE compressed forge-refactor SKILL.md SHALL have a character count of ≤6,500.
5. WHEN the compressed forge-refactor SKILL.md is validated, THE Contract_Tests SHALL pass with zero failures.

### Requirement 5: Compress forge-test SKILL.md (7.9K → ~6K)

**User Story:** As a Forge maintainer, I want to compress forge-test from 7.9K to ~6K characters, so that the token budget is reduced by ~24% by deduplicating verification rules already defined in CLAUDE.md §2.3.

#### Acceptance Criteria

1. WHEN the Compression_Engine processes forge-test SKILL.md, THE Compression_Engine SHALL replace the §3 verification rules section (§3.1 through §3.6) with a Reference_Directive to CLAUDE.md §2.3 and retain only the forge-test-specific additions: the verification gate function (§3.1) and the false claims lookup table (§3.2).
2. WHEN the Compression_Engine processes forge-test SKILL.md, THE Compression_Engine SHALL compress the §7 examples by retaining one passing example and replacing the failing example with a one-line diff description.
3. WHEN the Compression_Engine processes forge-test SKILL.md, THE Compression_Engine SHALL compress the §2 Layer 3 checklist output format by removing the full code block and retaining only the 7-item table.
4. THE compressed forge-test SKILL.md SHALL have a character count of ≤6,500.
5. WHEN the compressed forge-test SKILL.md is validated, THE Contract_Tests SHALL pass with zero failures.

### Requirement 6: Compress forge-debug SKILL.md (6.7K → ~5K)

**User Story:** As a Forge maintainer, I want to compress forge-debug from 6.7K to ~5K characters, so that the token budget is reduced by ~25% through flow diagram simplification and example compression.

#### Acceptance Criteria

1. WHEN the Compression_Engine processes forge-debug SKILL.md, THE Compression_Engine SHALL simplify the §4 execution flow from verbose prose to a ≤6-line numbered step list.
2. WHEN the Compression_Engine processes forge-debug SKILL.md, THE Compression_Engine SHALL compress the §6 full four-phase example by retaining only the Phase 1 and Phase 4 outputs and replacing Phase 2-3 with two-line summaries.
3. WHEN the Compression_Engine processes forge-debug SKILL.md, THE Compression_Engine SHALL compress the §3 red flag signal table by merging the "suggested action" column into the signal description.
4. THE compressed forge-debug SKILL.md SHALL have a character count of ≤5,500.
5. WHEN the compressed forge-debug SKILL.md is validated, THE Contract_Tests SHALL pass with zero failures.

### Requirement 7: Compress forge-fix SKILL.md (6.3K → ~5K)

**User Story:** As a Forge maintainer, I want to compress forge-fix from 6.3K to ~5K characters, so that the token budget is reduced by ~21% through template deduplication.

#### Acceptance Criteria

1. WHEN the Compression_Engine processes forge-fix SKILL.md, THE Compression_Engine SHALL compress the §2.1 analysis report template by removing the full code block and retaining only the section heading list with one-line descriptions.
2. WHEN the Compression_Engine processes forge-fix SKILL.md, THE Compression_Engine SHALL compress the §4 fix-note.md template by removing the full code block and retaining only the field list.
3. WHEN the Compression_Engine processes forge-fix SKILL.md, THE Compression_Engine SHALL simplify the §6 execution flow from verbose prose to a ≤5-line numbered step list.
4. THE compressed forge-fix SKILL.md SHALL have a character count of ≤5,500.
5. WHEN the compressed forge-fix SKILL.md is validated, THE Contract_Tests SHALL pass with zero failures.

### Requirement 8: Slim CLAUDE.md §2.5 Restatement Checkpoint (P1)

**User Story:** As a Forge maintainer, I want to slim CLAUDE.md §2.5 from its current detailed Restatement Checkpoint rules to a 2-3 line principle statement with a Reference_Directive, so that every session loads ~2K fewer characters without losing the mechanism (which already exists in forge-build SKILL.md §3.2).

#### Acceptance Criteria

1. WHEN the Compression_Engine processes CLAUDE.md, THE Compression_Engine SHALL replace the §2.5 detailed Restatement Checkpoint content (counter initialization, checkpoint steps, summary format, exception triggers) with a principle statement of ≤3 lines plus a Reference_Directive to forge-build SKILL.md §3.2.
2. WHEN the Compression_Engine processes templates/CLAUDE.md, THE Compression_Engine SHALL apply the same §2.5 compression as applied to CLAUDE.md.
3. THE compressed CLAUDE.md SHALL have a character count of ≤9,500.
4. THE compressed templates/CLAUDE.md SHALL have a character count of ≤9,500.
5. WHEN the compressed CLAUDE.md is validated, THE Contract_Tests SHALL pass with zero failures, including the §5 Self-Evolution section assertions and all template placeholder assertions.

### Requirement 9: YAML Frontmatter Preservation

**User Story:** As a Forge maintainer, I want all YAML frontmatter in SKILL files to remain untouched after compression, so that contract tests and the Forge runtime continue to function correctly.

#### Acceptance Criteria

1. FOR ALL SKILL_Files processed by the Compression_Engine, THE Compression_Engine SHALL preserve the YAML_Frontmatter block (name, description, disable-model-invocation fields) byte-for-byte identical to the original.
2. WHEN the compressed SKILL_Files are validated, THE Contract_Tests for frontmatter integrity (name field, description field, disable-model-invocation field) SHALL pass with zero failures.

### Requirement 10: Behavioral Semantics Preservation

**User Story:** As a Forge maintainer, I want all behavioral semantics to be preserved after compression, so that agent behavior is identical before and after the optimization.

#### Acceptance Criteria

1. FOR ALL SKILL_Files processed by the Compression_Engine, THE Compression_Engine SHALL preserve all rules, thresholds, decision logic, state transitions, and output format specifications — changing only the expression (reference directives, table compression, example deduplication), not the substance.
2. FOR ALL SKILL_Files processed by the Compression_Engine, THE Compression_Engine SHALL preserve all section headings that match the pattern `## <number>.` to maintain the contract test assertion for numbered section headings.
3. IF a rule or threshold is replaced by a Reference_Directive, THEN THE Reference_Directive SHALL point to the exact section in the authoritative source (CLAUDE.md or another SKILL file) where the full rule is defined.

### Requirement 11: Total Size Target Validation

**User Story:** As a Forge maintainer, I want the total SKILL document size to be ≤145K characters and CLAUDE.md ≤9.5K characters after all compressions, so that the token budget improvement is measurable and verified.

#### Acceptance Criteria

1. WHEN all compressions are complete, THE total character count of all `skills/*/SKILL.md` files SHALL be ≤145,000.
2. WHEN all compressions are complete, THE character count of `CLAUDE.md` SHALL be ≤9,500.
3. WHEN all compressions are complete, THE character count of `templates/CLAUDE.md` SHALL be ≤9,500.
4. WHEN the full validation suite is run (`npx vitest run test/contract.test.ts test/contract.skills.test.ts`), THE Contract_Tests SHALL pass with zero failures.
5. WHEN the full CI check is run (`npm run check`), THE CI suite SHALL pass with zero failures.
