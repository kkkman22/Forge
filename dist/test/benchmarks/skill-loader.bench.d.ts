/**
 * skill-loader.loadSkillsFromDir benchmark.
 *
 * BUDGET: p99 < 20 ms, ops/sec > 500 (Requirement 4.2, 4.3)
 *
 * Uses an in-memory `readFile` stub so the benchmark isolates the parsing
 * and validation path from disk I/O.
 */
export {};
