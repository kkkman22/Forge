---
style_guide_version: "1.0"
updated: "2026-05-08"
related_specs: ["oz-skills-inspiration", "skills-cross-pollination"]
---

# Forge SKILL.md Style Guide v1.0

## 1. Overview

This guide defines the authoring standard for all `skills/forge-*/SKILL.md` files. It consolidates conventions observed across 19 existing skills into a single reference.

**Audience**: Skill authors (human or AI agent) creating new forge-* skills.

**Relationship to CLAUDE.md**: CLAUDE.md is the project constitution (cross-skill behavior rules). This guide is the authoring manual (how to write a compliant SKILL.md).

## 2. Frontmatter Field Specification

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Skill directory name without `forge-` prefix (e.g., `forge-plan` → `plan`). Must match kebab-case directory name. |
| `description` | string | Yes | Two-sentence format (see Section 4). |
| `disable-model-invocation` | boolean | Yes | Must be `true` for all forge-* sub-skills (invoked via `/forge <command>` only). |
| `license` | string | No | License identifier if applicable. |
| `deliverable_exempt` | boolean | No | Set `true` for query/tool skills where Deliverable is trivial (e.g., forge-status). Must explain exemption in first paragraph. |
| `skeleton_exempt_legacy` | boolean | No | Set `true` for existing skills not yet retrofitted. **New skills must NOT use this flag.** |
| `style_guide_version` | string | No | Semantic version of this guide the skill adheres to (e.g., `"1.0"`). |

**Common errors**:
- Missing `disable-model-invocation: true` → skill can be invoked directly by AI, bypassing `/forge` routing
- Description without "Use when" → validator rejects it
- Using `name` that doesn't match directory → routing breaks

## 3. SKILL.md Section Skeleton

Every new SKILL.md must follow this structure:

```
## 1. Overview
## 2. Prerequisites
## 3..N-1. Workflow (skill-specific sections)
## N. Deliverable
```

**Prerequisites** must use a table format:

```markdown
## 2. Prerequisites

| # | Check | Block Condition | Route |
|---|-------|-----------------|-------|
| 1 | Spec Gate — path/status | Not `locked` | -> `/forge spec` |
```

**Deliverable** must use structured fields (no prose):

```markdown
## N. Deliverable

**Category**: execution

- **Changed Files**: list of files
- **Tests Run**: command and result
- **Verification Output**: `npm run check` exit code
- **Commit Hash**: SHA
```

Categories and their required fields:

| Category | Required Fields |
|----------|----------------|
| `decision` | Decision, Rationale, Evidence, Next Action |
| `execution` | Changed Files, Tests Run, Verification Output, Commit Hash |
| `delivery` | Delivery Target, Gate Results, Next Step Prompt |
| `diagnostic` | Finding, Root Cause, Recommendation, Confidence |

## 4. Description Two-Sentence Rule

Every `description` field must follow this exact format:

**Sentence 1**: Starts with an imperative verb from the whitelist (`Abort`, `Audit`, `Build`, `Capture`, `Decide`, `Decompose`, `Diagnose`, `Execute`, `Fix`, `Grill`, `Orchestrate`, `Plan`, `Refactor`, `Restart`, `Resume`, `Review`, `Ship`, `Specify`, `Test`, `Verify`).

**Sentence 2**: Starts with "Use when" followed by trigger conditions.

**Example**: `"Plan a locked Spec into atomic TDD-ready tasks. Use when running /forge plan or a spec is locked."`

**Validated by**: `scripts/validate-skill-descriptions.mjs --strict`

## 5. Naming Conventions

- **Directory**: `forge-<verb-or-noun>` in kebab-case (e.g., `forge-build`, `forge-loop`)
- **Title**: Single H1 in Title Case (e.g., `# /forge build — Execution Engine`)
- **Section numbering**: `## 1.`, `## 2.`, etc. with period and space
- **File name**: Always `SKILL.md` (uppercase)

## 6. references/ Directory

Content that exceeds 150-line SKILL.md limit goes into `references/`:

- **What belongs**: Detailed workflows, pattern catalogs, examples, format specs
- **What stays in SKILL.md**: Overview, Prerequisites, high-level workflow, Deliverable
- **Reference syntax**: `→ 详见 references/<filename>.md`
- **Naming**: kebab-case, descriptive (e.g., `frontend-check-patterns.md`)

## 7. scripts/ Directory

Skills should treat `scripts/` as black-box CLIs (see CLAUDE.md §2.8):

- Always run `--help` before using a script
- Never `cat` or `read` script source unless modification is needed
- User-facing scripts must have `--help` support
- Internal-only scripts are listed in `scripts/.help-exempt`

## 8. Anti-Patterns

| # | Anti-Pattern | Why | Correct Approach |
|---|-------------|-----|-----------------|
| 1 | Emoji in SKILL.md body | Distracts, inconsistent rendering | Plain text only |
| 2 | Hardcoded absolute paths | Breaks across environments | Use relative paths |
| 3 | Version numbers in description | Becomes stale immediately | Keep in separate docs |
| 4 | Prose-style Deliverable | Not machine-parseable | Use structured fields |
| 5 | Cross-reference nesting | Reader loses context | One level of references max |
| 6 | "Should" language in rules | Ambiguous enforcement level | Use "must" / "shall" |

## 9. Version Evolution

- **style_guide_version** uses semver: `X.Y`
- **Minor (1.x)**: New optional fields, relaxed rules, expanded anti-patterns — backward compatible
- **Major (2.0+)**: Breaking changes (new required fields, removed fields) — requires ADR at `.forge/decisions/ADR-NNNN-skill-style-guide-vN.md`
- Changes logged in `.forge/knowledge/skill-style-guide-changelog.md`

## 10. Quick Checklist (PR Self-Check)

- [ ] `description` follows two-sentence format (imperative verb + "Use when")
- [ ] Contains `## Prerequisites` table with Block Condition and Route columns
- [ ] Contains `## Deliverable` with structured fields (or `deliverable_exempt: true`)
- [ ] SKILL.md is 150 lines or fewer (detailed content in `references/`)
- [ ] `disable-model-invocation: true` in frontmatter
- [ ] `name` matches directory name (without `forge-` prefix)
- [ ] No emoji, no hardcoded paths, no version numbers in description
- [ ] Section numbering uses `## N.` format
- [ ] References use `→ 详见 references/<file>.md` syntax
- [ ] If new scripts are added, they have `--help` and category header
