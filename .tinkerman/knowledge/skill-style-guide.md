---
style_guide_version: "2.0"
updated: "2026-05-17"
related_specs: ["oz-skills-inspiration", "skills-cross-pollination"]
---

# Forge Skill Authoring Style Guide v2.0

## 1. Overview

This guide defines the authoring standard for all `skills/forge/lib/*/instructions.md` files. It consolidates conventions observed across 29 existing sub-skills into a single reference.

**Audience**: Skill authors (human or AI agent) creating new forge sub-skills.

**Relationship to CLAUDE.md**: CLAUDE.md is the project constitution (cross-skill behavior rules). This guide is the authoring manual (how to write a compliant instructions.md).

**Architecture**: Since v2.5 (ADR-0004), `forge` is the sole registered skill. Sub-skills live under `skills/forge/lib/<sub>/instructions.md` and are dispatched by the 9-step chokepoint in `src/forge-dispatcher.ts`. Sub-skills are NOT registered as Claude Code skills — the dispatcher handles invocation via `Agent` (fork) or `Read` (inline).

## 2. Frontmatter Field Specification

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | No | Optional display name. If omitted, inferred from directory name. |
| `description` | string | Yes | Two-sentence format (see Section 4). |
| `dispatch_mode` | string | Yes | `fork` (Agent tool) or `inline` (Read + execute). See dispatch table in `skills/forge/SKILL.md`. |
| `allowed_tools` | string[] | Yes | Tools the sub-skill needs. Fork mode: tools for spawned Agent. Inline mode: tools for main agent. |
| `deliverable_exempt` | boolean | No | Set `true` for query/tool sub-skills where Deliverable is trivial (e.g., status). Must explain exemption in first paragraph. |
| `skeleton_exempt_legacy` | boolean | No | Set `true` for existing sub-skills not yet retrofitted. **New sub-skills must NOT use this flag.** |
| `style_guide_version` | string | No | Semantic version of this guide the sub-skill adheres to (e.g., `"2.0"`). |

**Note**: `disable-model-invocation` is no longer used. Sub-skills are not registered with Claude Code — the dispatcher enforces invocation control.

**Common errors**:
- Description without "Use when" → validator rejects it
- Missing `dispatch_mode` → dispatcher cannot route correctly
- Using `allowed_tools` that don't match actual needs → tool access denied at dispatch time

## 3. instructions.md Section Skeleton

Every new instructions.md must follow this structure:

```
## 1. Overview
## 2. Prerequisites
## 3..N-1. Workflow (sub-skill-specific sections)
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

- **Directory**: `<verb-or-noun>` in kebab-case under `skills/forge/lib/` (e.g., `build`, `loop`)
- **Title**: Single H1 in Title Case (e.g., `# /forge build — Execution Engine`)
- **Section numbering**: `## 1.`, `## 2.`, etc. with period and space
- **File name**: Always `instructions.md` (lowercase)

## 6. references/ Directory

Content that exceeds 150-line instructions.md limit goes into `references/`:

- **What belongs**: Detailed workflows, pattern catalogs, examples, format specs
- **What stays in instructions.md**: Overview, Prerequisites, high-level workflow, Deliverable
- **Reference syntax**: `→ 详见 references/<filename>.md`
- **Naming**: kebab-case, descriptive (e.g., `frontend-check-patterns.md`)

## 7. scripts/ Directory

Sub-skills should treat `scripts/` as black-box CLIs (see CLAUDE.md §2.8):

- Always run `--help` before using a script
- Never `cat` or `read` script source unless modification is needed
- User-facing scripts must have `--help` support
- Internal-only scripts are listed in `scripts/.help-exempt`

### Script Categories

Every script must declare its category in a header comment:

```bash
# category: user-facing     # or internal-only | one-off
```

| Category | Criteria | --help Required |
|----------|----------|----------------|
| `user-facing` | Referenced in package.json, CLAUDE.md, instructions.md, or /forge commands | Yes |
| `internal-only` | Only sourced by other scripts, hooks, or CI | No |
| `one-off` | Temporary migration/tool | No |

**Validated by**: `node scripts/validate-scripts-help.mjs`

## 8. Anti-Patterns

| # | Anti-Pattern | Why | Correct Approach |
|---|-------------|-----|-----------------|
| 1 | Emoji in instructions.md body | Distracts, inconsistent rendering | Plain text only |
| 2 | Hardcoded absolute paths | Breaks across environments | Use relative paths |
| 3 | Version numbers in description | Becomes stale immediately | Keep in separate docs |
| 4 | Prose-style Deliverable | Not machine-parseable | Use structured fields |
| 5 | Cross-reference nesting | Reader loses context | One level of references max |
| 6 | "Should" language in rules | Ambiguous enforcement level | Use "must" / "shall" |

## 9. Version Evolution

- **style_guide_version** uses semver: `X.Y`
- **Minor (2.x)**: New optional fields, relaxed rules, expanded anti-patterns — backward compatible
- **Major (3.0+)**: Breaking changes (new required fields, removed fields) — requires ADR at `.tinkerman/decisions/ADR-NNNN-skill-style-guide-vN.md`
- Changes logged in `.tinkerman/knowledge/skill-style-guide-changelog.md`

## 10. Quick Checklist (PR Self-Check)

- [ ] `description` follows two-sentence format (imperative verb + "Use when")
- [ ] `dispatch_mode` declared (`fork` or `inline`)
- [ ] `allowed_tools` lists all needed tools
- [ ] Contains `## Prerequisites` table with Block Condition and Route columns
- [ ] Contains `## Deliverable` with structured fields (or `deliverable_exempt: true`)
- [ ] instructions.md is 150 lines or fewer (detailed content in `references/`)
- [ ] No emoji, no hardcoded paths, no version numbers in description
- [ ] Section numbering uses `## N.` format
- [ ] References use `→ 详见 references/<file>.md` syntax
- [ ] If new scripts are added, they have `--help` and category header
