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
import { extractStringField, parseFrontmatter } from "./frontmatter.js";
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/**
 * The three section headings, in rendering order. Named tuple entries
 * pair each heading with the `ZoomOutOutput` field key so `renderZoomOut`
 * and `validateZoomOutOutput` stay in sync.
 */
const SECTIONS = [
    { heading: "整体位置", field: "overallLocation" },
    { heading: "当前职责", field: "currentResponsibility" },
    { heading: "与邻居的边界", field: "boundaryWithNeighbors" },
];
/**
 * Upper bound on non-empty lines per section, enforced by
 * {@link validateZoomOutOutput}. Anchored to requirement 6.4.
 */
export const MAX_LINES_PER_SECTION = 5;
/**
 * Trigger phrases that request a zoom-out session. Matched as
 * case-insensitive substrings so the user can prepend / append natural
 * language around them. Keep this list in sync with the "Triggers"
 * section of `skills/forge-zoom-out/SKILL.md`.
 */
const ZOOM_OUT_TRIGGER_KEYWORDS = [
    "/forge zoom-out",
    "zoom out",
    "放大视角",
    "讲整体",
];
/**
 * Frontmatter phase marker written while a zoom-out is in flight.
 */
export const ZOOM_OUT_PAUSED_PHASE = "zoom_out_paused";
// ---------------------------------------------------------------------------
// Prompt & rendering
// ---------------------------------------------------------------------------
/**
 * Build the prompt handed to the read-only explore subagent. The prompt
 * asks for exactly three sections, each ≤ 5 lines, and echoes the
 * user's current context so the agent can scope its scan.
 *
 * Pure: same input → same output. No IO.
 */
export function buildZoomOutPrompt(input) {
    const focusLine = input.focusedFile && input.focusedFile.trim() !== ""
        ? `Focused file: ${input.focusedFile}`
        : "Focused file: (not specified)";
    return [
        "You are the read-only explore subagent for a `/forge zoom-out` request.",
        "Produce a high-level architectural overview of the current focus in THREE sections.",
        "Each section must be Markdown prose with at most 5 non-empty lines — no lists, no code blocks.",
        "",
        `Current skill: ${input.currentSkill}`,
        `Current topic: ${input.currentTopic}`,
        focusLine,
        "",
        "Sections (use these exact headings, in this order):",
        "1. `## 整体位置` — where this code / decision sits in the overall system.",
        "2. `## 当前职责` — the single responsibility of the current focus.",
        "3. `## 与邻居的边界` — interfaces, invariants, and boundaries with upstream / downstream modules.",
        "",
        "Do NOT write to any file. Return only the three sections as Markdown text.",
    ].join("\n");
}
/**
 * Render a {@link ZoomOutOutput} into the fixed three-section Markdown
 * format. Trailing whitespace on each section is trimmed so the output
 * is deterministic regardless of how the subagent padded its reply.
 *
 * Pure: same input → same output. No IO.
 */
export function renderZoomOut(output) {
    const parts = [];
    for (let i = 0; i < SECTIONS.length; i++) {
        const section = SECTIONS[i];
        if (section === undefined)
            continue;
        const raw = output[section.field] ?? "";
        parts.push(`## ${section.heading}`);
        parts.push(raw.trimEnd());
        if (i < SECTIONS.length - 1) {
            parts.push("");
        }
    }
    return parts.join("\n");
}
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
export function validateZoomOutOutput(output) {
    const violations = [];
    for (const section of SECTIONS) {
        const raw = output[section.field] ?? "";
        const effectiveLines = raw.split("\n").filter((line) => line.trim() !== "").length;
        if (effectiveLines > MAX_LINES_PER_SECTION) {
            violations.push(`段落「${section.heading}」超过 ${MAX_LINES_PER_SECTION} 行（实际 ${effectiveLines} 行）`);
        }
    }
    return { valid: violations.length === 0, violations };
}
// ---------------------------------------------------------------------------
// Pause / resume helpers
// ---------------------------------------------------------------------------
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
export function pauseForZoomOut(statusContent) {
    const parsed = parseFrontmatter(statusContent);
    if (parsed === null)
        return statusContent;
    const currentPhase = extractStringField(parsed.raw, "phase");
    if (currentPhase === null || currentPhase === "")
        return statusContent;
    if (currentPhase === ZOOM_OUT_PAUSED_PHASE)
        return statusContent;
    const existingOriginal = extractStringField(parsed.raw, "original_phase");
    // Rewrite the `phase:` line to the paused sentinel.
    const rewrittenRaw = replacePhaseLine(parsed.raw, ZOOM_OUT_PAUSED_PHASE);
    // Ensure `original_phase:` is set to the pre-pause value. If it is
    // already present, leave it alone so nested pauses do not clobber
    // the top-most original.
    const withOriginal = existingOriginal === null
        ? appendFrontmatterField(rewrittenRaw, "original_phase", currentPhase)
        : rewrittenRaw;
    return rewrapFrontmatter(statusContent, withOriginal);
}
/**
 * Produce a new status.md content that restores `phase` to the value
 * stored under `original_phase` and removes the `original_phase` line.
 * If the status is not paused or has no `original_phase`, the input is
 * returned unchanged.
 *
 * Pure: same input → same output. No IO.
 */
