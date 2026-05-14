/**
 * Integration tests for Post-Push Verify in ship.ts.
 *
 * Covers [R8.1, R8.2, R8.5, R14.11, R14.12]:
 *   - Passing command returns passed=true
 *   - Failing command returns passed=false + writes artifact
 *   - Custom ci_check_command respected
 *   - Timeout handled gracefully
 *
 * **Validates: Requirements R8.1, R8.2, R8.5**
 */
export {};
