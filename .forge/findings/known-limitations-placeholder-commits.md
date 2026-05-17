---
kind: known-limitation
discovered_at: 2026-05-17
discovered_by: forge-review-diff-context-fidelity Stage 2 task 7.5 commit chain analysis
applicable_to:
  - all branches across the repo (65+ commits in history at discovery time)
status: documented-pending-spec
suggested_followup_spec: commit-message-hygiene
severity: P2 (cosmetic; does not affect code correctness, but pollutes history readability and breaks atomic-commit discipline per AGENTS.md §2.3)
---

# Known Limitation: Placeholder Commits with `<type>([optional scope]): <description>` Message

## Summary

Repo git history contains numerous commits whose message is the literal git
commit-template placeholder text:

```
<type>([optional scope]): <description>

[optional body]

[optional footer(s)]
```

These commits ship real content (typically `.forge/reviews/`, `.forge/runs/`,
and occasionally hook-config / agent-definition changes) but provide zero
human-readable context about what was changed or why. They violate AGENTS.md
§2.3 "atomic commit" discipline by bundling unrelated changes under
unintelligible messages.

## Scope (as of 2026-05-17)

| Metric | Count |
|---|---:|
| Placeholder commits across all branches | **65** |
| Branches affected | main, fix/local-ci-parity-followups, worktree-subagent-hook-context-budget, etc. |
| Recent occurrences (within 24h of discovery) | 8+ |
| All authored by | `Gruby.Wang <gruby.wang@shijigroup.com>` |
| Commit timestamps | Spread across days, including bursts during `/forge review` sessions |

## Root Cause Confirmed

Local git config:

```
$ git config --get commit.template
/Users/king/.stCommitMsg

$ cat ~/.stCommitMsg
<type>([optional scope]): <description>

[optional body]

[optional footer(s)]
```

`~/.stCommitMsg` is **SourceTree's** (Atlassian git GUI) commit-message
template file. SourceTree:

1. Auto-generates this template on first run if user picks the
   "Conventional Commits" template option.
2. Pre-fills the commit message UI box with this template content.
3. **Does NOT validate** whether the user has replaced the placeholder
   with a real message before allowing commit.

When user clicks "Commit" in SourceTree without editing the message text,
the literal template content becomes the commit message.

## Evidence

**Reflog inspection** (sample for commit `0bb0b6a`):

```
0bb0b6a refs/heads/main@{18}: commit: <type>([optional scope]): <description>
0bb0b6a HEAD@{25}: commit: <type>([optional scope]): <description>
```

Reflog action is plain `commit:` (not `commit (amend)`, `merge`, `rebase`, or
`reset`), confirming a direct user-initiated `git commit` invocation — not
an automated tool action.

**Forge orchestrator commits ARE clean**: `src/git-transaction.ts:275`
`buildCommitCommand(message)` always passes `git commit -m "<message>"`,
producing real messages. So Forge's `effect-executor.ts` is NOT the source.

**No git hooks installed**: `.git/hooks/` directory does not exist; no
pre-commit / commit-msg / post-commit hooks intercept these commits.

**No script in repo runs `git commit` without `-m`**: grep across
`scripts/` and `hooks/` finds only documentation (`scripts/dist-resync.sh`
shows users a manual command in echo output) — no runtime invocations.

**File pattern in placeholder commits**: Always `.forge/reviews/.diff-context.md`
and/or `.forge/runs/*-events.jsonl`, occasionally agent-definition or
hook-config changes mixed in. This pattern matches the file set typically
modified during a `/forge review` session — suggesting user commits
post-review state via SourceTree without writing a message.

## Operational Impact

- **History readability**: 65 commits × ~120 chars wasted = ~8 KB of
  meaningless commit-log noise per `git log --oneline` invocation.
- **`/forge review` atomic-commit reasoning**: Spec workflow (AGENTS.md §2.3)
  expects each task to map to one atomic commit. Placeholder commits
  bundle multiple task-7.5-style changes under indecipherable messages,
  forcing followup `git rebase -i` rewrites (this happened in
  `forge-review-diff-context-fidelity` Stage 2 task 7.5 commits
  `0715212` + `4401354`).
- **Bisect difficulty**: `git bisect` users face commit messages that
  reveal nothing about what changed; must read full diff for every step.
- **Code review cost**: PR/commit review is much slower when the commit
  message offers no hint about intent.

## Why It's Not Fixed Yet

This bug exists outside the scope of any prior spec. The 5-spec chain
(subagent-hook-context-budget → result-truncation → foreground-truncation →
diff-context-fidelity) all focused on review pipeline correctness. The
placeholder-commit issue is **git workflow hygiene** at the user-tool
boundary (SourceTree), not at the Forge pipeline layer.

## Suggested Followup Spec

Spec name: **`commit-message-hygiene`**

Bug Condition: any commit landing on a Forge-managed branch with message
matching the placeholder pattern.

Candidate fix directions (for design phase):

1. **Pre-commit hook in `.git/hooks/commit-msg`**: reject commits whose
   message matches `^<type>\(\[optional scope\]\): <description>$` regex.
   Pro: zero user-facing change. Con: `.git/hooks/` not under version
   control (would need a setup script + onboarding doc).
2. **Git template change**: replace `~/.stCommitMsg` with empty file or
   a more aggressive template that triggers SourceTree's "empty message"
   warning. Con: user-environment change outside repo control.
3. **CI check** in `.github/workflows/` (or equivalent): reject PRs whose
   commit log contains placeholder commits. Pro: enforced at PR boundary.
   Con: doesn't help direct-push branches.
4. **Combination**: hook (immediate) + CI (defense in depth) + onboarding
   doc explaining SourceTree commit-message workflow.
5. **Cleanup of historical placeholders**: requires force-push and
   coordination across collaborators. **High risk**, recommend deferring
   until prevention is in place.

## Cross-References

- The rebase that surfaced this issue:
  - `forge-review-diff-context-fidelity` Stage 2 Task 7.5 finding
  - Commits `0715212` + `4401354` were squashed via `git rebase -i bfd5d0a`
    + `git push --force-with-lease origin main` on 2026-05-17 ~10:11 local.
  - Backup branch `backup-before-rewrite-stage2` was used and deleted
    after successful rebase.
- AGENTS.md §2.3 Verification Iron Law (atomic commit discipline)
- AGENTS.md `<git_safety>` section (history rewrite rules)
- This finding is informational only; NO code changes proposed in the
  spec it was discovered under.

## Decision Trigger

Open `commit-message-hygiene` spec when:

- Any new commit pollutes git history with placeholder message, OR
- A `git rebase -i` becomes necessary for a third atomic-commit task
  (signal the issue is recurring), OR
- A collaborator complains about commit log quality.

Until then, this finding sits as documentation. Re-run the discovery query
to refresh the count:

```bash
git log --all --oneline | grep -c '<type>(\[optional scope\]): <description>'
```
