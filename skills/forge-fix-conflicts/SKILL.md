---
name: forge-fix-conflicts
description: "Fix merge conflicts using three-zone forge directory classification. Use when git merge or rebase produces conflicts inside the forge config tree."
skeleton_exempt_legacy: true
disable-model-invocation: true
---

# /forge fix-conflicts — Merge Conflict Resolution

> **Trigger**: Git merge/rebase produces conflicts in `.forge/` directory
> **Output**: Resolved conflicts with semantic merge where possible

## 1. Overview

Three-zone merge conflict resolution:
- **Frozen**: Refuse auto-merge, offer 3 options [R7.3]
- **Guarded**: Semantic merge using type-specific strategies [R7.6-R7.9]
- **Open**: Accept any side (prefer ours)
- **Source**: Leave for manual resolution

→ Details: references/zone-classification.md

## 2. Frozen Zone Handling [R7.3, R7.4, R7.5]

When frozen file has conflict, offer 3 options:

| Option | Action |
|--------|--------|
| manual resolve | Keep worktree/index state, indicate manual edit |
| unlock then merge | Change status to `draft` + write unlock log + three-way merge |
| abort merge | `git merge --abort` or `git rebase --abort` |

→ Details: references/frozen-refusal-flow.md

## 3. Guarded Zone Merge Rules

| File Type | Merge Strategy | Reference |
|-----------|---------------|-----------|
| progress/*.md | task_id merge: completed > pending | R7.6 |
| instincts/known-failures | confidence=max, count=sum | R7.7 |
| ADR-*.md | Reassign IDs sequentially | R7.8 |
| reviews/*.md | Append both, sort by (layer, severity) | R7.9 |

→ Details: references/guarded-merge-rules.md

## 4. Validation Gate [R7.11, R7.12]

After merge: run `npm run check` (fallback to `ci_check_command`).

**Three-Strike Rule**:
- Same file changed = new attempt
- Unchanged file re-run = same attempt (no increment)
- 3 consecutive failures → trigger `/forge debug`

## 5. Execution Flow

1. Scan conflicted paths
2. Classify each into zone
3. Frozen → 3-option flow
4. Guarded → semantic merge
5. Open → accept ours
6. Run validation gate
7. Report results

## Constraints

- Frozen files are never auto-modified [R7.3]
- All merge operations are logged with strategy used
- Validation gate uses `npm run check` or `ci_check_command` [R14.11]
