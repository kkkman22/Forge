# Worktree Usage Guide

## Overview

Forge uses git worktrees for branch isolation, ensuring each feature is developed in an independent working tree.

## Branch Protection Rules

- **No direct code modifications on `main`/`master`**
- Feature branch naming: `feature/<topic>` or `forge/<topic>`
- `<topic>` is extracted from `.forge/status.md`'s `current_task` field

## Workflow

### 1. Create Feature Branch

```bash
git checkout -b feature/<topic>
```

### 2. Development Cycle

```bash
# Plan phase (can run on any branch)
/forge plan <spec-path>

# Build phase (must be on feature branch)
/forge build <plan-path>

# Review phase
/forge review

# Test phase
/forge test

# Ship phase
/forge ship
```

### 3. Context Recovery

After a session interruption, use `/forge resume`:

```
/forge resume
```

Reads context from `.forge/progress/` and `.forge/knowledge/sessions/`.

## Session Boundaries

- Each `/forge` command forms a natural Session Boundary
- Inter-phase context handoff happens through `.forge/` filesystem
- Recommend starting a new Claude Code session between `/forge` commands
- Suggest a new session when context exceeds 100K tokens

## Status Files

| File | Purpose |
|------|---------|
| `.forge/status.md` | Current task status |
| `.forge/progress/*.md` | Task progress records |
| `.forge/specs/*/spec.md` | Requirements specs (immutable when locked) |
| `.forge/plans/*.md` | Execution plans (immutable when approved) |
| `.forge/reviews/*.md` | Review records |

## Related Files

- Build SKILL: `skills/forge/lib/build/instructions.md` §2.1 Branch Gate
- State management: `src/status-manager.ts`
- Worktree management: `src/worktree-manager.ts`
