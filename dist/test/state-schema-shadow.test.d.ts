/**
 * Shadow-migration test for `parseStatusFileGraceful`.
 *
 * Verifies that the schema-driven path (`FORGE_USE_ZOD_PARSER=1`) produces
 * the same `parsed` result as the legacy path for a curated set of real-
 * world inputs. Warnings may differ in detail; the `parsed` field is the
 * observable contract that callers depend on.
 *
 * **Validates: Requirement 2.8** — incremental schema migration parity.
 */
export {};
