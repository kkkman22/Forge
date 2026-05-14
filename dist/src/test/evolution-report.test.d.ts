/**
 * Integration tests for the Evolution report aggregation in
 * `src/learn.ts`.
 *
 * Covers Tasks 8.7 and 8.9:
 *   - Task 8.7: aggregation of markers across reviews/progress/findings
 *     produces a report whose header highlights `suggest_adr=true`
 *     targets and whose body lists normal candidates + orphans.
 *   - Task 8.9: `generateEvolutionReport` is snapshot-free — when the
 *     file carrying a marker disappears between two runs, that marker
 *     is absent from the next report, exactly as if the maintenance
 *     step had run.
 *
 * The tests use an in-memory {@link EvolutionReportFs} fake so the
 * driver logic stays isolated from `node:fs`.
 *
 * **Validates: Requirements 8.9, 8.11, 8.14, 8.15**
 */
export {};
