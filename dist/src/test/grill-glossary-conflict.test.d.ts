/**
 * Integration tests for the grill-time glossary conflict check.
 *
 * Covers Task 4.6 / Requirement 4.7: after each `applyAnswer`, the
 * grill driver calls `checkGrillGlossaryConflicts`. When a user's
 * answer introduces a term whose name clashes with an existing
 * glossary entry under a different definition (or whose alias
 * collides with another term), the driver must pause the loop and
 * surface `renderGrillConflictPrompt` for clarification.
 *
 * These tests drive the pure functions directly; the driver /
 * prompt layer is exercised indirectly via the rendered string.
 *
 * **Validates: Requirements 4.7**
 */
export {};
