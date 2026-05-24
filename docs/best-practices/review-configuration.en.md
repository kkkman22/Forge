---
title: Review Configuration Guide
category: reference
audience:
- maintainer
updated: '2026-05-17'
owner: forge-maintainers
---

# Review Configuration Guide

## Three-Layer Review

Forge review uses three parallel review layers, each executed by an independent Subagent:

| Layer | Reviewer | Check Content |
|-------|----------|--------------|
| **Layer 1** | spec-check | Requirement coverage, scenario coverage, scope creep |
| **Layer 2** | quality-check | Naming, error handling, performance, test coverage, duplication, maintainability |
| **Layer 3** | security-check | Hardcoded secrets, injection risks, unsafe dependencies, permission boundaries, sensitive data |

## Severity Levels

| Level | Meaning | Handling |
|-------|---------|----------|
| **P0** | Release-blocking | Fix immediately, blocks `/forge ship` |
| **P1** | High impact | Fix before release, blocks `/forge ship` |
| P2 | Medium impact | Should fix, negotiable |
| P3 | Low impact | Suggested improvement, developer decides |

**Iron rule**: When P0/P1 issues exist, `/forge ship` is blocked. Fixes require re-review.

## Lightweight Mode

Light tier review omits Layer 1 (spec-check), running only quality-check and security-check.

## Configuration

Review configuration is defined in `CLAUDE.md §3 Review Discipline` and `skills/forge/lib/review/instructions.md`. Subagent definitions are at:

- `agents/spec-check.md`
- `agents/quality-check.md`
- `agents/security-check.md`

## Review Report Format

Review results are written to `.forge/reviews/` directory, containing:

1. Review summary (pass/fail)
2. Findings categorized by layer
3. P0-P3 severity labels
4. Fix recommendations (P0/P1 must include specific fix plan)

## Related Files

- Review SKILL: `skills/forge/lib/review/instructions.md`
- Agent definitions: `agents/spec-check.md`, `agents/quality-check.md`, `agents/security-check.md`
- Subagent runner: `src/subagent-runner.ts`
