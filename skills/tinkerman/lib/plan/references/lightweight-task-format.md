---
updated: 2026-08-11
---
# Lightweight Task Format

> Extracted from forge-plan SKILL.md Section 2, Step 3.

Used when Spec includes a `design.md`. Plan provides File Mapping, Dependency Graph, Spec Coverage Matrix; concrete code left for build phase via TDD.

## Format Fields

| Field | Description |
|------|------|
| Task Number | Sequential number, e.g. Task 1 |
| Task Title | One-sentence description of task goal |
| Target File Path | Full relative path from project root |
| Target Description | One-sentence description of the behavioral change to implement |
| Design Reference | `design.md#<section-anchor>` + one-sentence summary |
| Property | Corresponding Correctness Property number from design.md (if applicable) |
| Verify Command | Command to verify task completion |
| Commit Message | Atomic commit message |
| Depends On | Prerequisite task numbers (empty array if none) |

**Lightweight Task does not include complete RED/GREEN/REFACTOR code.** The build phase reads the relevant design.md sections via Design Reference and writes code in TDD fashion.

## Design Reference Rules

1. Format: `design.md#<section-anchor>` (GitHub-style anchor).
2. Each reference must include a one-sentence summary of the referenced section.
3. Plan document header's Design Reference Index aggregates all references.
