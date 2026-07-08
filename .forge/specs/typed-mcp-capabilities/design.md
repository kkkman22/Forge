---
feature: "typed-mcp-capabilities"
date: "2026-06-08"
workflow_variant: "requirements-first"
kind: "feature"
brownfield: true
---

# Design — typed-mcp-capabilities

## Overview

Add MCP tools with explicit input/output schemas. Keep generic read/exec tools as fallback but make high-level checks structured.

## Current State

`forge_exec` has allowlist and shell defenses. It still accepts command strings and returns command output. Several checks depend on scripts whose output must be parsed later.

## Proposed Tools

| Tool | Purpose |
|------|---------|
| `forge_check_command` | Run configured check profile and return structured result. |
| `forge_diff_summary` | Return prioritized diff summary for review/status. |
| `forge_dist_sync` | Return dist-sync status without parsing script text. |
| `forge_docs_drift` | Return docs governance status. |
| `forge_artifact_query` | Query latest evidence artifacts. |
| `forge_review_context` | Return review-ready context bundle. |

## Architecture

- Add tools under `src/mcp/tools/`.
- Share implementations with local doctor/status modules where possible.
- Add Zod schemas for every input and output.
- Add deprecation diagnostics in legacy script mode.

## Testing Strategy

- MCP integration tests for each new tool.
- Schema property tests for output totality.
- Backward compatibility tests for `forge_exec`.
- Deprecation warning tests.

## Rollout

1. Add typed tools without changing callers.
2. Wire doctor/status to typed tools when available.
3. Wire review/ship consumers.
4. Add warning for legacy overlaps.

## Reversibility

Callers can fall back to existing script execution paths when MCP capability is unavailable.
