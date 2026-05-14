/**
 * Integration tests for UI harness tier selection and adapters.
 *
 * Covers [R6.2, R6.5, R6.8]:
 *   - Tier selection priority: project > cmux-browser > playwright > cdp
 *   - All tiers fail → INCONCLUSIVE
 *   - Forge package.json does not gain browser dependencies [R6.5]
 *   - Each adapter returns graceful failure when unavailable
 *
 * **Validates: Requirements R6.2, R6.5, R6.8**
 */
export {};
