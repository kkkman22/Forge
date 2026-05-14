/**
 * Unit tests for the failure auto-sink helpers.
 *
 * Covers the contracts listed in Requirements 8.6 and 8.7:
 *   - {@link buildFailureEpisode} produces a v2 `Episode` with
 *     `outcome: "failure"`, a deterministic id, and trigger metadata
 *     in the body.
 *   - {@link buildFailureEvolutionMarker} renders a marker string that
 *     round-trips through the evolution-marker parser with the
 *     expected `date | source | target` layout.
 *
 * **Validates: Requirements 8.6, 8.7**
 */
export {};
