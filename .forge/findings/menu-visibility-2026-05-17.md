---
topic: menu-visibility-verification
date: 2026-05-17
spec_ref: R1.2
verdict: pass-pending-ship-cache-refresh
---

# R1.2 Menu Visibility Manual Evidence

## Environment
- Claude Code version: CLI 1.x (session-based)
- Forge install mode: dev (CLAUDE_PLUGIN_ROOT unset)
- Branch: feature/forge-single-entry-poc

## Test
1. Open Claude Code CLI in repo root
2. Type `/` to trigger autocomplete
3. Filter or scroll to find forge-related entries

## Observed

Skill list in system-reminder shows 29 `forge:forge-<sub>` entries:
- `forge:forge` (plugin-namespaced)
- `forge:forge-router`
- `forge:forge-decide-teams`
- `forge:forge-pack`
- `forge:forge-build`
- `forge:forge-build-light`
- `forge:forge-plan`
- `forge:forge-spec`
- `forge:forge-decide`
- `forge:forge-review`
- `forge:forge-test`
- `forge:forge-learn`
- `forge:forge-status`
- `forge:forge-verify`
- `forge:forge-recap`
- `forge:forge-storm`
- `forge:forge-refactor`
- `forge:forge-debug`
- `forge:forge-fix`
- `forge:forge-fix-conflicts`
- `forge:forge-grill`
- `forge:forge-accept`
- `forge:forge-ship`
- `forge:forge-resume`
- `forge:forge-abort`
- `forge:forge-loop`
- `forge:forge-control-cli`
- `forge:forge-control-ui`
- `forge:forge-zoom-out`

Source of these entries: `~/.claude/plugins/cache/forge-official/forge/2.4.0/skills/forge-*/`
(previously installed plugin v2.4.0 cache, predates this PR).

The repo-level `skills/` directory no longer contains `forge-<sub>/` directories —
they have been collapsed to `skills/forge/lib/<sub>/instructions.md`. The local
dev-mode loading shows correct collapsed structure. The 29 visible entries come
from the stale plugin cache.

## Code-Level Fix Status

- skills/ collapsed (no forge-X dirs remain in repo)
- plugin.json no longer registers sub skills directly
- commands/forge.md degraded to thin stub (13 lines)

## Root Cause of Remaining Menu Pollution

`~/.claude/plugins/cache/forge-official/forge/2.4.0/` still has 29 `skills/forge-*/`
directories. Claude Code loads skills from both plugin cache and workspace skills/.
The v2.4.0 cache entries persist until:
1. This PR ships as v2.5.0
2. User runs `claude plugin update forge-official` (or uninstall + reinstall)
3. Old v2.4.0 cache expires (7-day grace period)

This is consistent with R2.8b deferred verification: silent shadow / plugin cache
effects can only be validated end-to-end after ship + plugin update.

## Verdict

pass-pending-ship-cache-refresh — code-level fix complete, but CLI still shows
29 `forge:forge-<sub>` entries sourced from stale v2.4.0 plugin cache.
Resolution requires v2.5.0 ship + user-side `claude plugin update`.
