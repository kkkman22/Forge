---
topic: code-slim-0612
scope: "P2+P3 (T4 docs-governance deletions + T6 mcp execCommand merge) — unreviewed since 8529b468"
date: 2026-06-13
result: pass
reviewed_at_commit: ebb1fc8f
commits_in_scope: [f31419fa, 2348d299]
methodology: subagent-parallel
layers: [spec-check, quality-check, security-check, adversarial-check]
severity_counts: { p0: 0, p1: 0, p2: 0, p3: 1 }
p3_advisory_out_of_scope: true
---

# Review — code-slim-0612 P2+P3 (package-scoped)

> Reviewer scope: T4 (f31419fa, removed 3 dead docs-governance modules) + T6 (2348d299, execCommand two-branch merge). P1 (T1/T2) was already reviewed at 8529b468.

## Verdict: ✅ PASS — P0:0 P1:0 P2:0 P3:1 (advisory, out-of-scope)

## Layer Summaries

- **L1 spec-check (PASS)**: REQ-4/AC-4.1 — 3 deleted modules had zero production callers (grep src/ + scripts/), root-whitelist.ts correctly KEPT. REQ-6/AC-6.1 — registerForgeExec, "forge_exec" tool name, command/timeout zod schema byte-unchanged. INV-1 intact, no scope creep, tests deleted alongside their dead SUTs (not weakened).
- **L2 quality-check (PASS)**: splitSimpleCommand output byte-identical to old inlined simple-branch logic; merged form mirrors execCommandTracked spawnTarget pattern; duplication eliminated (~27 lines net reduction); no slop; test coverage adequate; error/timeout handling preserved.
- **L3 security-check (PASS)**: Injection surface preserved (simple→execFile no-shell, complex→/bin/sh -c routing unchanged); command construction INV-2 identical; defense-in-depth functions (isCommandAllowed/isCommandDenied/containsShellMetachars) untouched & still invoked upstream; T4 deletions had no security logic; no new exec/spawn.
- **L4 adversarial (PASS)**: Could not break the merge — tested empty/whitespace/single-token/multi-space/tab/newline inputs, all route identically to old two-branch code. adversarial-mcp-boundaries.test.ts unaffected (only imports isCommandAllowed, untouched).

## P3 Advisory (out-of-scope, NOT a T6 regression)

[P3|low] R-001: src/mcp/tools/forge-git.ts:197,214,231 — user-controlled `args` (z.string().optional()) is interpolated into commands passed to execCommand; forge_git does not invoke isCommandAllowed/containsShellMetachars on its interpolated commands (unlike forge_exec). Pre-existing, identical in pre-T6 code, not introduced by this diff. Follow-up, not a blocker.

## Evidence
- Full subagent outputs: 4 independent reviewers (spec/quality/security/adversarial), all status=pass.
- Verification gate already green at build: npm run check exit 0 (7406 tests, public-api, dist-sync 293).
