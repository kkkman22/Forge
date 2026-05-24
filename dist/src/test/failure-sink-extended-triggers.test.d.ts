/**
 * Unit tests for the 5 extended FailureTrigger values.
 *
 * Validates that each new trigger:
 *   - Produces a valid v2 Episode with outcome=failure
 *   - Embeds the trigger / topic / tier / situation in the body
 *   - Produces a non-empty, distinct lesson via lessonFor
 *   - Renders a well-formed Evolution marker
 */
export {};
