/**
 * F8 / R12.7 — `tool-health.md` writer tests.
 *
 * Coverage:
 *  - line format matches R12.6 spec (`<ts> · <subcommand> · <event> · <details>`)
 *  - single-process append-only invariant: prefix is preserved
 *  - lock acquired/released around write (lock file gone after success)
 *  - lock timeout when peer holds the lock past `timeoutMs`
 *  - stale lock recovery: lock older than `staleLockMs` is force-removed
 *  - 5-process true concurrent append safety (R12.7): 5 child node processes
 *    each write 4 records → final file has 20 distinct, complete lines, no
 *    interleaving, every prefix-step satisfies `next.startsWith(prev)`
 */
export {};
