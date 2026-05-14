/**
 * Bug Condition Exploration Test: Frozen Zone Hook Swallows Exit Code
 *
 * Property 3 (Bug Condition): For all PreToolUse hooks that invoke check-frozen.sh
 * (matchers "Write|Edit" and "Bash"), the command string must NOT end with `|| true`,
 * which would swallow the non-zero exit code from check-frozen.sh and render
 * frozen file protection ineffective.
 *
 * Bug Condition from design:
 *   input.context.hookMatcher IN ["Write|Edit", "Bash"]
 *   AND input.context.targetFile matches frozen zone pattern
 *   AND check-frozen.sh would exit 1
 *   AND hook chain exit code == 0 (swallowed by || true)
 *
 * Expected Behavior from design:
 *   The hook chain SHALL propagate the non-zero exit code from check-frozen.sh,
 *   causing the write operation to be blocked.
 *
 * This test is EXPECTED TO FAIL on unfixed code — failure confirms the bug exists.
 *
 * **Validates: Requirements 1.3, 2.3**
 */
export {};
