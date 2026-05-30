---
topic: forge-init-env-optimization
date: "2026-05-30"
result: pass
reviewed_at_commit: acafc139
p0_count: 0
p1_count: 0
p2_count: 4
p3_count: 3
methodology: subagent-parallel
layers: [quality-check, security-check]
spec_layer: skipped (light tier)
---

# Review: forge-init-env-optimization

## L2 — Code Quality (P0:0 P1:0 P2:3 P3:3)

| ID | Severity | File:Line | Issue |
|----|----------|-----------|-------|
| Q1 | P2 | `scripts/init.sh:720-750` | Code duplication: env-vars node inline script duplicates MCP section pattern (lines 670-690) |
| Q2 | P2 | `scripts/init.sh` | No test coverage for init.sh in the entire repo |
| Q3 | P2 | `scripts/init.sh:750` | `|| true` silently swallows node failures; raw stack trace shown to users |
| Q4 | P3 | `scripts/init.sh:754-755` | Three node processes spawned for one logical operation (wasteful) |
| Q5 | P3 | `scripts/init.sh:722` | Shell variable interpolated into node -e without escaping |
| Q6 | P3 | `scripts/init.sh:893` | Minor emoji style inconsistency in summary table |

## L3 — Security & Risk (P0:0 P1:0 P2:1 P3:0)

| ID | Severity | File:Line | Issue |
|----|----------|-----------|-------|
| S1 | P2 | `scripts/init.sh:722` | `settings_file` from `$(pwd)` interpolated into `node -e` JS string without escaping — pre-existing pattern replicated |

## Verdict

**✅ PASS** — No P0/P1 findings. 4 P2 + 3 P3 advisory items. Ship not blocked.

Key cross-validation: Q5 (quality) and S1 (security) identify the same root cause (shell-to-node string interpolation). Deduped as single concern.
