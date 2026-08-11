---
updated: 2026-08-11
---
# Branch Gate — 详细规范

> 从 `../instructions.md §2.1` 拆分。SKILL 主文件只保留一行摘要指针。

## Branch State Table

`git branch --show-current` → read `current_task` from `.tinkerman/status.md` → `checkBranchTopicGate`. Auto-switch requires clean working tree.

| Branch State | Action |
|---|---|
| On matching `feature/<topic>` | ✅ Pass |
| Other, branch exists, clean tree | `git checkout` |
| Other, branch missing, clean tree | `git checkout -b` |
| Not on `feature/<topic>` or `forge/<topic>` | → Isolation Recommendation (below) |
| `feature/<topic>` mismatch (different topic) | 🚫 Block |

## Isolation Recommendation

When Branch Gate detects the developer is not on a matching branch, use Claude Code's built-in `EnterWorktree` tool or `git checkout -b`:

```
inputs:
  dirtyTree:       `git status --porcelain` non-empty
  tier:            from .tinkerman/status.md routing tier
```

Present `AskUserQuestion` with:
- **Option 1 (Recommended)**: Create isolated worktree via `EnterWorktree` — with reason
- **Option 2**: `git checkout -b feature/<topic>`

Selected option → execute corresponding action:
- `worktree` → call `EnterWorktree` tool with appropriate name
- `feature` → `git checkout -b feature/<topic>`
- `stash-feature` → `git stash` → `git checkout -b feature/<topic>`

Function references:
- `checkBranchTopicGate` from `src/branch-gate.ts`
- `detectUnshippedBranches` from `src/branch-gate.ts`

## Unshipped Branch Warning

`detectUnshippedBranches`. Non-empty → warn with three options:

- Ship now
- Continue
- Switch

## Pre-commit Check

Topic gate enforced via `checkBranchTopicGate` at build startup.

## Lightweight Path

Skip pre-build checks #1 (Spec Gate) and #2 (Plan Gate), but require #3 (Dir Integrity) and #4 (Branch Gate).
