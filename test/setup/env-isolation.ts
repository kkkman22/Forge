/**
 * Global test environment isolation.
 *
 * Some src modules fall back to host environment variables for path / data
 * resolution. When tests run inside a third-party plugin host (e.g. a Claude
 * Code context-mode cache sets `CLAUDE_PLUGIN_ROOT`), those fallbacks leak host
 * state into the test process and produce false failures — `resolveLibPath`
 * resolves against a non-existent root and every readFileSync ENOENTs.
 *
 * This setup file runs once per worker before any test, deleting the env vars
 * that act as *resolution roots* so tests always resolve against the repo
 * checkout (via `process.cwd()`). Feature-config vars (CMUX_*, CLAUDE_PLUGIN_DATA)
 * are intentionally untouched — tests that exercise those code paths stub them
 * explicitly.
 *
 * Individual tests may still re-set these in a `beforeEach` for targeted
 * coverage of the fallback branch; this file only guarantees a clean default.
 */
delete process.env.CLAUDE_PLUGIN_ROOT;
