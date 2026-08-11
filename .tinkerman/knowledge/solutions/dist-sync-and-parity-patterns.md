---
created: "2026-06-06"
feature: audit-remediate-p0p1
tags: [ci, dist-sync, allowlist-parity, plugin-dist]
confidence: 0.8
---

# Dist Sync, Allowlist Parity, and Plugin Dist Anti-Drift

## Problem Pattern
Multiple single-source-of-truth drift issues: dist/ out of sync with src/, allowlist.ts out of sync with registry.toml, plugin dist missing hooks/ and .mcp.json.

## Solutions
1. **Dist sync**: `scripts/dist-resync.sh --yes` for full regeneration. `check-dist-sync.mjs` in CI catches drift.
2. **Allowlist parity**: Test reads registry.toml sections, asserts count == ALLOW_LIST length. Future: code-gen from registry.
3. **Plugin dist**: `build-dist.sh` copies hooks/ and .mcp.json to dist-plugin/. Contract test verifies presence.
4. **CI publish gate**: `needs: [check, security-audit, plugin-validate]` + `npm run check` + `npm audit` before publish.

## Pitfalls Hit
- Biome formatting changes source → dist drifts → must resync after any formatting fix
- Adding new subcommand to registry.toml requires updating allowlist.ts (manual step, caught by parity test)
- hooks.json structure is nested: `{ hooks: { EventType: [...] } }`, not flat `{ EventType: [...] }`

## Reusable For
- Any project with compiled dist that must track src/
- Any registry/config that must stay in sync with code allowlists
- Plugin packaging pipelines
