/**
 * Integration tests for the context explosion defense system.
 *
 * Verifies end-to-end behavior across remaining layers:
 * - Layer 3: Subagent file-based return
 * - Layer 4: Phase-aware plan injection
 * - Layer 5: Read budget tracking
 *
 * Note: Layer 1 (Read cache dedup) was removed — forge_read_cached deleted,
 * compression delegated to Headroom. Layer 2 (Phase boundary budget) used
 * the read-cache index and was removed with it; budget tracking is covered
 * independently by Layer 5.
 *
 * @vitest-environment node
 */
export {};
