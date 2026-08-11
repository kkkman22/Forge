---
updated: 2026-08-11
---
# Decision Tree Format

Reference for the in-memory shape produced by `generateDecisionTree` and persisted
via `renderGrillFindings`. See `src/grill.ts` for the authoritative types.

## TypeScript Shape

```typescript
interface DecisionTree {
  rootDescription: string;   // verbatim user description
  nodes: DecisionTreeNode[]; // ordered, one per category
  createdAt: string;         // ISO 8601
  lastUpdated: string;       // ISO 8601, bumped on applyAnswer
}

interface DecisionTreeNode {
  id: string;                // stable, e.g. "functionality-1"
  category: "functionality" | "boundary" | "dependency" | "assumption" | "non_goal";
  question: string;
  status: "pending" | "resolved" | "deferred" | "skipped";
  aiSuggestion?: string;     // pre-filled draft answer
  userAnswer?: string;       // populated after applyAnswer
  children: DecisionTreeNode[];
}
```

## Root Node ID Scheme

Each session emits exactly one root per category, always in this order:

1. `functionality-1` — core user-facing behaviors
2. `boundary-1` — what is explicitly out of scope
3. `dependency-1` — modules / services this must coordinate with
4. `assumption-1` — unstated preconditions
5. `non_goal-1` — what this is intentionally NOT trying to achieve

## Follow-up Children

Glossary hits (canonical name or alias appearing in `rootDescription`) are attached
as children of `dependency-1`. Child IDs follow `dependency-1-ref-<n>`, indexed in
first-occurrence order in the description. Each child carries:

- `question`: `How does this decision relate to the existing term "<term>"?`
- `aiSuggestion`: `This decision involves <term>: <definition>`

No other root has children at generation time. Additional children may be appended
in future versions; IDs remain stable across revisions.

## Status Lifecycle

```
pending ──applyAnswer──> resolved
pending ──user defer───> deferred
pending ──user skip────> skipped
```

`resolved` is the only terminal status that unlocks descent into children. `deferred`
and `skipped` are dormant — `selectNextQuestion` does not descend past them.
`isComplete` treats all three terminal states equivalently.

## Serialized Output

`renderGrillFindings` produces:

```
- [PENDING] functionality/functionality-1: What are the core user-facing behaviors...
  - [RESOLVED] dependency/dependency-1: Which existing modules must this coordinate with?
    Answer: <userAnswer text>
    - [PENDING] dependency/dependency-1-ref-1: How does this relate to "Tier"?
```

Indentation is two spaces per depth level. Status is upper-cased. `Answer:` lines
appear only when `userAnswer` is non-empty.
