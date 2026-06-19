---
name: worktree-base-origin-main
track: knowledge
problem_type: convention
component: worktree-git-workflow
confidence: 0.8
created: 2026-06-19
updated: 2026-06-19
changelog:
  - date: 2026-06-19
    action: created
    summary: ponytail-adoption 分支缺 PR108 导致 chrome 启动，根因为 worktree base 用本地 main 而非 origin/main
---

## Context

创建 git worktree 做功能开发时，`git worktree add .worktrees/<topic> -b feat/<topic> main` 以**本地 `main`** 为 base。但本地 main 可能落后远端——若期间有重要修复（如 PR #108 "stop ui-harness tests from launching real browsers"）合并到 `origin/main`，新分支会缺失该修复，导致开发/验证时遇到已解决的问题重现。

## Guidance

创建 worktree 前必须先同步远端，并以 `origin/main`（而非本地 `main`）为 base：

```bash
git fetch origin main
git worktree add .worktrees/<topic> -b feat/<topic> origin/main
```

或在已有分支上补救：

```bash
git fetch origin main
git rebase origin/main   # 或 reset --hard origin/main 后 cherry-pick feature commits
```

**判定**：建分支前后，若发现"远端已合并的修复在本分支不生效"，第一步查 `git log origin/main..<branch>` 是否缺该 merge commit，而非怀疑修复本身无效。

## Why This Matters

- 本地 `main` 是缓存，可能数小时甚至数天未更新；`origin/main` 是真相。
- 以过期 base 建分支会让分支继承所有已修复的 bug，验证时产生"已解决的问题重现"的假象，浪费排查时间。
- 本案例：PR #108 修复了 ui-harness 测试启动真实 chrome，但分支缺该 commit，开发时大量 chrome 进程启动，一度误以为是新功能引入的回归。

## When to Apply

- 任何 `git worktree add` 或 `git checkout -b` 以 main 为 base 时。
- 多人协作、main 频繁合并 PR 的项目。
- 长时间未同步本地 main 后恢复开发时。

## Examples

### 本案例时间线

1. 本地 `main` 停在 `1c76b514`（PR #108 合并前）。
2. `git worktree add ... main` 创建 ponytail-adoption 分支，base = `1c76b514`。
3. PR #108（`d0d033ce`）合并到 `origin/main`。
4. 分支开发时 ui-harness 测试启动大量 chrome（PR #108 修复缺失）。
5. 排查：`git log origin/main` 有 `d0d033ce`，`git log <branch>` 无 → 确认 base 缺失。
6. 修复：`reset --hard origin/main` + `cherry-pick` feature commits。

### 相关：已有的 worktree 沉淀

`ccbp-phase2-worktree-gitignore.md` 覆盖 worktree 中 `.claude/` 的 `git add -f` 跟踪问题；本条覆盖 worktree **base 时序**问题，两者正交，共同构成 worktree 工作流的两类核心陷阱。
