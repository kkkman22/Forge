/**
 * Tests for skill-scheduler debug phase branch (dynamic-replan-loop R2).
 *
 * Covers the 4 routing paths + missing-field fallback + non-debug isolation.
 * The debug branch reads SchedulerInput.debugStatus / debugFailureClass
 * (populated by the caller from .forge/debug/<slug>.md frontmatter) and
 * routes to build/plan/aborted accordingly.
 *
 * **Pins: dynamic-replan-loop R2-AC1~AC4.**
 */
export {};
