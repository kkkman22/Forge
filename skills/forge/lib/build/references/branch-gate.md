# Branch Gate — 详细规范

> 从 `skills/forge/lib//instructions.md §2.1` 拆分。SKILL 主文件只保留一行摘要指针。

## Branch State Table

`git branch --show-current` → read `current_task` from `.forge/status.md` → `checkBranchTopicGate`. Auto-switch requires clean working tree.

| Branch State | Action |
|---|---|
| On matching `feature/<topic>` | ✅ Pass |
| Other, branch exists, clean tree | `git checkout` |
| Other, branch missing, clean tree | `git checkout -b` |
| Not on `feature/<topic>` or `forge/<topic>` | → Isolation Recommendation (below) |
| `feature/<topic>` mismatch (different topic) | 🚫 Block |

## Isolation Recommendation

When Branch Gate detects the developer is not on a matching branch, call
`recommendIsolationStrategy` with current context:

```
inputs:
  dirtyTree:       `git status --porcelain` non-empty
  activeWorktrees: countActiveWorktrees(`git worktree list --porcelain`)
  tier:            from .forge/status.md routing tier
  maxConcurrent:   DEFAULT_MAX_CONCURRENT (3)
```

Present `AskUserQuestion` with:
- **Option 1 (Recommended)**: `result.primary` — with `result.reason`
- **Option 2**: `result.secondary`

Selected option → execute corresponding git command:
- `feature` → `git checkout -b feature/<topic>`
- `worktree` → create worktree via `RunManager.setupWorktree` logic
- `stash-feature` → `git stash` → `git checkout -b feature/<topic>`

Function references:
- `recommendIsolationStrategy` from `src/branch-lifecycle.ts`
- `countActiveWorktrees` from `src/worktree-manager.ts`
- Types: `IsolationContext`, `IsolationRecommendation` from `src/loop-types.ts`

## Unshipped Branch Warning

`detectUnshippedBranches` + `detectStaleBranches`. Non-empty → warn with three options:

- Ship now
- Continue
- Switch

## Pre-commit Check

`checkCommitTopicMatch` per commit.

## Lightweight Path

Skip pre-build checks #1 (Spec Gate) and #2 (Plan Gate), but require #3 (Dir Integrity) and #4 (Branch Gate).
