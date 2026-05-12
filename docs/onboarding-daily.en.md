> ⚠️ This translation may be behind the Chinese version. Chinese last updated: 2026-05-12

[中文版](./onboarding-daily.md) | [← Back to Index](./INDEX.en.md)

# Forge Daily Developer Onboarding

> **Estimated learning time**: ~20 minutes
> **Prerequisites**: Have read [quick-start.en.md](./quick-start.en.md), understand Forge basics

---

## Are You a Daily Developer?

This path is for you if:

- You've used `/forge` to complete several tasks
- You need to understand what each stage of the Forge workflow does
- You want to master the complete standard path (plan → build → review → test → ship)

---

## Standard Path Overview

```
User describes task
    │
    ▼
plan ──→ build ──→ review ──→ test ──→ ship
  ↑                                    │
  └────── Loop back on failure ←───────┘
```

Standard path applies to: new feature development, known-scope refactoring, improvements with clear requirements.

---

## Stage Details

### 1. plan — Planning

**Purpose**: Break down requirements into executable atomic tasks.

**Key commands**:

```bash
# Auto-plan from description
/forge add pagination to user API

# Or call plan directly
/forge plan
```

**State flow**:

| State | Meaning | Next Step |
|-------|---------|-----------|
| `draft` | Plan draft, awaiting approval | User review and approval |
| `approved` | Plan approved, ready to execute | Auto-advances to build |

**Output file**: `.forge/plans/<topic>.md`

**Content**: Task list, file mapping, dependency graph, acceptance criteria.

---

### 2. build — Execution

**Purpose**: Implement code task by task according to plan, following TDD.

**Key command**:

```bash
/forge build
```

**State flow**:

| State | Meaning | Next Step |
|-------|---------|-----------|
| `in_progress` | Executing tasks | Continue execution |
| `completed` | All tasks done | Auto-advances to review |

**Constraints**:
- Tests before code (RED → GREEN → REFACTOR)
- Atomic commit per task
- No mid-build user confirmation
- Same fix fails 3 times consecutively → enters debug

---

### 3. review — Review

**Purpose**: Three-layer independent review ensures code quality and security.

**Key command**:

```bash
/forge review
```

**State flow**:

| Result | Meaning | Next Step |
|--------|---------|-----------|
| Pass (no P0/P1) | Code quality合格 | Auto-advances to test |
| Fail | Blocking issues exist | Stops, prompts fix then rerun review |

**Output file**: `.forge/reviews/<topic>.md`

---

### 4. test — Testing

**Purpose**: Run complete verification suite.

**Key commands**:

```bash
# Forge auto-runs
/forge test

# Or manually run before ship
npm run check    # tsc + biome + vitest + script checks
```

**State flow**:

| Result | Meaning | Next Step |
|--------|---------|-----------|
| Pass | All checks green | Auto-advances to ship |
| Fail | Tests or lint failed | Stops, prompts fix then rerun test |

---

### 5. ship — Delivery

**Purpose**: Final checks and delivery options.

**Key command**:

```bash
/forge ship
```

**Delivery options**:

| Option | Behavior |
|--------|----------|
| Direct merge | `git merge` to main |
| Create PR | Push branch, provide PR link |
| Continue iteration | Keep branch, develop further |
| Archive and abandon | Clean up branch, keep records |

**State flow**:
- After ship completes, task marked as `completed`
- Full path auto-enters `learn` stage

---

## Auto-Advance Between Stages

Forge automatically advances to the next stage after **success**, **without asking for confirmation**.

```
plan (approved) ──auto──→ build ──auto──→ review (pass) ──auto──→ test (pass) ──auto──→ ship
```

**Only stops when**:
- review fails → Shows issue list, prompts fix then rerun `/forge review`
- test fails → Shows failure details, prompts fix then rerun `/forge test`
- 3 consecutive failures → Enters `/forge debug`

---

## Hands-On Exercise: Complete a Standard Path

### Goal

Use Forge's standard path to add a utility function to the project.

### Starting State

- Forge installed and project initialized
- On feature branch (not main)

### Steps

1. **Describe the task**

   ```bash
   /forge add a string truncation function with ellipsis
   ```

2. **Review the Plan**
   - Forge generates plan, shows task list
   - Confirm and approve (if needed)

3. **Observe Build**
   - Forge auto-executes build
   - One-line summary after each task

4. **Review Results**
   - View three-layer review report
   - Fix any P0/P1 if prompted

5. **Test Verification**
   - Forge auto-runs `npm run check`
   - Confirm all pass

6. **Ship Delivery**
   - Choose delivery method (suggested: Create PR)

### Expected Result

- New files `src/truncate.ts` and `test/truncate.test.ts`
- All tests pass
- 2-3 atomic commits created
- review has no P0/P1

---

## Continue Learning

- **[Advanced User Path → onboarding-advanced.en.md](./onboarding-advanced.en.md)** — Learn full path and knowledge system
- **[Feature Workflow → workflow-feature.md](./workflow-feature.md)** — View complete standard path example
