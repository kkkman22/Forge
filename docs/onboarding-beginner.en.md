---
title: Forge Beginner Onboarding
category: reference
audience:
- maintainer
updated: 2026-06-19
owner: forge-maintainers
---

[← Back to Index](./INDEX.en.md) | [中文版](./onboarding-beginner.md)

> ⚠️ This translation may be behind the Chinese version. Chinese last updated: 2026-06-06

# Forge Beginner Onboarding

> **Estimated learning time**: ~15 minutes
> **Prerequisites**: Basic command line operations, Git fundamentals

---

## Are You a First-Time User?

This path is for you if:

- You've just heard about Forge and aren't sure what it is
- You've installed Forge but only used `/forge status`
- You want to understand how Forge helps daily development without mastering all features immediately

---

## Core Concepts

### Three-Dimensional Routing

Forge automatically selects execution paths based on three dimensions:

| Dimension | What It Determines | Example |
|-----------|-------------------|---------|
| **Complexity** | How big is the task? | Fix 1 line vs. build new service |
| **Task Type** | What kind of work? | Frontend / backend / docs / infra |
| **Project Phase** | What stage is the project? | New project / maintenance / bugfix |

The result is Forge choosing one of three paths: **lightweight, standard, or full**.

### TDD Flow

TDD = Test-Driven Development. Forge's build stage enforces:

1. **RED**: Write test first, run it, see it fail
2. **GREEN**: Write minimal code to pass the test
3. **REFACTOR**: Optimize code while keeping tests green

> Forge's `build` stage checks: if code is written before tests, it must be deleted and restarted from tests.

---

## 3 Most Common Commands

### 1. `/forge` — Entry and Routing

**Purpose**: Analyze your task description and automatically select the execution path.

**Syntax**:

```bash
/forge <task description> [--tier=light|standard|full]
```

**Example**:

```bash
# Auto-detect
/forge fix the login page style misalignment

# Force lightweight path
/forge --tier=light fix the login page style misalignment
```

**Output**: Shows recommended tier and command sequence.

### 2. `/forge build` — Execution

**Purpose**: Implement code task by task according to the approved plan.

**Syntax**:

```bash
/forge build
```

**Behavior**:
- Reads `.forge/plans/*.md`
- Executes tasks one by one
- Atomic commit after each task
- Auto-advances to review (standard/full path)

**Example scenario**:

```bash
# Plan approved, start implementation
/forge build

# Output summary example:
# → Task 1/5: Create user model ✅
# → Task 2/5: Add login API ✅
# → Task 3/5: Implement password hash ...
```

### 3. `/forge review` — Code Review

**Purpose**: Three-layer independent review to ensure code quality.

**Syntax**:

```bash
/forge review
```

**Three Layers**:

| Layer | Check Content | Reviewer |
|-------|--------------|----------|
| 1. Spec Alignment | Are all plan requirements implemented? | spec-check agent |
| 2. Quality | Naming, error handling, performance, duplication | quality-check agent |
| 3. Security | Hardcoded keys, injection risks, permission boundaries | security-check agent |

**Results**:
- P0/P1 finding → Blocks, must fix
- P2/P3 finding → Suggestion, negotiable

---

## Hands-On Exercise: Complete Your First Forge Task

### Goal

Use Forge's lightweight path to fix a typo.

### Starting State

- Forge installed (see [quick-start.en.md](./quick-start.en.md))
- In project root directory
- Project initialized (`.forge/` exists)

### Steps

1. **Intentionally introduce a typo in README.md**

   ```bash
   # Manually edit README.md, change "Forge" to "Forg"
   ```

2. **Run Forge lightweight path**

   ```bash
   /forge fix the typo in README
   ```

3. **Observe Forge's behavior**
   - Auto-selects lightweight path
   - Executes build: finds and fixes the typo
   - Executes review: checks the change
   - Suggests commit message

4. **Verify the fix**

   ```bash
   git diff HEAD~1
   ```

### Expected Result

- README.md typo is corrected
- One atomic commit created, message format: `fix(readme): ...`
- No P0/P1 findings

---

## Continue Learning

Mastering these 3 commands enables you to handle daily small tasks with Forge. Next steps:

- **[Daily Developer Path → onboarding-daily.en.md](./onboarding-daily.en.md)** — Learn the complete standard workflow stages
- **[Command Reference → reference-commands.md](./reference-commands.md)** — View all <!-- ssot:begin topic=commands render=count -->38<!-- ssot:end topic=commands --> commands
