/**
 * Execution mode abstraction layer — pure functions for managing
 * interactive vs autonomous execution modes in the StatusFile.
 *
 * All functions are pure: they accept data and return results without
 * side effects. The SKILL layer is responsible for actual I/O.
 *
 * Design reference: loop-skills-fusion § execution-mode.ts
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7**
 */
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/** YAML frontmatter delimiter. */
const FRONTMATTER_DELIMITER = "---";
/** Default execution mode when mode field is missing or unparseable. */
const DEFAULT_MODE = "interactive";
/** Valid execution mode values. */
const VALID_MODES = new Set(["interactive", "autonomous"]);
/**
 * Preset strategies for each confirmation point in autonomous mode.
 * Ship stage defaults to "keep branch" as the safest delivery option.
 */
const AUTONOMOUS_PRESETS = {
    router_tier: "auto-detect",
    plan_approval: "auto-approve",
    build_pause: "continue",
    review_p0p1: "auto-fix",
    ship_method: "keep branch",
    // ★ 新增：重構流程
    refactor_scan_select: "auto-select-recommended",
    refactor_design_review: "auto-approve",
    refactor_apply_step: "continue",
    // ★ 新增：Bug 修復流程
    fix_report_confirm: "auto-confirm",
    fix_analyze_confirm: "auto-recommend",
    fix_apply_verify: "auto-verify",
};
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
/**
 * Parse YAML frontmatter from StatusFile content.
 * Returns the frontmatter block (without delimiters) and the body after it.
 * Returns null if no valid frontmatter is found.
 */
function parseFrontmatter(content) {
    const trimmed = content.trimStart();
    const leadingWhitespace = content.slice(0, content.length - trimmed.length);
    if (!trimmed.startsWith(FRONTMATTER_DELIMITER)) {
        return null;
    }
    const afterFirst = trimmed.slice(FRONTMATTER_DELIMITER.length);
    const closingIndex = afterFirst.indexOf(`\n${FRONTMATTER_DELIMITER}`);
    if (closingIndex === -1) {
        return null;
    }
    const frontmatter = afterFirst.slice(0, closingIndex);
    const afterClosing = afterFirst.slice(closingIndex + 1 + FRONTMATTER_DELIMITER.length);
    // Body starts after the closing delimiter line
    const bodyStart = afterClosing.indexOf("\n");
    const body = bodyStart === -1 ? "" : afterClosing.slice(bodyStart + 1);
    return { frontmatter, body, leadingWhitespace };
}
/**
 * Reconstruct StatusFile content from frontmatter lines and body.
 */
function buildContent(frontmatterLines, body, leadingWhitespace) {
    const fm = frontmatterLines.filter((line) => line.trim() !== "").join("\n");
    const frontmatterBlock = `${FRONTMATTER_DELIMITER}\n${fm}\n${FRONTMATTER_DELIMITER}`;
    if (body) {
        return `${leadingWhitespace}${frontmatterBlock}\n${body}`;
    }
    return `${leadingWhitespace}${frontmatterBlock}\n`;
}
/**
 * Parse frontmatter into individual lines, filtering out empty lines.
 */
function getFrontmatterLines(frontmatter) {
    return frontmatter.split("\n").filter((line) => line.trim() !== "");
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Extract the execution mode from StatusFile content.
 *
 * Parses the YAML frontmatter and looks for a `mode` field.
 * Returns `"interactive"` when the mode field is missing, the content
 * has no valid frontmatter, or the value is not a recognized mode.
 *
 * @param statusContent - Raw StatusFile content string.
 * @returns The current execution mode.
 */
export function getExecutionMode(statusContent) {
    const parsed = parseFrontmatter(statusContent);
    if (!parsed) {
        return DEFAULT_MODE;
    }
    const modeMatch = parsed.frontmatter.match(/^mode:\s*"?([^"\n]*)"?\s*$/m);
    if (!modeMatch) {
        return DEFAULT_MODE;
    }
    const value = modeMatch[1].trim();
    if (VALID_MODES.has(value)) {
        return value;
    }
    return DEFAULT_MODE;
}
/**
 * Write the mode field into StatusFile content.
 *
 * If the content has valid YAML frontmatter, updates or adds the `mode` field.
 * If the content has no frontmatter, wraps it in new frontmatter with the mode field.
 * Preserves all other fields in the frontmatter.
 *
 * @param statusContent - Raw StatusFile content string.
 * @param mode - The execution mode to write.
 * @returns Updated StatusFile content string.
 */
export function writeExecutionMode(statusContent, mode) {
    const parsed = parseFrontmatter(statusContent);
    if (!parsed) {
        // No frontmatter — create one with the mode field
        const trimmed = statusContent.trimStart();
        return `${FRONTMATTER_DELIMITER}\nmode: "${mode}"\n${FRONTMATTER_DELIMITER}\n${trimmed}`;
    }
    const lines = getFrontmatterLines(parsed.frontmatter);
    const modeLineIndex = lines.findIndex((line) => /^mode:\s/.test(line));
    if (modeLineIndex !== -1) {
        lines[modeLineIndex] = `mode: "${mode}"`;
    }
    else {
        lines.push(`mode: "${mode}"`);
    }
    return buildContent(lines, parsed.body, parsed.leadingWhitespace);
}
/**
 * Remove the mode field from StatusFile content.
 *
 * If the content has valid YAML frontmatter, removes the `mode` field line.
 * Preserves all other fields. If no frontmatter exists, returns content unchanged.
 *
 * @param statusContent - Raw StatusFile content string.
 * @returns Updated StatusFile content string with mode field removed.
 */
export function clearExecutionMode(statusContent) {
    const parsed = parseFrontmatter(statusContent);
    if (!parsed) {
        return statusContent;
    }
    const lines = getFrontmatterLines(parsed.frontmatter);
    const filtered = lines.filter((line) => !/^mode:\s/.test(line));
    return buildContent(filtered, parsed.body, parsed.leadingWhitespace);
}
/**
 * Resolve a confirmation point decision based on the current execution mode.
 *
 * In autonomous mode, all confirmation points return `action: "auto"` with
 * a preset strategy. The Ship stage preset is "keep branch" (safest option).
 *
 * In interactive mode, all confirmation points return `action: "wait_for_user"`.
 *
 * @param mode - The current execution mode.
 * @param point - The confirmation point to resolve.
 * @returns The confirmation decision.
 */
export function resolveConfirmation(mode, point) {
    if (mode === "autonomous") {
        return {
            action: "auto",
            preset: AUTONOMOUS_PRESETS[point],
        };
    }
    return { action: "wait_for_user" };
}
//# sourceMappingURL=execution-mode.js.map