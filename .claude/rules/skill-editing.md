---
paths:
  - ".claude/skills/**/SKILL.md"
  - "skills/**/SKILL.md"
---

# Skill Frontmatter Rules

- required frontmatter fields: `name`, `description`
- field name is `allowed-tools` (hyphenated), NOT `allowedTools`
- SKILL.md should stay ≤150 lines; use references/ for long content
- progressive disclosure: Overview → Steps → References
- `context: fork` for skills that modify files (prevents main context pollution)
- `disable-model-invocation: true` for skills only callable via /forge router
