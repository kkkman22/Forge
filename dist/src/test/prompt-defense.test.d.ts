/**
 * Unit tests for `scanInput` — the core prompt-injection / PII scanner.
 *
 * Covers:
 *   - benign inputs produce `{ safe: true, threats: [] }`
 *   - known attack examples trigger the expected pattern id(s)
 *   - threats are sorted by severity (critical → high → medium → low)
 *   - empty string scans are safe
 *   - very long inputs (10 KB) scan without throwing
 *   - no PII values leak into `ScanResult` — only pattern ids and offsets
 *   - adversarial inputs (unicode, null bytes, long repeating content) do
 *     not throw
 *
 * The accompanying property-based tests live in a separate file and
 * complement these example-based checks.
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.12
 */
export {};
