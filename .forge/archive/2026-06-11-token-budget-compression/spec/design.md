---
status: locked
feature: token-budget-compression
layout: design
created: 2026-04-30
---

# Design Document: Token Budget Compression

## Overview

This spec targets the remaining unoptimized SKILL files and CLAUDE.md for further token budget reduction. The previous `skill-document-optimization` spec successfully compressed the top 4 SKILL files (forge-build, forge-learn, forge-plan, forge-review) from 160K to 69K characters. However, total SKILL size is still 178K characters and CLAUDE.md is 12K characters — both above target.

This optimization applies the same proven compression strategies to 7 remaining SKILL files (forge-spec, forge-loop, forge-router, forge-refactor, forge-test, forge-debug, forge-fix) and slims CLAUDE.md §2.5.

**Key constraint**: This is documentation-only — no TypeScript code changes. All changes are text edits to markdown files. Contract tests at `test/contract.test.ts` and `test/contract.skills.test.ts` validate structural invariants after each edit.

### Current State

| File | Current Size | Target Size | Reduction |
|------|-------------|-------------|-----------|
| forge-spec SKILL.md | 17,499 | ≤12,000 | ~31% |
| forge-loop SKILL.md | 14,741 | ≤10,000 | ~32% |
| forge-router SKILL.md | 11,693 | ≤8,500 | ~27% |
| forge-refactor SKILL.md | 8,544 | ≤6,500 | ~24% |
| forge-test SKILL.md | 7,930 | ≤6,500 | ~18% |
| forge-debug SKILL.md | 6,748 | ≤5,500 | ~18% |
| forge-fix SKILL.md | 6,321 | ≤5,500 | ~13% |
| CLAUDE.md | 11,956 | ≤9,500 | ~21% |
| templates/CLAUDE.md | 11,479 | ≤9,500 | ~17% |
| **Total SKILL (all 16)** | **178,417** | **≤145,000** | **~19%** |

---

## Architecture

This optimization uses a sequential file-by-file approach with checkpoint validation after each file. No new components or runtime code are introduced.

### Compression Pipeline

```
For each target file:
  1. Read current file, measure baseline size
  2. Apply compression strategies (see §Components)
  3. Verify contract tests pass
  4. Verify character count meets target
  5. Move to next file
```

### Execution Order (Largest First)

Files are compressed in descending size order to maximize early gains and catch strategy issues on the largest files first:

1. **forge-spec** (17.5K → ≤12K) — largest remaining, most compression opportunity
2. **forge-loop** (14.7K → ≤10K) — state machine duplication with code
3. **forge-router** (11.7K → ≤8.5K) — routing rules duplicate CLAUDE.md §1
4. **CLAUDE.md + templates/CLAUDE.md** (12K/11.5K → ≤9.5K each) — §2.5 slimming
5. **forge-refactor** (8.5K → ≤6.5K)
6. **forge-test** (7.9K → ≤6.5K)
7. **forge-debug** (6.7K → ≤5.5K)
8. **forge-fix** (6.3K → ≤5.5K)

### Checkpoint Strategy

After each file compression:
- Run `npx vitest run test/contract.test.ts test/contract.skills.test.ts`
- Verify `wc -c` meets target
- If tests fail → revert and adjust compression
- If size exceeds target → apply additional strategies

---

## Components and Interfaces

### Compression Strategies

Five proven strategies from the previous optimization, applied per-file:

#### Strategy 1: Canonical Example

Keep one full-fidelity example per output format. Replace variant scenarios with one-line diff descriptions.

**Pattern**:
```
Before: 3 full examples (greenfield, brownfield, error case) — ~80 lines
After:  1 canonical example + 2 one-line diffs — ~25 lines
```

**Applies to**: forge-spec §3/§8, forge-loop §12, forge-router §6, forge-debug §6

#### Strategy 2: Reference Directive

Replace duplicated rule text with a one-line pointer to the authoritative source.

**Pattern**:
```
Before: Full restatement of CLAUDE.md §2.3 verification rules (~40 lines)
After:  → 遵循 CLAUDE.md §2.3 验证铁律 + forge-test-specific additions only
```

**Applies to**: forge-test §3 (→ CLAUDE.md §2.3), forge-router §2 (→ CLAUDE.md §1), CLAUDE.md §2.5 (→ forge-build §3.2)

