---
name: forge-recap
description: "Capture git history, sessions, and runs into a time-window categorized summary. Use when running /forge recap to review recent activity."
skeleton_exempt_legacy: true
disable-model-invocation: true
---

# /forge recap — Time-Window Recap

> **Trigger**: `/forge recap [--since 1d|7d|YYYY-MM-DD..YYYY-MM-DD]`
> **Output**: stdout summary + optional `.forge/recap-<window>.md`

## 1. Overview

Aggregates 3 data sources over a time window to produce a categorized recap:

| Source | Data |
|--------|------|
| `git log --since` | Commits, files changed, authors |
| `.forge/knowledge/sessions/` | Session metadata |
| `.forge/progress/` | Task completion status |

## 2. Category Heuristics [R9.3]

Categories: feature, bugfix, refactor, infra, docs, uncategorized

Keywords in commit messages or task names drive classification. Fallback: `uncategorized`.

## 3. Staleness Detection [R9.4]

Scans `evolved-rules.md` for rules stale > 5 `Session_Boundary` entries. Reports stale rules for cleanup.

## 4. Graceful Degradation [R9.5]

- Missing git email → stderr warning + continue
- Missing sessions → skip section
- Missing progress → skip section

## 5. Idempotency [R13.6]

For fixed fixture input, consecutive `runRecap("7d")` calls produce identical output (excluding `decided_at` timestamp).

→ Details: references/data-sources.md, references/category-heuristics.md
