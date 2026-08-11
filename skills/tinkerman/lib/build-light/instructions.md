---
updated: 2026-08-11
description: "Use when user runs `/tinkerman build` on a light-tier task, change touches 1 file and 20 lines or less, or has no spec or plan document"

dispatch_mode: inline
allowed_tools:
  - Read
  - Edit
  - Write
  - Bash
---

# /tinkerman build-light — Light Execution Engine

> **Trigger**: Light tier first step, or user input `/tinkerman build` with tier=light
> **Responsibility**: Execute tasks directly with TDD discipline, no pre-checks
> **Output**: Project code changes + atomic commits

---

## 1. Overview

Light execution engine for light-tier tasks (≤1 file, ≤20 lines changed). Skips Spec/Plan pre-checks, Closure-First probes, and Final Validation. Directly executes each task with TDD and atomic commits.

**Core Principle**: Test before code, verify before declare. Unrun test = nonexistent test.

---

**Not For**：
- 影响多个文件的变更
- 需要 TDD 的逻辑变更
- 需求不明确的任务

## 2. Light Path Execution

1. Read task list from Plan or user description
2. For each task: RED → GREEN → REFACTOR cycle
3. No pre-check gates (light path skips Spec and Plan validation)
4. No Closure-First probes
5. Atomic commit after each task
6. Update `.tinkerman/status.md` on completion

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

## Common Rationalizations

| 合理化 | 反驳 |
|--------|------|
| "改动太小不需要验证" | 小改动也需要运行验证命令。"应该没问题"不是证据 |
| "轻量路径不需要提交" | 每个变更都需要原子提交。未提交的变更是丢失的风险 |

---

## 5. Status Updates

Reference: forge-build SKILL §7.

Update `.tinkerman/status.md` phase after each task. On all tasks complete, transition to review phase.

## Gotchas
- **Scope creep**: Light task grows beyond 1 file/20 lines → still treated as light, skips TDD → if change exceeds limits, re-route to standard build
- **Skip verification**: No TDD ceremony → tempted to skip running tests entirely → still run relevant test file before declaring done
- **Missing atomic commit**: Light changes feel too small for commit → uncommitted changes accumulate → commit immediately after change verified
