---
kind: known-limitation
discovered_at: 2026-05-17
discovered_by: subagent-foreground-truncation Stage 4
applicable_to:
  - .claude/agents/spec-check.md
  - .claude/agents/quality-check.md
  - .claude/agents/security-check.md
status: accepted
mitigation: prompt-resistant
---

# Known Limitation: LLM Preamble Before Layer Heading

## Summary

Review subagents (`spec-check` / `quality-check` / `security-check`) tend to
emit a narrative preamble ("Now let me analyze...", "Based on my analysis...",
"Let me check...") **before** the `## Layer N` heading mandated by their
Final Report Block contract.

This violates the prompt contract literal text but does not prevent the
structured Layer report from being generated afterwards.

## Evidence

`subagent-foreground-truncation` Stage 4 Real Smoke (commit `37b329a`,
2026-05-17):

| Subagent | Preamble | Report after preamble |
|---|---|---|
| spec-check | "Now let me analyze this change as the spec-check reviewer:" | ✅ Layer 1 complete |
| quality-check | "The diff context doesn't contain the full patch. Let me use git..." | ❌ truncated (separate orchestrator bug — see `forge-review-diff-context-fidelity`) |
| security-check | "Based on my analysis of the diff context and the current file state..." | ✅ Layer 3 complete |

## Why prompt-resistant

The Final Report Block contract in each agent definition explicitly forbids
preamble:

```
最后一 turn 的 assistant text block **必须**以 `## Layer N` 起头，按上方
Output Format 表格输出，禁止以 preamble（`Now let me...` / `I need to...` /
`Let me check...`）起头。
```

Despite the explicit prohibition with concrete forbidden patterns, the LLM
still emits preamble. This is a model-level behavior — the LLM's
helpfulness training causes narration before structured output.

Attempts that have been or would be tried:

| Mitigation | Status |
|---|---|
| Explicit forbidden-pattern list in prompt | Tried in `Final Report Block` segment — model ignores |
| Stricter IRON-LAW framing | Tried (Turn Budget Discipline marks it as IRON-LAW) — model still emits |
| Reasoning-mode features | Out of scope (would require model upgrade) |
| Framework-level transcript scanning + strip preamble | Out of scope (`src/subagent-runner.ts` not modified per spec preservation rules) |

## Operational Impact

- **Severity**: P3 advisory.
- **Does not block report generation**: Layer report follows the preamble.
- **Does not affect downstream pipeline**: `mergeReviewResults` parses
  structured findings by JSON shape, ignoring narrative text.
- **Cosmetic**: Affects readability of raw subagent output in `.forge/reviews/`
  files but does not corrupt severity counts, Issue List, or Scope Creep
  fields.

## Acceptance

This limitation is **accepted as-is**. No further specs or tasks are opened
to address it. If a future Claude Code release introduces:

- A prompt-level switch to suppress narrative preamble, OR
- A framework hook to scan and strip preamble before result is captured, OR
- Reasoning-mode access for review subagents,

then this limitation should be revisited and potentially closed.

## Cross-References

- `subagent-foreground-truncation` Stage 4 finding: `subagent-foreground-truncation-stage4.md`
- Final Report Block contract (the rule that's being violated):
  `agents/{spec,quality,security}-check.md` — `## Final Report Block` section
- Turn Budget Discipline IRON-LAW framing:
  `agents/{spec,quality,security}-check.md` — `## Turn Budget Discipline` section
