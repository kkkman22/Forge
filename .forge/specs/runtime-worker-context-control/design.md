---
status: draft
feature: runtime-worker-context-control
layout: design
created: 2026-06-10
---
# Design Document

## Overview

The design introduces a Forge-owned runtime layer below `/forge`. The runtime
does not change business phase routing. It changes where detailed work happens:
phase workers write reports, logs, and summaries to `.forge/`, while the main
conversation receives only an artifact-first summary.

The same runtime layer owns configuration synchronization. Marketplace users
receive a packaged runtime. Source-mode developers use a small project shim that
delegates to current checkout files, avoiding copied hook drift.

## Runtime Flow

```text
/forge
  -> route existing phase sequence
  -> phase worker request
       kind: subagent | cli-sdk
       phase: plan | build | review | test | ship | learn
       artifact_path: .forge/runs/<run>/workers/<phase>.md
       summary_path: .forge/runs/<run>/workers/<phase>.json
  -> worker executes detailed work
  -> worker writes artifact + summary
  -> main context receives bounded summary only
  -> Forge gate decides next phase
```

## Worker Kinds

### Subagent Worker

Subagent workers are best for parallel review, research, and analysis. The
runtime builds the subagent invocation and appends a hard summary contract:

- write the full report to `artifact_path`
- keep the final response schema bounded
- never include raw command logs in the final response

The runtime accepts an executor function in tests and a Claude Code executor in
production integration.

### CLI/SDK Worker

CLI/SDK workers are best for phase-level isolation. The runtime builds command
arguments and expects the worker command to write `summary_path`. This supports
marketplace packaging because the worker can be shipped as a plugin script or
compiled runtime file.

## Summary Schema

```json
{
  "phase": "review",
  "worker_kind": "subagent",
  "status": "success",
  "summary": "3-layer review complete",
  "artifact_path": ".forge/runs/run-1/workers/review.md",
  "commands": [
    {
      "cmd": "npx vitest run test/review.test.ts",
      "result": "pass",
      "evidence_path": ".forge/runs/run-1/workers/review-vitest.log"
    }
  ],
  "findings": {
    "p0": 0,
    "p1": 1,
    "items": [
      {
        "severity": "P1",
        "summary": "Missing drift repair test",
        "evidence_path": ".forge/reviews/quality-check.md"
      }
    ]
  },
  "next_action": "test"
}
```

Field limits are enforced before the summary is returned to the main context.

## Configuration Sync

`runtime-config-sync` reads project settings and produces a drift report. It
recognizes two modes:

- `source`: hooks should call source shims in the checkout.
- `marketplace`: hooks/runtime assets should be plugin-root packaged paths.

Repair is marker-based. Forge-managed hook entries contain a stable marker in
the command, so repair can replace or add Forge entries without deleting user
entries.

## Marketplace Compatibility

The marketplace plugin includes worker scripts through `scripts/dist-manifest.json`.
Runtime commands are written to work with plugin paths and project paths. The
source shim is for development only; marketplace mode does not depend on the
developer checkout.

## Non-Goals

- Replace `/forge` with context-mode or a second command entry.
- Require users to manually restart in a new window for normal workflows.
- Make platform auto-compact thresholds part of Forge correctness.
- Rewrite all existing phase skills in this slice.