#### Strategy 3: Table Compression

Merge verbose multi-paragraph descriptions into compact table rows. Remove redundant columns.

**Pattern**:
```
Before: 3-column table with paragraph-length cells
After:  2-column table with single-line cells
```

**Applies to**: forge-spec §1.5, forge-loop §4.4, forge-router §8, forge-debug §3

#### Strategy 4: Flow Diagram Simplification

Replace verbose multi-step prose or ASCII art with ≤6-line numbered step lists.

**Pattern**:
```
Before: 15-line prose description of execution flow
After:  6-line numbered step list
```

**Applies to**: forge-refactor §6, forge-debug §4, forge-fix §6

#### Strategy 5: Example Deduplication

Keep one example per concept. Replace scenario variants with one-line descriptions.

**Pattern**:
```
Before: Full passing example + full failing example (~40 lines)
After:  Full passing example + one-line failing variant description (~20 lines)
```

**Applies to**: forge-test §7, forge-loop §12

### Per-File Compression Plans

#### forge-spec (17,499 → ≤12,000)

| Section | Strategy | Expected Savings |
|---------|----------|-----------------|
| §3 Spec template | Canonical Example: keep greenfield template, replace brownfield with one-line diff | ~1,500 chars |
| §8 Full example | Canonical Example: keep greenfield, replace brownfield variant with one-line | ~1,200 chars |
| §1.5 Import Mode table | Table Compression: merge verbose cells to single-line | ~800 chars |
| §2 Step 1 input/rules | Table Compression: compact format | ~600 chars |
| §4 Quality standards | Compress examples within standards | ~500 chars |
| §7 Edge cases | Table Compression | ~400 chars |
| §9 AI failure modes | Already a table — minor tightening | ~200 chars |

#### forge-loop (14,741 → ≤10,000)

| Section | Strategy | Expected Savings |
|---------|----------|-----------------|
| §4.2 State machine table | Reference Directive to skill-scheduler.ts + summary of non-obvious transitions | ~1,200 chars |
| §4.4 Confirmation presets | Table Compression: single-column compact format | ~600 chars |
| §12 Full example | Canonical Example: ≤15 lines + one-line variant descriptions | ~1,000 chars |
| §10 Status file format | Remove field lifecycle table (restates §3 Step 2) | ~800 chars |
| §11 Edge cases | Table Compression | ~400 chars |
| §2 CLI options table | Minor tightening | ~300 chars |
| §3 Startup flow | Compress step descriptions | ~400 chars |

#### forge-router (11,693 → ≤8,500)

| Section | Strategy | Expected Savings |
|---------|----------|-----------------|
| §2 Three-tier table | Reference Directive to CLAUDE.md §1, keep only refactor/fix variants | ~800 chars |
| §6 Classification examples | Canonical Example: one per tier, rest as one-liners | ~800 chars |
| §8 Behavior hints (§8.1-§8.3) | Table Compression: merge 3 tables into one with Hint/Scope/Trigger columns | ~1,000 chars |
| §3 Signal details | Compress verbose descriptions | ~400 chars |

#### CLAUDE.md §2.5 (11,956 → ≤9,500)

| Section | Strategy | Expected Savings |
|---------|----------|-----------------|
| §2.5 Restatement Checkpoint | Replace detailed rules with 2-3 line principle + Reference Directive to forge-build §3.2 | ~2,000 chars |
| §2.6 Output conciseness | Compress Before/After example and retained output list | ~500 chars |

Same compression applied to `templates/CLAUDE.md`.

#### forge-refactor (8,544 → ≤6,500)

| Section | Strategy | Expected Savings |
|---------|----------|-----------------|
| §2 Pre-check rejection template | Remove full code block, keep format reference | ~500 chars |
| §3.1 Scan output format | Keep table header + one row, remove full multi-layer example | ~600 chars |
| §6 Execution flow | Flow Diagram Simplification: ≤6-line step list | ~400 chars |
| §4 Method library | Minor tightening of descriptions | ~300 chars |

#### forge-test (7,930 → ≤6,500)

| Section | Strategy | Expected Savings |
|---------|----------|-----------------|
| §3 Verification rules (§3.1-§3.6) | Reference Directive to CLAUDE.md §2.3, keep only gate function + false claims table | ~800 chars |
| §7 Examples | Canonical Example: keep passing, replace failing with one-line diff | ~400 chars |
| §2 Layer 3 checklist output | Remove full code block, keep 7-item table | ~300 chars |

