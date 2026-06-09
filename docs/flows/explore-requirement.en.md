---
title: Explore a Vague Requirement Task Flow
category: getting-started
audience:
- maintainer
updated: 2026-06-09
owner: forge-maintainers
---

[← Back to Index](../INDEX.en.md) | [中文版](./explore-requirement.md)

# Explore a Vague Requirement Task Flow

Use this flow when you know the direction, but not the solution, scope, or acceptance criteria.

## What You Give Forge

Describe the goal, constraints, known risks, and uncertainties.

```text
/forge Design a more reliable pre-ship check flow. Review, test, and ship evidence is scattered and users cannot tell why the next step is blocked.
```

## What Forge Will Do

- Use the full path: `decide -> spec -> plan -> build -> review -> test -> ship -> learn`.
- Compare product, architecture, and security directions during decide.
- Turn the vague goal into verifiable requirements during spec.
- Break the locked spec into executable tasks during plan.

## What You Must Decide

- Whether the decide direction is right.
- Whether to lock or revise the spec.
- Whether to approve the plan for execution.

## Done Means

- The vague goal has become clear requirements/design/tasks.
- Major tradeoffs have decision records.
- The final evidence chain explains why the work is complete.
