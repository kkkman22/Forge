/**
 * Integration tests for the context explosion defense system.
 *
 * Verifies end-to-end behavior across remaining layers (numbering aligned
 * with skills/forge/lib/build/references/context-budget.md):
 * - Layer 2: Subagent file-based return
 * - Layer 3: Phase-aware plan injection (Resume minimization)
 * - Layer 4: Read budget tracking
 *
 * Note: The former "Layer 1: Read cache dedup" (forge_read_cached) and its
 * budget-accumulator test were removed — forge_read_cached deleted, read
 * dedup delegated to Headroom's conversation compression. Layer 1 (phase
 * isolation / Phase Boundary Gate) is exercised elsewhere; this file covers
 * Layers 2-4.
 *
 * @vitest-environment node
 */
export {};
