/**
 * Integration tests for fix-conflicts three-strike escalation [R7.12].
 *
 * Verifies that 3 consecutive check failures with distinct file edits
 * trigger `/forge debug`, while identical re-runs do not increment the counter.
 *
 * **Validates: Requirements R7.11, R7.12**
 */
export {};
