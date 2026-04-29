/**
 * Unit tests for the CLI entry point (`src/forge-loop-cli.ts`).
 *
 * The CLI module is a thin integration layer with many side effects
 * (process.exit, startup, spawn, etc.), so we test the validation and
 * configuration logic indirectly through the pure-function modules it
 * depends on: Commander argument parsing, git validation, sleep
 * prevention, worktree cleanup, and output schema construction.
 *
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 4.1, 4.2, 4.3, 4.6, 4.7, 7.1, 7.3, 7.4, 7.6**
 */
export {};
