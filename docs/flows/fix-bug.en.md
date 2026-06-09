---
title: Fix a Bug Task Flow
category: getting-started
audience:
- maintainer
updated: 2026-06-09
owner: forge-maintainers
---

[← Back to Index](../INDEX.en.md) | [中文版](./fix-bug.md)

# Fix a Bug Task Flow

Use this flow for broken existing behavior, failing tests, CI failures, or user-reported regressions.

## What You Give Forge

Provide the symptom, reproduction steps, logs, or failing tests. The tighter the scope, the more likely Forge can use the light or standard path.

```text
/forge Fix the issue where login returns to the login page after valid credentials.
```

## What Forge Will Do

- Classify the work as a bugfix rather than a new feature.
- Use `build -> review` for small scoped fixes.
- Use `plan -> build -> review -> test -> ship` when the impact is broader.
- In build, write the failing test first, fix the behavior, then rerun verification.

## What You Must Decide

- Whether Forge's scope assessment is acceptable.
- Whether to provide a minimal reproduction when evidence is insufficient.
- At ship, whether to keep the branch, create a PR, or merge.

## Done Means

- The original failure has test or command evidence.
- Review has no P0/P1 findings.
- Ship gates cite fresh verification evidence.
