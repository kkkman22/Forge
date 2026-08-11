---
updated: 2026-08-11
---
<!-- MIGRATION STUB: created during 2026-05-17 Task 6 to satisfy SKILL.md:68 reference.
  Original file was never authored. Content reflects spec section indications;
  treat as placeholder pending forge-recap maintenance pass. -->

# Data Sources for Recap

## Git History

```bash
git log --since="<window>" --pretty=format:"%h %s" --stat
```

## Session Metadata

`.forge/knowledge/sessions/` — per-session NDJSON with timestamps, topics, outcomes.

## Task Progress

`.forge/progress/` — per-task markdown with status, phase, completion timestamps.
