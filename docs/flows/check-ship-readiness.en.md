---
title: Check Ship Readiness Task Flow
category: getting-started
audience:
- maintainer
updated: 2026-06-09
owner: forge-maintainers
---

[← Back to Index](../INDEX.en.md) | [中文版](./check-ship-readiness.md)

# Check Ship Readiness Task Flow

Use this flow when code is done and you need to know whether it is safe to deliver.

## What You Give Forge

Provide the current task, branch state, or run status commands directly.

```text
/forge status
/forge replay <topic>
/forge ship
```

## What Forge Will Do

- Status shows task, phase, profile, and next step.
- Replay shows the topic's stage files, ship records, and immutable evidence artifacts.
- Doctor shows a fuller health snapshot.
- Ship checks review, test, progress, artifact, and related gates.
- If evidence is stale or missing, Forge reports the blocker and source.

## What You Must Decide

- Whether to rerun missing verification.
- Whether to fix P0/P1 blockers from review, test, or ship gates.
- Which delivery action to take during ship.

## Done Means

- The next step is not blocked by required gates.
- Every pass claim has fresh command or artifact evidence.
- Delivery records trace back to review/test/ship evidence.

## Evidence Chain Replay

When status, doctor, or ship reports missing, stale, or contradictory evidence, run:

```text
/forge replay <topic>
```

Replay inspects stage files, ship records, and `.forge/artifacts/index.jsonl` without mutating them. Its output distinguishes `[fact]`, `[missing]`, and superseded artifacts that remain visible for auditability.
