---
title: "CCBP Hardening Phase 2 — Decide 阶段决策"
date: "2026-05-12"
status: approved
spec: ".kiro/specs/ccbp-hardening-phase2/"
tier: full
phase: decide
---

# CCBP Hardening Phase 2 — 决策记录

## Context

Phase 1 (`ccbp-inspired-hardening`) 完成 skill→agent 迁移、最小 dispatcher、agent-memory 目录。Phase 2 收尾遗留迁移 + 引入 CC 新能力（if: 过滤、PreCompact、agent frontmatter）。

## Three-Perspective Summary

### Product
- MVP: Req 1 (if: 迁移) + Req 2 (compaction 保护) + Req 9 (版本门禁)
- Req 3/4/5/6 primarily maintainer-facing
- Req 5 (worktree) is biggest user risk — dev server confusion
- Missing: no single north-star metric

### Architecture
- Phase 1 readiness: check before Task 0
- if: blind spots if CC pattern matcher has bugs — mitigated by Task 1.8 integration test
- worktree + `.forge/` path coupling risk — `.forge/progress/` must land in main repo
- Dispatcher build from scratch, not extending (Phase 1 dispatcher may not exist)

### Security
- P1: `$ci_cmd` command injection in forge-build Stop hook → **allowlist enforcement required in design**
- forge-ship branch check spoofable via worktree HEAD
- Compaction snapshot gitignored, event logs contain runtime data
- Overall acceptable for security level 1

## Critic Conditions (all accepted)

1. **Confirm Phase 1 merge** before Task 0 starts
2. **ci_cmd allowlist** goes into design (not post-hoc fix) — validate against `npm run check` | `npm test` | `make check` before execution
3. **Phase 2 acceptance checklist** confirmed from tasks.md §10.1 before build

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| ci_cmd execution | Allowlist enforcement | P1 injection risk, must be in design not patch |
| worktree scope | forge-build only | D3: plan reads specs, review is read-only, ship needs main repo git state |
| dispatcher design | Trust settings.json `if:`, no re-filter | D4: CC native faster, double-filter creates inconsistency risk |
| compaction snapshot | Independent file, git-ignored | D1: avoid git diff noise from high-frequency writes |
| scope | All 10 Requirements accepted | Conditional Req 8 provides natural scope brake |
| MVP subset | Req 1+2+9 | User-facing core, but all 10 ship together |

## GO/NO-GO

**GO with conditions** — all conditions met at decide phase.

## Rollback Plan

Per design.md §4 risk map: each Req has independent rollback path. Critical ones:
- Req 1: `git checkout HEAD~ hooks/hooks.json`
- Req 2: delete compact scripts + remove from settings.json
- Req 5: remove `isolation: worktree` from agent frontmatter

## Next Step

→ `/forge spec` (confirm spec) → `/forge plan` (create plan from tasks.md)