#### forge-debug (6,748 → ≤5,500)

| Section | Strategy | Expected Savings |
|---------|----------|-----------------|
| §4 Execution flow | Flow Diagram Simplification: ≤6-line step list | ~300 chars |
| §6 Four-phase example | Keep Phase 1 + Phase 4, replace Phase 2-3 with two-line summaries | ~500 chars |
| §3 Red flag table | Merge "suggested action" into signal description | ~300 chars |

#### forge-fix (6,321 → ≤5,500)

| Section | Strategy | Expected Savings |
|---------|----------|-----------------|
| §2.1 Analysis report template | Remove full code block, keep section heading list | ~400 chars |
| §4 fix-note template | Remove full code block, keep field list | ~200 chars |
| §6 Execution flow | Flow Diagram Simplification: ≤5-line step list | ~200 chars |

---

## Data Models

No data models are introduced. This optimization modifies only markdown document content. The structural invariants validated by contract tests serve as the implicit "schema":

### Contract Test Invariants (Must Preserve)

| Invariant | Test File | What It Checks |
|-----------|-----------|----------------|
| YAML frontmatter with `name` field | contract.test.ts §2, contract.skills.test.ts | `---\nname: forge-*\n` at file start |
| `description` field in frontmatter | contract.skills.test.ts | `description:` present in frontmatter |
| `disable-model-invocation: true` | contract.test.ts §2 | All skills except forge-router |
| `## <number>.` section headings | contract.test.ts §11 | At least one numbered `##` heading after frontmatter |
| Substantive content after frontmatter | contract.skills.test.ts | Non-empty body content |
| forge-learn Rule Distillation references | contract.test.ts §17 | Four data sources + five thresholds (not modified in this spec) |
| CLAUDE.md §5 Self-Evolution section | contract.test.ts §14 | Section heading, evolved-rules.md reference, knowledge categories, 15-rule cap, exclusions |
| templates/CLAUDE.md placeholders | contract.test.ts §3 | `{{project_name}}`, `{{tech_stack}}`, `{{security_level}}`, `{{knowledge_limit}}`, `{{init_date}}` |

---

## Error Handling

Since this is documentation-only editing, error handling is limited to the checkpoint validation strategy:

| Error Scenario | Detection | Recovery |
|----------------|-----------|----------|
| Contract test failure after compression | `npx vitest run` returns non-zero | Revert the compression that broke the test, adjust strategy |
| Character count exceeds target | `wc -c` check | Apply additional compression strategies to the file |
| Behavioral semantics accidentally removed | Manual review during compression | Re-read original file, restore missing rules/thresholds |
| YAML frontmatter modified | Contract test catches `name:` / `description:` mismatch | Restore original frontmatter block |
| Section heading removed | Contract test catches missing `## <number>.` pattern | Restore heading, compress content within the section instead |

---

## Testing Strategy

### Why Property-Based Testing Does Not Apply

This feature involves only text editing of markdown documentation files. There are no pure functions, no input/output transformations, and no universal properties to test. The "compression engine" is a human (or AI) editor applying text transformations — not executable code.

### Validation Approach

**Primary validation**: Existing contract test suite (`test/contract.test.ts` + `test/contract.skills.test.ts`) — 273 tests that validate structural invariants of all SKILL files, CLAUDE.md, templates, and project assets.

**Secondary validation**: Character count measurements via `wc -c` to verify size targets are met.

**Tertiary validation**: Full CI suite (`npm run check`) including type checking, linting, and all tests.

### Checkpoint Protocol

After each file compression:

1. `npx vitest run test/contract.test.ts test/contract.skills.test.ts` — must pass with zero failures
2. `wc -c <file>` — must meet per-file target
3. After all files: `npm run check` — full CI must pass
4. After all files: sum of `wc -c skills/*/SKILL.md` — must be ≤145,000

### Test Commands

```bash
# Per-file checkpoint
npx vitest run test/contract.test.ts test/contract.skills.test.ts

# Per-file size check
wc -c skills/<skill>/SKILL.md

# Final total size check
total=0; for f in skills/*/SKILL.md; do size=$(wc -c < "$f"); total=$((total + size)); done; echo "Total: $total"

# Final CI check
npm run check
```
