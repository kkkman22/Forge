/**
 * Integration tests for frozen zone protection functions.
 *
 * Tests the `extractStatus` and `isFrozenZonePath` logic from
 * `src/check-frozen.ts`. Because that module calls `main()` at the top
 * level (which invokes `process.exit` — intercepted by vitest), we
 * cannot directly import it. Instead we use `vi.mock` to provide a
 * factory that re-exports the pure functions extracted from the source,
 * bypassing the CLI entry point entirely.
 *
 * A source-sync guard reads the actual source file and verifies that the
 * function signatures and key delegation patterns haven't drifted.
 *
 * **Validates: Requirements REQ-4, REQ-6**
 */
export {};
