---
topic: claude-2-1-163-infra-hardening
date: 2026-06-05
result: pass-with-fixes
reviewed_at_commit: c40a9d89e672f1211d2ad67545d8b4da8dd5a0d3
p0_count: 0
p1_count: 3
p2_count: 7
p3_count: 5
methodology: subagent-parallel
layers: [spec-check, quality-check, security-check]
---

# Review: Claude Code 2.1.163 Infrastructure Hardening

## Summary

Three-layer parallel review of 186 files (+8882/-827 lines). 3 P1 issues found and fixed in commits `c40a9d89` and `92c06c55`. All tests pass (7115 passed). No P0 issues. Ship cleared.

## P1 Issues (Fixed)

| ID | Issue | Fix Commit |
|----|-------|------------|
| R-001 | `checkVerificationEvidence()` hardcoded `return false` | `c40a9d89` — real heuristic using git log + progress mtime |
| R-002 | Event name mismatch: `SubagentStop` vs `StopFailure` | `c40a9d89` — accepts both event names |
| R-003 | Tautological test assertions `>= 0` | `c40a9d89` — meaningful cleanup verification |

## P2 Issues (Advisory)

1. Advisory upper bound not wired (`FORGE_VERSION_RANGE.maximum` undefined)
2. MCP server session id recording not implemented (Req 4.3)
3. cmux mirror dedup on resume not implemented (Req 4.7)
4. No `/forge learn` knowledge entry yet (Req 7.4 — post-ship)
5. Empty `catch {}` blocks in forge-exec.ts silently swallow errors
6. Complex boolean in path-equivalence.ts:86
7. JSON via string concatenation in forge-doctor shell script

## Spec Coverage: 47/56 criteria covered (84%), all hard gates met.
