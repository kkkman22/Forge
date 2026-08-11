---
updated: 2026-08-11
---
# From-Chats Mode Reference [R10.8]

## Overview

`/tinkerman learn --from-chats` scans `.claude/` transcript files in a time window, extracts preference atoms, and writes strong candidates to `evolved-rules.md`.

## PreferenceAtom Fields [R10.2]

| Field | Description |
|-------|-------------|
| trigger | Original text that triggered extraction |
| behavior | Extracted behavioral preference |
| rationale | Optional reasoning |
| decisionRule | Optional decision rule |
| confidence | strong / moderate / weak / contradicted |
| source | Transcript file path |

## Confidence Levels [R10.3]

| Level | Threshold | Action |
|-------|-----------|--------|
| strong | "always/never" patterns | Write to evolved-rules.md |
| moderate | "prefer/should" patterns | Interactive confirmation |
| weak | "maybe/consider" patterns | Discard in autonomous mode |
| contradicted | Multiple conflicting atoms | Interactive resolution |

## Task-Specific Rejection [R10.6]

Atoms containing file paths, PR numbers, task IDs, or commit hashes are rejected as task-specific.

## Interactive vs Autonomous [R10.5]

- **Interactive**: weak/contradicted atoms require user confirmation
- **Autonomous**: weak/contradicted atoms discarded + logged to `from-chats-skipped.log`
