/**
 * Prompt-defense scanner benchmark.
 *
 * BUDGET: p99 < 5ms, ops/sec > 2000 (Requirement 5.8)
 *
 * The scanner runs 39 regex patterns against every input. To exercise the
 * full library and realistic inputs, the benchmark covers four shapes:
 *
 *   1. empty string
 *   2. short benign task description (~60 chars)
 *   3. 1 KB benign document (representative of a typical task blurb)
 *   4. 10 KB benign document (the hard upper bound in the requirement)
 *
 * Budget is enforced in CI by `scripts/bench-compare.sh` (Task 6.3) and
 * by the performance property-based test (Task 3.3).
 */
export {};
