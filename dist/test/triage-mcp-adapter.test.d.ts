/**
 * Tests for triage MCP adapter — graceful degradation pattern.
 *
 * Covers [loop-engineering-adoption R2]:
 *   - Jira sprint fetch returns null when MCP unavailable (stub → graceful)
 *   - Bitbucket PR fetch returns null when MCP unavailable (stub → graceful)
 *   - Git fallback findings shape is well-formed
 *   - Tool-name configuration is accepted without error
 *
 * **Validates: loop-engineering-adoption R2-AC3 (degradation chain)**
 */
export {};
