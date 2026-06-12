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
- **Exception — version releases**: commits produced by `scripts/bump-version.mjs` (`chore: bump version to X.Y.Z`) are mechanical release markers (version bump + regenerated dist + auto-generated CHANGELOG), not feature changes. They may be committed and tagged directly on `main` and pushed via the release script. Historical releases v3.0.0–v3.4.0 all follow this pattern.
