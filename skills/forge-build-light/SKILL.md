---
name: forge-build-light
description: "轻量执行引擎。轻量路径专用，跳过前置检查直接执行任务。"
disable-model-invocation: true
---

# /forge build-light — Light Execution Engine

> **Trigger**: Light tier first step, or user input `/forge build` with tier=light
> **Responsibility**: Execute tasks directly with TDD discipline, no pre-checks
> **Output**: Project code changes + atomic commits

---

## 1. Overview

Light execution engine for light-tier tasks (≤1 file, ≤20 lines changed). Skips Spec/Plan pre-checks, Closure-First probes, and Final Validation. Directly executes each task with TDD and atomic commits.

**Core Principle**: Test before code, verify before declare. Unrun test = nonexistent test.

---

## 2. Light Path Execution

1. Read task list from Plan or user description
2. For each task: RED → GREEN → REFACTOR cycle
3. No pre-check gates (light path skips Spec and Plan validation)
4. No Closure-First probes
5. Atomic commit after each task
6. Update `.forge/status.md` on completion

---

## 3. TDD Rules

Follow CLAUDE.md §2.1 TDD enforcement:
- **RED**: Write failing test first, confirm test detects missing functionality
- **GREEN**: Write minimal code to pass test
- **REFACTOR**: Refactor under test protection

**Iron Rule**: If code is written before test — delete code, start from test. No exceptions.

---

## 4. Execution Discipline

Reference: forge-build SKILL §6 (Verification Iron Law, Three-Strike Rule, Context Refresh).

Key rules:
- Every completed task must run verification commands
- Verification based on **just-run** command output, not prior results
- Claims like "should work" or "looks fine" are rejected
- Each task gets an atomic commit

---

## 5. Status Updates

Reference: forge-build SKILL §7.

Update `.forge/status.md` phase after each task. On all tasks complete, transition to review phase.
