/**
 * Grill trigger detection — pure helpers for the `/forge` router entry.
 *
 * Two responsibilities:
 *
 *   1. Recognise free-form user messages that request a grill session
 *      (e.g. "grill me", "再挖深点", "/forge grill"). Detection runs
 *      case-insensitively and matches anywhere in the input so users
 *      can prepend / append the phrase naturally.
 *
 *   2. Produce a one-line suggestion string shown by the router when
 *      the classified tier is `full`. Lower tiers receive `null`
 *      because the grill prefix is only valuable for ambiguous,
 *      full-workflow tasks (Requirements R4.3).
 *
 * This module is IO-free and has no dependencies on the router or
 * state files — callers are free to invoke it on any string.
 *
 * **Validates: Requirements 4.3**
 */
/**
 * Return `true` when `userInput` contains any known grill trigger
 * keyword (case-insensitive substring match).
 *
 * Whitespace is not normalised, so `/forge  grill` (double space)
 * will NOT match. Callers that want looser matching should pre-trim
 * or collapse whitespace before invoking this function.
 *
 * Pure: no IO, no side effects. Empty input returns `false`.
 */
export declare function detectGrillTrigger(userInput: string): boolean;
/**
 * Return a user-facing suggestion string when `tier === "full"`,
 * encouraging the user to run `/forge grill` before entering the full
 * workflow. Returns `null` for `"light"` and `"standard"` because
 * those tiers don't benefit from the Socratic alignment loop.
 *
 * The exact copy is intentionally short (< 200 chars) so the router
 * can embed it in its classification summary without pushing other
 * information off-screen. Callers render the returned string verbatim.
 *
 * Pure: same input → same output.
 */
export declare function buildGrillSuggestion(tier: "light" | "standard" | "full"): string | null;
