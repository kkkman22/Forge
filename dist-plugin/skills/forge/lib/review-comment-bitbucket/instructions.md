---
description: "Use when posting /forge review findings to Bitbucket PR as tasks and inline comments"
dispatch_mode: inline
allowed_tools:
  - Read
  - Bash
  - Write
---

## Instructions

Posts review findings to Bitbucket PRs as tasks and inline comments.
Uses stable idempotent markers for cross-run reconciliation, platform gate for safe dispatch,
and partial-failure semantics to continue on individual tool call errors.

## Spec

- Design: `.kiro/specs/review-comment-bitbucket/design.md`
- Requirements: `.kiro/specs/review-comment-bitbucket/requirements.md`
- Tasks: `.kiro/specs/review-comment-bitbucket/tasks.md`

## Usage

Invoked by `/forge review` or `/forge ship --post-comments` after review markdown is produced.
Gate-checks Bitbucket platform, reconciles existing PR tasks/comments, posts new findings.
