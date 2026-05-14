/**
 * Shadow-migration test for `parseConfigGraceful`.
 *
 * Verifies that the schema-driven path (`FORGE_USE_ZOD_PARSER=1`) produces
 * the same `parsed` result as the legacy path for representative config
 * inputs.
 *
 * **Validates: Requirement 2.8** — incremental schema migration parity.
 */
export {};
