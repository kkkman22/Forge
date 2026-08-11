---
updated: 2026-08-11
---
# Grill Session Examples

End-to-end transcripts for `/tinkerman grill`. Condensed for readability; real
sessions include more follow-up children.

## Example 1 — Backend-only Feature

**User**: `/tinkerman grill add batch export to orders API`

**Generated tree** (5 roots, no glossary hits → no children):

```
- [PENDING] functionality/functionality-1: What are the core user-facing behaviors...
- [PENDING] boundary/boundary-1: What is explicitly out of scope?
- [PENDING] dependency/dependency-1: Which existing modules or external services...
- [PENDING] assumption/assumption-1: What unstated preconditions are being assumed?
- [PENDING] non_goal/non_goal-1: What is this intentionally NOT trying to achieve?
```

**Turn 1** (node `functionality-1`):

> **Grill**: What are the core user-facing behaviors this needs to support?
> **Suggestion**: "CSV export of orders filtered by date range + status."
>
> **User**: Accept, plus JSON format.

`applyAnswer(tree, "functionality-1", "CSV + JSON export, filtered by date range and status")`

**Turn 2** (node `boundary-1`):

> **Grill**: What is explicitly out of scope?
> **Suggestion**: "Real-time streaming, PDF rendering."
>
> **User**: Dig deeper on streaming.

Skill inserts child `boundary-1-follow-1`: *"What constitutes 'real-time' in this
context — polling every N seconds, or true push?"*

… loop continues until `isComplete`.

**Final output** written to `.tinkerman/findings/grill-add-batch-export-to-orders-api.md`:

```markdown
# Grill Findings: add batch export to orders API

## Decision Tree
- [RESOLVED] functionality/functionality-1: What are the core user-facing behaviors...
  Answer: CSV + JSON export, filtered by date range and status
- [RESOLVED] boundary/boundary-1: What is explicitly out of scope?
  Answer: No real-time streaming, no PDF rendering
  - [RESOLVED] boundary/boundary-1-follow-1: What constitutes 'real-time'...
    Answer: True push (webhooks); polling every N seconds stays in scope
...

## Q&A Pairs
- Q: What are the core user-facing behaviors this needs to support?
  A: CSV + JSON export, filtered by date range and status
...

## Alignment Summary
Export batch endpoint accepts date range + status filter, emits CSV or JSON,
excludes push / streaming / PDF. Depends on existing orders service and auth
middleware.

## New Glossary Candidates
- batch-export (3)
- export-filter (2)
```

## Example 2 — Grill with Glossary Hits

**User**: `/tinkerman grill refactor tier routing to support project_phase hints`

Glossary has `Tier` and `Hint`. Generated tree attaches two follow-ups under
`dependency-1`:

```
- [PENDING] dependency/dependency-1: Which existing modules...
  - [PENDING] dependency/dependency-1-ref-1: How does this decision relate to "Tier"?
  - [PENDING] dependency/dependency-1-ref-2: How does this decision relate to "Hint"?
```

Those children pre-populate `aiSuggestion` with the glossary definitions, so the
user can accept (link decision back to canonical term) or override (signal a new
variant that may need its own glossary entry — picked up by
`extractNewGlossaryCandidates`).

## Example 3 — Resume After Abandonment

User closes the session mid-way. `.tinkerman/status.md.phase = "grill_abandoned"`,
findings file contains partial tree with mixed `pending`/`resolved` nodes.

`/tinkerman resume`:

1. Reads `.tinkerman/findings/grill-<topic>.md`, reconstructs `DecisionTree`
2. Calls `selectNextQuestion(tree)` → returns first still-pending node
3. Loops exactly as a fresh session would

Because `applyAnswer` is pure and ID-stable, the resumed session produces the
same alignment summary any replay of the same answer sequence would.
