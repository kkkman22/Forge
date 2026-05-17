# Data Sources for Recap

## Git History

```bash
git log --since="<window>" --pretty=format:"%h %s" --stat
```

## Session Metadata

`.forge/knowledge/sessions/` — per-session NDJSON with timestamps, topics, outcomes.

## Task Progress

`.forge/progress/` — per-task markdown with status, phase, completion timestamps.
