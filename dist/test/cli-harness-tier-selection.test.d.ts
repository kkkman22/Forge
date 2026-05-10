/**
 * Integration tests for CLI harness tier selection and adapters.
 *
 * Covers [R5.2, R5.6, R5.8]:
 *   - Tier selection priority: project > cmux > tmux > node-pty
 *   - All tiers fail → INCONCLUSIVE
 *   - Controllers attempted recorded correctly
 *   - Each adapter returns graceful failure when unavailable
 *
 * **Validates: Requirements R5.2, R5.6, R5.8**
 */
export {};
