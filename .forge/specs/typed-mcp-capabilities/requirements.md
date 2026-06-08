---
feature: "typed-mcp-capabilities"
status: "draft"
date: "2026-06-08"
workflow_variant: "requirements-first"
kind: "feature"
brownfield: true
---

# Requirements — typed-mcp-capabilities

## Purpose

Forge MCP currently includes generic execution and read tools. This spec migrates high-value workflows to typed capabilities so review, status, doctor, and ship consume structured outputs instead of arbitrary command strings.

## Requirements

### Requirement 1: Typed Capability Tools

Forge MCP SHALL expose structured tools for common health and evidence checks.

#### Acceptance Criteria

- MCP SHALL expose typed tools for check command, git diff summary, dist-sync, docs drift, review context, and artifact query.
- Each typed tool SHALL return schema-validated JSON.
- Generic `forge_exec` SHALL remain available but marked legacy for structured use cases.

### Requirement 2: Reduce Arbitrary Script Entry Points

Forge SHALL route core product checks through typed tools where possible.

#### Acceptance Criteria

- Doctor/status SHALL prefer typed MCP capabilities over shell command strings when MCP is available.
- Review context collection SHALL prefer typed diff/read tools.
- Ship gates SHALL consume typed dist/docs/artifact results when available.

### Requirement 3: Compatibility and Deprecation

Forge SHALL preserve compatibility while communicating migration.

#### Acceptance Criteria

- Existing `forge_exec` behavior SHALL not break.
- Legacy script mode SHALL emit deprecation warnings for capabilities with typed replacements.
- Tests SHALL cover warning behavior.

## Out of Scope

- Removing `forge_exec`.
- Networked MCP services.
