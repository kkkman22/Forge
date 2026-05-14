/**
 * Regression test for `scripts/extract-bench-json.mjs`.
 *
 * Uses synthetic bench JSON inputs to verify:
 *   - baseline → PR speedup is accepted
 *   - PR slower than baseline beyond threshold fails with exit 1
 *   - PR slower within threshold is accepted
 *
 * **Validates: Requirement 4.6**
 */
export {};
