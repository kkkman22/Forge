---
feature: "user-task-flow-docs"
status: "draft"
date: "2026-06-08"
workflow_variant: "requirements-first"
kind: "feature"
brownfield: true
---

# Design — user-task-flow-docs

## Overview

Reframe public docs around user task flows while keeping reference docs complete. Use docs governance SSOT for generated command and workflow data.

## Proposed Information Architecture

| Entry | Purpose |
|-------|---------|
| README | Choose a task flow. |
| `docs/quick-start.md` | Minimal install and first task. |
| `docs/flows/fix-bug.md` | Bugfix task flow. |
| `docs/flows/build-feature.md` | Standard feature task flow. |
| `docs/flows/explore-requirement.md` | Full path task flow. |
| `docs/flows/check-ship-readiness.md` | Doctor/status/ship readiness flow. |
| `docs/reference-commands.md` | Full command inventory. |

## Current State

README prominently lists command count and command table. It is accurate but command-first.

## Testing Strategy

- Docs structure test for new flow pages.
- Link checker.
- Bilingual parity checks.
- SSOT embed checks.

## Rollout

1. Add task-flow pages in Chinese.
2. Update README navigation.
3. Add English mirrors.
4. Update docs index.

## Reversibility

Reference docs remain unchanged; README can revert navigation without data migration.
