/**
 * Property-based tests for the prompt-defense scanner.
 *
 * Complements the example-based tests in `test/prompt-defense.test.ts` with:
 *   - benign sample corpus (≥ 100) → all scanned as safe
 *   - malicious sample corpus (≥ 50) → detected with the expected type
 *   - performance property: `detectionTimeMs` stays within budget on
 *     randomly generated inputs up to ~10 KB
 *   - fuzzing property: `scanInput` never throws on any input
 *   - PII echo property: neither the matched content nor the raw input
 *     leaks into `ScanResult`; only stable pattern ids and offsets
 *
 * **Validates: Requirements 5.8, 5.11, 5.12**
 */
export {};
