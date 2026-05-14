/**
 * Zoom-out module — pure functions powering the `forge-zoom-out` skill.
 *
 * `forge-zoom-out` is an informational helper skill that lets the user
 * take a step back mid-execution and ask "where am I in the overall
 * architecture?". It produces a fixed three-section summary:
 *
 *   1. `整体位置`      — where the current code / decision sits in the system
 *   2. `当前职责`      — the single responsibility of the current focus
 *   3. `与邻居的边界`  — interfaces, invariants, and boundaries with neighbours
 *
 * This module is IO-free. Callers are responsible for:
 *   - invoking an `explore` subagent with the prompt produced by
 *     {@link buildZoomOutPrompt};
 *   - writing the pause / resume status transitions returned by
 *     {@link pauseForZoomOut} and {@link resumeFromZoomOut} back to
 *     the `.forge/status.md` file;
 *   - rendering the validated {@link ZoomOutOutput} with
 *     {@link renderZoomOut} into the user-visible reply.
 *
 * Key invariants (guarded by property tests):
 *   - `renderZoomOut` is deterministic (same input → same output).
 *   - Each of the three sections must have ≤ 5 non-empty lines; any
 *     overflow is reported by {@link validateZoomOutOutput} as a
 *     violation list so the driver can retry the subagent once.
 *   - `pauseForZoomOut` / `resumeFromZoomOut` form a round-trip on
 *     status frontmatter: a phase preserved in `original_phase` is
 *     restored verbatim.
 *   - `isZoomOutTrigger` recognises the documented trigger phrases in
 *     both English and Chinese (`zoom out`, `放大视角`, `讲整体`,
 *     `/forge zoom-out`).
 *
 * The skill never writes to `.forge/` other than the transient
 * `phase` field on the active status file. See `skills/forge-zoom-out/
 * SKILL.md` for the workflow and boundary with `forge-debug`.
 *
 * **Validates: Requirements 6.3, 6.4, 6.5, 6.6, 6.8**
 */
/**
 * Input to the zoom-out workflow. Populated by the driver from the
 * current status file and the user's trigger message.
 *
 *   - currentSkill:  name of the skill that was paused (e.g. `forge-build`)
 *   - currentTopic:  short topic label (usually the `current_task`)
 *   - focusedFile:   optional file path the user was last looking at;
 *                    helps the explore subagent narrow its scan
 */
export interface ZoomOutInput {
    currentSkill: string;
    currentTopic: string;
    focusedFile?: string;
}
/**
 * Three-section output produced by the explore subagent. Each field is
 * a free-form string; line count enforcement happens in
 * {@link validateZoomOutOutput}.
 */
export interface ZoomOutOutput {
    overallLocation: string;
    currentResponsibility: string;
    boundaryWithNeighbors: string;
}
/**
 * Result of validating a {@link ZoomOutOutput}.
 *
 *   - valid:       true iff every section has ≤ {@link MAX_LINES_PER_SECTION}
 *                  non-empty lines
 *   - violations:  human-readable reasons; empty iff valid
 */
export interface ZoomOutValidation {
    valid: boolean;
    violations: string[];
}
/**
 * Upper bound on non-empty lines per section, enforced by
 * {@link validateZoomOutOutput}. Anchored to requirement 6.4.
 */
export declare const MAX_LINES_PER_SECTION = 5;
/**
 * Frontmatter phase marker written while a zoom-out is in flight.
 */
export declare const ZOOM_OUT_PAUSED_PHASE = "zoom_out_paused";
/**
 * Build the prompt handed to the read-only explore subagent. The prompt
 * asks for exactly three sections, each ≤ 5 lines, and echoes the
 * user's current context so the agent can scope its scan.
 *
 * Pure: same input → same output. No IO.
 */
export declare function buildZoomOutPrompt(input: ZoomOutInput): string;
/**
 * Render a {@link ZoomOutOutput} into the fixed three-section Markdown
 * format. Trailing whitespace on each section is trimmed so the output
 * is deterministic regardless of how the subagent padded its reply.
 *
 * Pure: same input → same output. No IO.
 */
export declare function renderZoomOut(output: ZoomOutOutput): string;
/**
 * Validate that every section in a {@link ZoomOutOutput} has
 * ≤ {@link MAX_LINES_PER_SECTION} non-empty lines.
 *
 * A "non-empty line" is any line that, after trimming whitespace,
 * contains at least one character. Empty / whitespace-only lines are
 * free separators and do not count toward the budget. This mirrors
 * the counting rule used by `countEffectiveLines` in
 * `skill-length.ts` and is consistent with how humans perceive a
 * "5-line" section.
 *
 * Pure: same input → same output. No IO.
 */
export declare function validateZoomOutOutput(output: ZoomOutOutput): ZoomOutValidation;
/**
 * Produce a new status.md content that records the current phase under
 * `original_phase` and sets `phase: zoom_out_paused`. If the status has
 * no frontmatter, no phase field, or is already paused, the input is
 * returned unchanged so this helper is safe to call repeatedly.
 *
 * Contract:
 *   - Preserves the body verbatim.
 *   - Preserves every other frontmatter field verbatim.
 *   - Round-trip: `resumeFromZoomOut(pauseForZoomOut(s)) === s` when
 *     `s` has a concrete `phase` value and no existing `original_phase`.
 *
 * Pure: same input → same output. No IO.
 */
export declare function pauseForZoomOut(statusContent: string): string;
/**
 * Produce a new status.md content that restores `phase` to the value
 * stored under `original_phase` and removes the `original_phase` line.
 * If the status is not paused or has no `original_phase`, the input is
 * returned unchanged.
 *
 * Pure: same input → same output. No IO.
 */
export declare function resumeFromZoomOut(statusContent: string): string;
/**
 * Return `true` when `userInput` contains any known zoom-out trigger
 * phrase (case-insensitive substring match). Empty input returns
 * `false`.
 *
 * Pure: same input → same output. No IO.
 */
export declare function isZoomOutTrigger(userInput: string): boolean;
