/**
 * Property test: pack loader invariants.
 *
 * Invariants tested:
 *   - Idempotence: same inputs produce identical registries (serialized to JSON).
 *   - No crash: random YAML content never throws, only produces warnings.
 *   - Empty input stability: empty or missing packs directory returns empty registry.
 *
 * Uses fast-check for PBT and vitest for test runner.
 *
 * **Validates: R1.1–R1.6 Pack discovery and manifest parsing**
 */
export {};
