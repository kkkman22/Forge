# Branch Gate — 详细规范

> 从 `skills/forge-build/SKILL.md §2.1` 拆分。SKILL 主文件只保留一行摘要指针。

## Branch State Table

`git branch --show-current` → read `current_task` from `.forge/status.md` → `checkBranchTopicGate`. Auto-switch requires clean working tree.

| Branch State | Action |
|---|---|
| On matching `feature/<topic>` | ✅ Pass |
| Other, branch exists | `git checkout` |
| Other, branch missing | `git checkout -b` |
| `feature/<topic>` mismatch | 🚫 Block |

## Unshipped Branch Warning

`detectUnshippedBranches` + `detectStaleBranches`. Non-empty → warn with three options:

- Ship now
- Continue
- Switch

## Pre-commit Check

`checkCommitTopicMatch` per commit.

## Lightweight Path

Skip pre-build checks #1 (Spec Gate) and #2 (Plan Gate), but require #3 (Dir Integrity) and #4 (Branch Gate).
