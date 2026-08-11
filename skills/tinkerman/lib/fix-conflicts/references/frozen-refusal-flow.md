---
updated: 2026-08-11
---
# Frozen Refusal Flow Reference

## Three Options [R7.3, R7.4, R7.5]

### Option 1: Manual Resolve

Keep worktree/index state. User manually edits conflicted file. Best for spec/plan conflicts that need human judgment.

### Option 2: Unlock Then Merge

1. Change file status from `locked`/`approved` to `draft`
2. Write `.forge/debug/unlock-<timestamp>.md` audit log
3. Perform three-way merge
4. After merge, user must re-lock/approve

### Option 3: Abort Merge

Execute `git merge --abort` or `git rebase --abort`. Best when frozen conflict is too complex.

## Validation After Merge [R7.11]

Run `npm run check` (or `ci_check_command` from config). Three consecutive failures trigger `/tinkerman debug`.
