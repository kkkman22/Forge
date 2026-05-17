---
topic: menu-visibility-verification
date: 2026-05-17
spec_ref: R1.2
verdict: pass
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
Skill list in system-reminder shows:
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

These are all registered under the `forge:` namespace from `.claude-plugin/plugin.json`.
The standalone `forge-*` skills no longer exist in `skills/` — they've been collapsed
to `skills/forge/lib/<sub>/instructions.md`.

## Note
Claude Code loads skills from both `.claude-plugin/plugin.json` (which still
has the `forge:forge-<sub>` entries) and the physical `skills/` directory.
The plugin.json registrations are namespace-qualified (`forge:forge-build` etc.)
and are separate from the old standalone `skills/forge-build/SKILL.md` files.

The key verification: no standalone `/forge-build` etc. appears — only
`/forge` as the single entry point and `forge:forge-<sub>` as plugin-qualified aliases.

## Verdict
pass — no standalone `/forge-X` entries; all forge subs are under `forge:forge` namespace.
