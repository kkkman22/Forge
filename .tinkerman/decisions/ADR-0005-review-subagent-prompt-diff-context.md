---
id: "ADR-0005"
title: "Review subagent prompt must include diff-context path and turn budget discipline"
status: accepted
date: "2026-05-18"
deciders:
  - "@king"
related_adrs:
  - "2026-05-18-review-fallback-ladder" # fallback ladder consumes review results
  - "ADR-0004" # skills collapse dispatcher
---

# ADR-0005: Review subagent prompt must include diff-context path and turn budget discipline

## Context

`/forge review` orchestrator (`src/review.ts buildReviewSubagents()`) generated subagent prompts containing only a changed-file list (`Changed files: src/a.ts, src/b.ts, ...`). The SKILL §2.0 contract requires the `.tinkerman/reviews/.diff-context.md` path be passed so subagents read unified diff hunks directly.

Without the diff-context reference, subagents chose the file-list path: 27 tool_use blocks (Read/Grep) consumed all 10 turns before producing FINDINGS. All three subagents (spec-check, quality-check, security-check) completed with `status=completed` but zero text output — the last block was always `tool_use`. The fallback ladder (L0→L1→L2→L3) couldn't extract findings, blocking ship at L3.

This was an upstream code-SKILL misalignment: the SKILL documented the correct contract but the code never implemented it.

## Decision

1. `buildReviewSubagents()` now generates a 5-line preamble for spec-check/quality-check/security-check prompts containing:
   - `.tinkerman/reviews/.diff-context.md` literal path
   - Turn Budget Discipline protocol
   - Hard constraint: final turn must be text (FINDINGS), not tool_use
   - Low-budget escape: ≤2 turns remaining → output partial FINDINGS immediately
   - Insufficient-evidence rule: omit finding rather than spend turns investigating

2. frontend-check prompt is excluded (Tier A static grep needs exact `.vue` filenames, not diff hunks).

3. No interface changes (`ReviewSubagentContext` signature unchanged), no pipeline changes (diff-context file generation unchanged), no SKILL document changes.

## Consequences

### Positive

- Subagents read unified diff in 1-2 turns instead of 20+ individual Read/Grep calls
- FINDINGS text block always produced before turn exhaustion
- Fallback ladder L0 succeeds — no more L3 blocked ship
- ~50-80 extra tokens in prompt preamble trades for a constraint independent of SKILL loading completeness

### Negative

- Prompt preamble adds ~60 tokens per subagent invocation (3 subagents × 60 = 180 tokens total)
- If diff-context file is missing or empty, subagents may still need individual reads (but the preamble at least forces FINDINGS output regardless)
