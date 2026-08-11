---
updated: 2026-08-11
---
# Guarded Merge Rules Reference

## Progress Files [R7.6]

Merge by task_id. Priority: completed > pending. Tie-break: latest `completed_at`. Final tie: ours.

## Knowledge Files [R7.7]

Merge by pattern_id/failure_id. `confidence = max(ours, theirs)`. `occurred_count = ours + theirs`. Single-side entries preserved verbatim.

## ADR Files [R7.8]

Reassign theirs ADR IDs starting from `nextAdrId()`. Update `adr-index.md` accordingly.

## Review Files [R7.9]

Append both sides. Sort by (layer, severity).
