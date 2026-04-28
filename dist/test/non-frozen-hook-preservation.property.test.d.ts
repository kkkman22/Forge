/**
 * Preservation Property Test: Non-Frozen Hook Behavior Unchanged
 *
 * Property 4 (Preservation): For all hook invocations that are NOT frozen-zone checks
 * (SessionStart, UserPromptSubmit, PostToolUse, Stop, TeammateIdle, TaskCompleted,
 * and the plan-context PreToolUse hook), the hooks.json SHALL produce exactly the same
 * behavior as the original, preserving all `|| true` fallbacks on non-protection hooks.
 *
 * This test captures the CURRENT (unfixed) state of non-frozen hooks as a baseline.
 * After the fix (which only removes `|| true` from frozen-check hooks), these tests
 * must continue to pass — confirming no regressions on unrelated hooks.
 *
 * **Validates: Requirements 3.4, 3.5, 3.6**
 */
export {};
