/**
 * Tests for FailureClass parsing — conservative default + three-state parsing.
 *
 * Pins dynamic-replan-loop R1: parseFailureClass must never throw and must
 * default to "fixable_bug" when the field is missing or unrecognized
 * (conservative — avoids false-positive replan triggers, D4).
 *
 * **Pins: dynamic-replan-loop R1-AC4 (conservative default).**
 */
export {};
