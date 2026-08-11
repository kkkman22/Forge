---
id: "ADR-0001"
title: "Frozen-Zone Protection: Migrate from Exit-Code Blocking to Structured JSON Feedback"
status: accepted
date: "2026-05-12"
deciders:
  - "@maintainer"
# related_adrs:
# supersedes:
---

# ADR-0001: Frozen-Zone Protection — Migrate from Exit-Code Blocking to Structured JSON Feedback

## Context

Forge's frozen-zone protection currently relies on shell exit codes (`exit 2` for PreToolUse deny, `exit 1` for unexpected errors) to block AI writes to locked specs and approved plans. While this effectively prevents mutations, the model only sees a generic "Tool execution blocked" message with no actionable context about *why* the file is frozen or *what to do instead*.

Claude Code 2.1.121 introduced `PostToolUse updatedToolOutput` for all tools, enabling hooks to rewrite or augment tool output after execution. Combined with the existing PreToolUse structured JSON response capability (`{decision, systemMessage, additionalContext}`), this creates an opportunity to replace blunt exit-code denial with rich, self-correcting feedback.

The core problem: exit-code-only blocking forces the model into blind retry loops. It knows a write was blocked but cannot determine the correct alternative path without human intervention.

## Decision

Migrate frozen-zone protection from exit-code-only blocking to structured JSON feedback across two hook layers:

1. **PreToolUse (primary defence)**: When a frozen-zone violation is detected, return structured JSON:
   ```json
   {
     "decision": "deny",
     "systemMessage": "Frozen-zone violation: <file> is <status> (locked/approved). Reason: <why>. Alternative: <suggested path>. Unlock: /forge <command>.",
     "additionalContext": { "file": "<path>", "zone": "frozen", "status": "<status>" }
   }
   ```
   The `systemMessage` includes: which file, why it is frozen, the recommended alternative action, and the unlock procedure. This gives the model enough context to self-correct without human help.

2. **PostToolUse (defence-in-depth)**: For CC 2.1.121+, a PostToolUse hook inspects the tool result after execution. If a frozen-zone file was somehow written (e.g., the tool bypassed PreToolUse), the hook emits an `updatedToolOutput` warning appended to the tool result, logging the breach to `.tinkerman/runs/*-frozen-events.jsonl`.

3. **Zone_Registry**: The frozen-zone file list is read from `.tinkerman/config.md` at runtime, keeping the registry in sync with project configuration changes.

4. **Audit logging**: All frozen-zone events (denials and breaches) are appended to `.tinkerman/runs/*-frozen-events.jsonl` with automatic rotation.

5. **Status integration**: `/forge status` reads the audit log and shows a frozen-zone activity summary (denial count, breach count, last violation timestamp).

### Feature Flag

`FORGE_STRUCTURED_FROZEN=1` (default ON). Users set `FORGE_STRUCTURED_FROZEN=0` to revert to legacy exit-code-only behaviour. The flag will be removed after a 6-month deprecation period (estimated removal: 2026-11).

### Version Compatibility

- PreToolUse structured JSON works on Claude Code 2.1.10+.
- PostToolUse `updatedToolOutput` requires Claude Code 2.1.121+. On older versions, the PostToolUse hook is a graceful no-op (logs a debug message, does not error).

## Rejected Alternatives

1. **Stay exit-code-only** — The model receives no structured guidance and cannot self-correct. Leads to repeated attempts and human intervention loops. This is the exact problem we are solving.

2. **Use MCP tools for reporting** — Would introduce a hard dependency on MCP tool availability. Adds installation complexity and a potential failure surface for what is fundamentally a hook-layer concern.

3. **Modify the TypeScript `check-frozen.ts` to emit structured output** — The hook scripts are bash. Adding structured JSON emission from the TS module would require changing the call interface between bash wrapper and compiled JS. Keeping the JSON construction in bash hook scripts is simpler, more transparent, and easier to debug.

## Consequences

### Positive

- **Model self-correction**: Structured feedback gives the model precise context about violations, enabling autonomous recovery instead of blind retry or human escalation.
- **Defence-in-depth**: PostToolUse hook catches any writes that slip past PreToolUse, closing the gap for edge cases or tool changes.
- **Audit trail**: JSONL event log provides a machine-readable history of all frozen-zone interactions, useful for compliance and debugging.
- **Gradual rollout**: Feature flag allows teams to validate the new behaviour on a subset of projects before full adoption.
- **Backward compatible**: Legacy mode (`FORGE_STRUCTURED_FROZEN=0`) preserves exact previous behaviour. PostToolUse gracefully degrades on older CC versions.

### Negative

- **Two code paths to maintain**: Until the feature flag is removed, both structured and legacy paths must be tested and maintained.
- **PostToolUse version gate**: Teams on CC < 2.1.121 lose the defence-in-depth layer. Mitigated by PreToolUse working on 2.1.10+ and the feature flag allowing revert.
- **Slightly larger hook output**: Structured JSON messages are longer than a bare exit code. The tradeoff is acceptable given the self-correction benefit.
