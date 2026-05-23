---
description: "Post review findings to Bitbucket PR as tasks and inline comments with stable idempotent markers, cross-run reconciliation, and platform gate."
dispatch_mode: inline
allowed_tools:
  - Read
  - Bash
  - Write
---

## Spec

- Design: `.kiro/specs/review-comment-bitbucket/design.md`
- Requirements: `.kiro/specs/review-comment-bitbucket/requirements.md`
- Tasks: `.kiro/specs/review-comment-bitbucket/tasks.md`

## Usage

Invoked by `/forge review` or `/forge ship --post-comments` after review markdown is produced.
Gate-checks Bitbucket platform, reconciles existing PR tasks/comments, posts new findings.
