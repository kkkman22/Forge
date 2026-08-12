---
spec: core-adapter-split
status: pending
basis: tinkerman-subtraction-roadmap-and-zcode-plan §2.2
created: 2026-08-12
---

# Core + Adapter Split Requirements

## Goal

Split Tinkerman into platform-agnostic core + platform-specific adapters (Claude Code + ZCode).

## Requirements

1. `tinkerman-core/`: brake scripts (stdin JSON, exit 2), review agents (markdown), .tinkerman/ schema, iron-law templates
2. `adapters/claude-code/`: hooks.json + agents/ + skills/ + commands/ (current plugin form)
3. `adapters/zcode/`: install.mjs writes ~/.zcode/cli/config.json hooks+mcp, generates .agents/ profiles, slash commands
4. ZCode-specific: PostToolUseFailure → Three-Strike counter (platform gain, CC lacks this event)
5. ZCode-specific: PreCompact/SubagentStop events absent → compact hooks dropped (already degraded)
6. AGENTS.md marker-zone iron-law injection (≤4KB budget, not full-file takeover)

## Out of scope

- Durable Workflow port (ZCode already has this — ADR-0009 "被吸收" validation)
- ZCode-specific hook protocol differences (S1 spike determines exact deltas)

## Key risk

ZCode silent auto-update may break hook protocol — adapter pins EXPECTED_CLI_VERSION,
tinkerman doctor self-checks on session start (warn, not block).
