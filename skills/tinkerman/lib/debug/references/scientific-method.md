---
updated: 2026-08-11
---
# Scientific Debugging Method — Reference

> Extracted from debug instructions for maintainability.

## Phase 1 — Symptom Gathering (Fix Proposals Prohibited)

- Describe observable error behavior
- Collect error messages, stack traces, logs
- Determine reproduction conditions
- Write to `.forge/debug/{slug}.md` → Symptoms section
- **Symptoms are IMMUTABLE after gathering** — never overwrite

## Phase 2 — Hypothesis Generation

For each symptom, propose ≥2 falsifiable hypotheses:

Each hypothesis must include:
- **Hypothesis**: "If X, then we should observe Y"
- **Predicted observable result**: what we'd see if hypothesis is true
- **Falsification test**: what we'd do to disprove it

Write to `.forge/debug/{slug}.md` → Hypotheses section (append-only).

## Phase 3 — Hypothesis Testing

Test one hypothesis at a time. Methods in priority order:

1. **Binary search** (git bisect, comment-out-everything)
2. **Log/trace inspection** (add temporary logging)
3. **Minimal reproduction** (isolate the failure)
4. **Code tracing** (follow indirection chains)

Record: confirmed/excluded + evidence → Evidence section (append-only with timestamps).

## Phase 4 — Fix (only after root cause found)

**Must fill Structured Reasoning Checkpoint before any code change:**

```
Hypothesis: [the confirmed root cause hypothesis]
Confirming Evidence: [what proved it]
Falsification Test: [what would disprove it]
Fix Rationale: [why this fix addresses root cause]
Blind Spots: [what might we be missing]
```

Prefer TDD mode: write failing test first, then fix, then refactor.

## Phase 5 — Verification

- Run full test suite
- Confirm original symptom no longer reproduces
- Confirm no regression in previously passing tests

---

## Debug Session File Format

Create `.forge/debug/{slug}.md`:

```markdown
---
slug: "auth-login-null-pointer"
created: "2026-06-05T10:30:00Z"
status: "in-progress"  # in-progress | resolved | abandoned
root_cause: ""
resolution: ""
---

# Current Focus
<!-- OVERWRITE on each update -->

# Symptoms
<!-- IMMUTABLE after Phase 1 -->

# Hypotheses
<!-- Append only -->

# Evidence
<!-- Append only with timestamps: [HH:MM] description -->

# Eliminated
<!-- Append only -->

# Resolution
<!-- Fill when root cause found -->
```

### Write Rules Summary

| Section | Rule | Violation |
|---------|------|-----------|
| Current Focus | Overwrite each update | Writing stale focus |
| Symptoms | Immutable after Phase 1 | Editing symptoms |
| Hypotheses | Append only | Deleting hypotheses |
| Evidence | Append only with timestamps | Editing evidence |
| Eliminated | Append only | Removing entries |
| Resolution | Fill when done | Premature resolution |

---

## Debug Knowledge Base

Maintain `.forge/debug/knowledge-base.md` (append-only):

```markdown
## [Date] Pattern Name
Keywords: keyword1, keyword2, keyword3
Pattern: description of the pattern
Applicable: when to apply this pattern
```

Matching: keyword overlap scoring against current symptoms.

---

## Research vs Reasoning Decision Tree

```
if problem is framework/API usage issue:
  → WebSearch external docs
elif problem is project code logic:
  → trace code (Read, Grep)
elif problem is environment/config:
  → check env (Bash, env vars)
elif 3 internal trace attempts with no progress:
  → switch to external search (WebSearch)
```
