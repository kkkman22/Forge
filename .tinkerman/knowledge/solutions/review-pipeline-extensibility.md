---
title: "Review Pipeline Conditional Layer Pattern"
tags: [review, pipeline, conditional-layers, fan-in, subagent]
date: "2026-05-09"
confidence: 0.8
---

## Problem Pattern

Forge review pipeline was fixed at 3 layers (spec/quality/security). Adding new review capabilities (e.g., frontend accessibility checks) required understanding the fan-in architecture and finding the right extension point.

## Solution

`buildReviewSubagents` in `src/review.ts` uses conditional layer activation: detect file types in changed files, push subagent invocations only when relevant. The downstream fan-in (`Promise.allSettled` in subagent-runner) handles any number of concurrent subagents without modification. `mergeReviewResults` validates findings by structure, not layer source — new layers are automatically compatible.

**Key code pattern**:
```typescript
const hasVueFiles = context.changedFiles.some((f) => f.endsWith(".vue"));
if (hasVueFiles) {
  invocations.push({ agentType: "frontend-check", ... });
}
```

## Pitfall Record

1. **Node.js `globSync` API**: No `absolute` option. Use `globSync(pattern, { cwd })` + `resolve(projectRoot, relative)` for absolute paths.
2. **Acceptance scenario parser**: Expects `### Scenario: name` + `Given precondition` (no dash/colon prefix). Natural markdown habits (`- Given: ...`) don't match.
3. **Confidence threshold filtering**: `filterByConfidence` has 0.8 threshold. Test data with 0.7 gets silently filtered — debug by checking the threshold constant.

## Decision Rationale

Acceptance gate first version only parses and counts scenarios without executing them. Rationale: spec explicitly marked this as "REFACTOR — 首版仅解析场景计数". Honest instrumentation beats premature execution wiring.

## Reusable Pattern

**Conditional subagent activation pattern**: When extending a pipeline with optional stages:
1. Detection function checks relevant signals (file types, config flags, project structure)
2. Conditionally push subagent invocations to the shared array
3. Fan-in (`Promise.allSettled`) handles variable count automatically
4. Result merger validates by structure, not by source layer
5. Status tracking dynamically generates `layers_status` from actual subagent types