export function resumeFromZoomOut(statusContent) {
    const parsed = parseFrontmatter(statusContent);
    if (parsed === null)
        return statusContent;
    const currentPhase = extractStringField(parsed.raw, "phase");
    const originalPhase = extractStringField(parsed.raw, "original_phase");
    if (originalPhase === null || originalPhase === "")
        return statusContent;
    if (currentPhase !== ZOOM_OUT_PAUSED_PHASE)
        return statusContent;
    const withRestoredPhase = replacePhaseLine(parsed.raw, originalPhase);
    const withoutOriginal = removeFrontmatterField(withRestoredPhase, "original_phase");
    return rewrapFrontmatter(statusContent, withoutOriginal);
}
// ---------------------------------------------------------------------------
// Trigger detection
// ---------------------------------------------------------------------------
/**
 * Return `true` when `userInput` contains any known zoom-out trigger
 * phrase (case-insensitive substring match). Empty input returns
 * `false`.
 *
 * Pure: same input → same output. No IO.
 */
export function isZoomOutTrigger(userInput) {
    if (userInput.length === 0)
        return false;
    const haystack = userInput.toLowerCase();
    for (const keyword of ZOOM_OUT_TRIGGER_KEYWORDS) {
        if (haystack.includes(keyword.toLowerCase()))
            return true;
    }
    return false;
}
// ---------------------------------------------------------------------------
// Internal frontmatter helpers
// ---------------------------------------------------------------------------
/**
 * Replace the value on a `<field>:` frontmatter line while preserving
 * surrounding whitespace. If the field is missing, the original raw
 * frontmatter is returned unchanged.
 */
function replacePhaseLine(raw, newPhase) {
    const lines = raw.split("\n");
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line === undefined)
            continue;
        if (/^phase:\s*/.test(line)) {
            lines[i] = `phase: ${newPhase}`;
            return lines.join("\n");
        }
    }
    return raw;
}
/**
 * Append a new `<field>: <value>` line to the frontmatter raw block.
 * Ensures the insertion preserves the original trailing newline shape.
 */
function appendFrontmatterField(raw, field, value) {
    const endsWithNewline = raw.endsWith("\n");
    const base = endsWithNewline ? raw : `${raw}\n`;
    return `${base}${field}: ${value}${endsWithNewline ? "" : ""}`;
}
/**
 * Remove a single-line `<field>: ...` entry from the frontmatter raw
 * block. No-op if the field is absent.
 */
function removeFrontmatterField(raw, field) {
    const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const lines = raw.split("\n");
    const pattern = new RegExp(`^${escaped}:\\s*`);
    const filtered = lines.filter((line) => !pattern.test(line));
    return filtered.join("\n");
}
/**
 * Splice a modified raw frontmatter block back into the original
 * status content, preserving the body verbatim.
 */
function rewrapFrontmatter(originalContent, newRaw) {
    // Locate the opening and closing `---` delimiters to preserve any
    // leading whitespace the original content may have had.
    const trimmed = originalContent.trimStart();
    const leading = originalContent.slice(0, originalContent.length - trimmed.length);
    const afterOpen = trimmed.slice("---".length);
    const closingIndex = afterOpen.indexOf("\n---");
    if (closingIndex === -1) {
        // Should never happen because caller already parsed successfully.
        return originalContent;
    }
    const bodyAndAfter = afterOpen.slice(closingIndex);
    return `${leading}---${newRaw}${bodyAndAfter}`;
}
//# sourceMappingURL=zoom-out.js.map