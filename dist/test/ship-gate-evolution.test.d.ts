/**
 * Integration tests for the ship-gate-blocked artefact helper added in
 * `src/ship.ts`.
 *
 * Covers Requirement 8.7:
 *   - `uncommitted` → `outcome: "partial"` (work not lost, user just
 *     needs to commit).
 *   - `checklist_failed` → `outcome: "failure"` (an unverified P1 fix
 *     slipped through).
 *   - In both cases the Evolution marker targets
 *     `forge-ship#ship_gate_blocked`.
 *
 * **Validates: Requirements 8.7, 8.12**
 */
export {};
