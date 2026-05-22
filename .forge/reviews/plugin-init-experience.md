---
topic: plugin-init-experience
date: "2026-05-18"
result: pass
reviewed_at_commit: "546aac2d696cb74d8979b78253dd21d6afa89121"
p0_count: 0
p1_count: 0
p2_count: 5
p3_count: 7
methodology: subagent-parallel
layers: [spec-check, quality-check, security-check]
---

# Review: plugin-init-experience

## Summary

P0: 0 | P1: 0 | P2: 5 | P3: 7 — **PASS**

No ship-blocking findings. All 6 requirements implemented. 26 files changed (+534/-19).

## Layer 1 — Spec Alignment

All 6 requirements (R1-R6) covered:
- R1: `/forge init` subcommand exposed in commands/forge.md with 3-fallback routing
- R2: resolveForgeRoot pure function + init.sh CLAUDE_PLUGIN_ROOT detection
- R3: bootstrap-check.mjs SessionStart hook with shouldShowBootstrap
- R4: 14 SKILL instruction files unified to `/forge init`
- R5: README, quick-start, CHANGELOG updated
- R6: Knowledge capture deferred to /forge learn phase

## Layer 2 — Code Quality (P0:0 | P1:0 | P2:3 | P3:4)

| # | Sev | File | Issue |
|---|-----|------|-------|
| 1 | P2 | `src/forge-root-resolver.ts:39-41` | Path regex normalization fragile, only handles single `..` |
| 2 | P2 | `scripts/init.sh:219` | `FORGE_ROOT` reassigned, duplicates line 135 |
| 3 | P2 | `scripts/init.sh:476-488` | Agent file copy loop lacks error counting |
| 4 | P3 | `scripts/bootstrap-check.mjs:39-40` | Empty catch block swallows all exceptions |
| 5 | P3 | `scripts/init.sh:248-250` | sanitize() sed may miss edge cases |
| 6 | P3 | `.claude-plugin/plugin.json:50` | `|| true` silences failures |
| 7 | P3 | `commands/forge.md:38-51` | Diagnostic message not integrated into actual routing |

## Layer 3 — Security (P0:0 | P1:0 | P2:2 | P3:3)

| # | Sev | File | Issue |
|---|-----|------|-------|
| 1 | P2 | `src/forge-root-resolver.ts:41` | Insufficient path normalization, doesn't prevent traversal |
| 2 | P2 | `scripts/bootstrap-check.mjs:13-14` | `env.cwd` concatenated without validation |
| 3 | P3 | `scripts/init.sh:106` | `CLAUDE_PLUGIN_ROOT` not validated as absolute path |
| 4 | P3 | `.claude-plugin/plugin.json:50` | `CLAUDE_PLUGIN_ROOT` not sanitized in command |
| 5 | P3 | `scripts/init.sh:248-253` | Input sanitization misses `*`, `?`, `{`, `}` |

## Gate Decision

P0/P1 = 0 → **Ship not blocked**. P2/P3 advisory findings tracked for future improvement.
