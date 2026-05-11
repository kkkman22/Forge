---
paths:
  - "**/*.ts"
  - "**/*.md"
---

# Branch Protection

- never commit to main / master directly
- branch naming: `forge/<slug>` or `feature/<slug>`
- use `/forge ship` for push workflow, not manual `git push`
- one logical change per commit (atomic commits)
- commit messages: conventional commits format (`type(scope): description`)
