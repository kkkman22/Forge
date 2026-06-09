---
title: Policy Profiles Guide
category: reference
audience:
- maintainer
updated: 2026-06-09
owner: forge-maintainers
---

[← Back to Index](../INDEX.en.md) | [中文版](./policy-profiles.md)

# Policy Profiles Guide

Forge uses `policy_profile` to control process cost. The default is `team`, so existing projects do not become less strict after upgrading.

## Available Profiles

| Profile | Use Case | Review | Evidence | Mutation | Force Skip |
|---------|----------|--------|----------|----------|------------|
| `solo` | Personal projects and fast iteration | basic | optional | optional | basic log |
| `team` | Default team collaboration | required | required review/test | optional | required audit |
| `enterprise` | Compliance-heavy or high-risk delivery | full | required review/test/artifacts | required selected groups | approval artifact |

## Configuration

Add this to `.forge/config.md`:

```yaml
policy_profile: enterprise
```

Missing or invalid values fall back to `team` and produce a diagnostic.

## Selection Guidance

- Use `team` by default.
- Use `solo` only for personal projects where lower process cost is acceptable.
- Use `enterprise` when you need an auditable evidence chain, artifact freshness, or mutation gates.
