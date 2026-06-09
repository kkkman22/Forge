---
title: Build a Clear Feature Task Flow
category: getting-started
audience:
- maintainer
updated: 2026-06-09
owner: forge-maintainers
---

[← Back to Index](../INDEX.en.md) | [中文版](./build-feature.md)

# Build a Clear Feature Task Flow

Use this flow when the requirement is bounded and has acceptance criteria or an existing spec.

## What You Give Forge

Describe the target user, behavior, edge cases, and acceptance method.

```text
/forge Add CSV export while preserving JSON export. Cover empty data and Chinese field names in tests.
```

## What Forge Will Do

- Use the standard path: `plan -> build -> review -> test -> ship`.
- Break the work into verifiable atomic tasks.
- Build with RED/GREEN/REFACTOR discipline.
- Review requirements, quality, and security through independent checks.

## What You Must Decide

- Whether the plan covers the needed scenarios.
- Whether any scope adjustment is acceptable.
- At ship, whether to open a PR, merge, or keep the branch.

## Done Means

- Every planned task is complete.
- The new behavior has direct test coverage.
- Docs or examples are updated when user-visible behavior changes.
