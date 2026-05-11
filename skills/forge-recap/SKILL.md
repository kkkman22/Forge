---
name: forge-recap
description: "Capture git history, sessions, and runs into a time-window categorized summary. Use when running /forge recap to review recent activity."
context: fork
skeleton_exempt_legacy: true
disable-model-invocation: true
---

# /forge recap — Time-Window Recap

> **Trigger**: `/forge recap [--since 1d|7d|YYYY-MM-DD..YYYY-MM-DD]`
> **Output**: stdout summary + optional `.forge/recap-<window>.md`

## 1. 概述

Produce a categorized recap of recent project activity over a configurable time window, covering commits, sessions, and task progress.

## Goal

## Data Sources

Your recap must aggregate across these sources. Approach is yours; all three must be represented:

| Source | Data |
|--------|------|
| `git log --since` | Commits, files changed, authors |
| `.forge/knowledge/sessions/` | Session metadata |
| `.forge/progress/` | Task completion status |

## Constraints

- **Categorization [R9.3]**: Every commit and task must be classified into one of: feature, bugfix, refactor, infra, docs, uncategorized. Use keywords in commit messages or task names; fallback to `uncategorized`.
- **Staleness detection [R9.4]**: Must scan `evolved-rules.md` for rules stale beyond 5 `Session_Boundary` entries and report them for cleanup.
- **Graceful degradation [R9.5]**: Missing git email → stderr warning + continue. Missing sessions or progress data → skip that section silently.
- **Idempotency [R13.6]**: For fixed input, running the same time window twice must produce identical output except for the `decided_at` timestamp.
- **No activity**: When the time window has no activity, explicitly report that fact rather than producing empty output.

## References

→ references/data-sources.md, references/category-heuristics.md

## Gotchas
- **Information overload**: Include every commit message → recap too long to be useful → categorize and summarize, don't list everything
- **Missing context**: Recap shows what changed but not why → reader can't assess impact → include issue/spec references
- **Stale time window**: Recap covers period with no activity → empty output → detect and report "no activity in window"
