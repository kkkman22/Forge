---
updated: 2026-08-11
---
# Final-Report Contract

> Implemented in `src/review-final-block.ts`.
> Wired into the fallback ladder in `src/review.ts` (`runReviewFallbackLadder`).

## Why this exists

In a 2026-05-23 incident the three review subagents (spec-check / quality-check / security-check) returned with `status: "success"` but their `output` was just an intermediate sentence such as `"Now let me check one of the test files to understand test coverage:"`. The orchestrator (main agent) read the natural-language preamble and concluded "they're still running", then went idle waiting for a follow-up notification that would never arrive.

The root cause was structural, not a prompting bug:

- **Sub-agent side**: middle-of-thought sentences could legitimately end up as the final assistant message when the SDK truncated mid-step or when the model declared completion prematurely.
- **Orchestrator side**: completion detection was implicitly based on parsing the natural-language `result` field instead of a machine-checkable marker.

## The contract

Every review subagent MUST end its output with the sentinel `<!-- review-final -->` on its own line, preceded by:

1. A heading like `## Layer N — <Title>` matching the agent's role:
   - `spec-check` → `Layer 1 — Spec Alignment`
   - `quality-check` → `Layer 2 — Code Quality`
   - `security-check` → `Layer 3 — Security & Risk`
   - `frontend-check` → `Layer 4 — Frontend Check`
2. At least one Markdown table whose header includes a `Severity` column. Empty findings still keep the table header (and may have zero rows or a single explanatory row like `无 issue 发现`).

After the sentinel, only whitespace is allowed.

## How it is enforced

`enforceFinalReportContract(result)` runs on every `SubagentResult`:

- `status !== "success"` → passes through unchanged.
- `status === "success"` and the output passes `validateFinalReportBlock` → unchanged.
- `status === "success"` but the output is malformed → reclassified as `status: "failure"` with `error: "incomplete-report:<reason>"`.

The fallback ladder (`runReviewFallbackLadder`) wraps the executor with this check **and** re-validates the runner's `succeeded` array as defense-in-depth, so the policy holds regardless of whether upstream classification was correct.

## What this means for the orchestrator

The main agent in `/tinkerman review` MUST NOT:

- Parse the natural-language `result` text from the subagent's last message to decide whether the run is "really" done.
- Try to "send a follow-up message" to a subagent because the result text reads like a question or a continuation.

The main agent SHOULD:

- Treat `status: "success"` (post-validation) as the only completion signal.
- If a subagent's contract was violated, let the fallback ladder handle it. L1 (concurrency=1) is the right place to retry; the main agent does not synthesize fallback reports itself (see `<HARD-GATE name="no-mainagent-review">`).

## Failure-signature surface

`incomplete-report:<reason>` errors collapse into a single signature `incomplete-report` in `summarizeFailureSignature`, so the L1 retry log reads cleanly:

```
⚠ L0 subagent dispatch failed (incomplete-report); retrying with concurrency=1...
```

The full reason (`missing-final-block`, `missing-severity-table`, `missing-sentinel`, `wrong-layer`, `sentinel-not-at-end`, `empty-output`) is preserved in the per-failure record for diagnostics.
