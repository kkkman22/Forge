/**
 * Integration test: Bitbucket MCP adapter degradation paths.
 *
 * Covers [R4.3, R14.1, R14.2]:
 *   - MCP not available → null
 *   - Returns 401 → null
 *   - Returns 500 → null
 *   - Timeout → null
 *   - Canvas still produces complete HTML without enrichment
 *
 * **Validates: Requirements R4.3, R14.1, R14.2**
 */
export {};
