/**
 * AC 14 / Requirement 7 — CLI flag compatibility regression.
 *
 * After the forge-loop driver swap (SDK → claude --print stream-json),
 * the public CLI surface must remain literally compatible:
 *
 *   - 22 reserved flags still parse with their original semantics
 *   - `--unknown-flag` is still rejected with non-zero exit
 *   - `--help` output structure (the snapshot) does not regress
 *   - any newly added flag has a default value (no breaking new flag)
 *
 * The 22-flag list is anchored to Requirement 7.1.
 */
export {};
