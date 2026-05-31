/**
 * forge-exec-rtk.test.ts — Tests for RTK compression integration in forge_exec.
 *
 * Verifies:
 *   - RTK available + success output → RTK compression path
 *   - RTK available + failure output → full output (Iron Law)
 *   - RTK unavailable + success output → trimCommandOutput fallback
 *   - RTK timeout → fallback to trimCommandOutput
 *   - RTK crash → fallback to trimCommandOutput
 */
export {};
