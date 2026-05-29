/**
 * F7 / R12.5 — concurrency-bridge degradation ladder.
 *
 * Forge_Subcommand_Dispatcher observes `status_code=429` / `subtype=rate_limit`
 * events from the L0 stream-json output and steps `chunkedParallel`'s
 * `maxConcurrency` down a 3-step ladder per /forge subcommand:
 *
 *   1st 429: floor(current / 2)
 *   2nd 429: 2
 *   3rd 429: 1 (serial)
 *
 * Each step injects FORGE_MAX_PARALLEL_AGENTS_RUNTIME into the next child
 * process env and appends a `429-degrade` record to tool-health.md. The
 * runtime override is reset when the /forge subcommand finishes.
 */
export {};
