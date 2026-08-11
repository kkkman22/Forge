---
description: "Use when running `/tinkerman replay <topic>` to inspect the evidence chain for a task"
updated: 2026-08-11
dispatch_mode: inline
allowed_tools:
  - Read
  - Glob
  - Grep
  - Bash
---

# /tinkerman replay — Evidence Chain Replay

> **Trigger**: `/tinkerman replay <topic>`
> **Output**: concise timeline from stage files plus immutable evidence artifacts.

## Instructions

Replay reconstructs what Forge knows about one topic without editing state. It joins dossier stage files, ship records, and `.tinkerman/artifacts/index.jsonl` into a chronological timeline.

## Execution

1. Resolve `<topic>` from the first argument. If missing, read `.tinkerman/status.md` and use `current_task`.
2. Build the replay with `buildEvidenceReplay(topic, ".tinkerman")`.
3. Render it with `renderReplayTimeline(replay)`.
4. Print the timeline. Do not modify artifacts, stage documents, or ship records.

## Required Output Properties

- Include decisions, specs, plans, progress, reviews, findings, debug notes, ship records, and evidence artifacts.
- Show missing stages explicitly.
- Distinguish `[fact]`, `[inference]`, and `[missing]`.
- Keep superseded artifacts visible and mark them as superseded.

## Related Code

- `src/replay.ts`
- `src/feature-dossier.ts`
- `src/evidence-artifact.ts`

## Gotchas

- **State mutation**: Replay is inspection only. Never rewrite the artifact index or stage files.
- **Weak provenance**: If an entry lacks an artifact id, show its path instead of inventing one.
- **Topic ambiguity**: If multiple files partially match the topic, keep the topic literal and let dossier scanning rules decide.
