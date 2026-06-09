---
title: Router Selection Guide
category: reference
audience:
- maintainer
updated: 2026-06-09
owner: forge-maintainers
---

# Router Selection Guide

## Three-Tier Routing

Forge uses a three-tier routing system that selects an execution path based on task complexity:

<!-- ssot:begin topic=routing render=routing-table locale=en -->
| Tier | Condition | Command Sequence |
|---|---|---|
| **Light** | Files affected <= 1 and changes <= 20 lines | `build → review` |
| **Standard** | Clear requirements or existing Spec | `plan → build → review → test → ship` |
| **Full** | New service / new database / auth changes / unclear requirements | `decide → spec → plan → build → review → test → ship → learn` |
<!-- ssot:end topic=routing -->

## Routing Decision Flow

```
User input: /forge <task description>
        │
        ▼
  Files affected ≤ 1 and changes ≤ 20 lines?
        │
   ┌────┴────┐
   Yes        No
   │          │
   ▼          ▼
  Light    Clear requirements or Spec exists?
               │
         ┌────┴────┐
         Yes        No
         │          │
         ▼          ▼
      Standard    Full
```

## Routing Principles

1. **User override first**: When the user specifies a tier explicitly, honor it
2. **Prefer heavier tier**: When uncertain, choose the heavier tier
3. **No skipping steps**: Once a tier is selected, execute its command sequence in order

## How to Choose

- Fix typo, update version number → **Light**
- Feature development with existing spec → **Standard**
- New feature with unclear requirements, needs multi-perspective evaluation → **Full**
- Security-related changes → at least **Standard**, consider **Full**

## Related Files

- Routing entry: `CLAUDE.md §1 Task Routing Rules`
- Router SKILL: `skills/forge/lib/router/instructions.md`
- Scheduler: `src/skill-scheduler.ts`
