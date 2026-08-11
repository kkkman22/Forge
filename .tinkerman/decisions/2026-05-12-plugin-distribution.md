---
date: "2026-05-12"
deciders: ["Forge maintainer"]
status: "accepted"
---

# ADR: Plugin Distribution

## Context

Forge had two installation methods (clone + dist package), both bypassing Claude Code's native plugin system. CC Plugin system (available since CC 2.0.12) offers automatic updates, version pinning, manifest validation, and enterprise governance.

## Decision

Adopt CC Plugin distribution as the recommended installation method, while preserving clone (for Forge Loop developers) and dist package (for air-gapped deployments).

### Phase A Outcome

Feasibility report at `.kiro/specs/plugin-distribution/feasibility.md`:

- 89 assets inventoried: 56 compatible as-is, 12 need path adaptation, 1 needs refactor (hooks), 20 excluded
- 6 spec design deviations identified vs actual CC Plugin API (manifest location, hooks format, etc.)
- Plugin install UX: 2 steps / 30s vs 3-4 steps / 1-5min for existing methods
- Decision: **conditional-go** — no blockers, refactor cost ~6-9 hours

### Phase B Implementation

1. `.claude-plugin/plugin.json` — inline hooks with `${CLAUDE_PLUGIN_ROOT}`, skills/agents auto-discovered
2. `.claude-plugin/marketplace.json` — single plugin entry, self-hosted
3. `commands/*.md` — 28 slash command wrappers generated from skill frontmatter (historical: count at time of writing was 28; current SST=22)
4. `scripts/gen-plugin-commands.mjs` — auto-generation, CI-integrated
5. `test/plugin-manifest.test.ts` — 12 contract tests
6. CI `plugin-validate` job — manifest validation + version sync
7. Conflict detection in `/forge status`
8. Documentation: README (3 methods + migration guide), CHANGELOG, SECURITY, CONTRIBUTING

## Consequences

- **Positive**: New users install in 30s with auto-updates; enterprise governance via `blockedMarketplaces`
- **Positive**: Skills/agents structure unchanged — no migration for existing users
- **Negative**: Dual maintenance of hooks (original `hooks/hooks.json` for clone, inline in `plugin.json` for plugin)
- **Negative**: Plugin does not include Forge Loop — users needing Loop must use clone

## Alternatives Considered

1. **Plugin-only**: Drop clone/dist — rejected: Forge Loop users and enterprise air-gap need alternatives
2. **Wait for CC Plugin maturity**: Delay adoption — rejected: API already stable, 6 months post-launch
3. **Custom marketplace**: Self-hosted registry — rejected: GitHub repo as marketplace is sufficient

## Timeline

- Current_Dist_Script EOL: 12 months post plugin GA (2027-05)
- Clone install: indefinite (needed for Forge Loop)
- MCP bundle: deferred to future spec (Task 13 skipped)

## Update 2026-05-16

The "Phase B Component 3: commands/*.md — (historical: 28 slash command wrappers replaced by single-entry model in ADR-0003)" decision is partially superseded by ADR-0003. The original design prioritized "plugin completeness" (all tools visible via `/`), but 6 months of use showed 27 wrappers conflicting with SKILL orchestration conventions (`disable-model-invocation`, auto-advance). This update reclaims the single-entry model.

New decision: `.tinkerman/decisions/ADR-0003-single-entry-command-consolidation.md`

Historical SST count (28 commands) preserved with `(historical: ...)` annotation in CHANGELOG for `--verify-count` compatibility.
