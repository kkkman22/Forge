/**
 * Evolved rules staleness detection (pure functions).
 *
 * Provides logic to parse evolved-rules.md and flag rules that have not been
 * triggered for > STALE_THRESHOLD_SESSIONS sessions. Pure functions only; the
 * CLI driver (`scripts/flag-stale-evolved-rules.mjs`) handles IO.
 *
 * Used by:
 *   - Stop hook: periodic staleness detection
 *   - /forge learn: prompts user on session-start if stale rules exist
 *
 * Enforces `.forge/knowledge/evolved-rules.md` R1-style rule: retirement is
 * evidence-based, not calendar-based.
 */
export const STALE_THRESHOLD_SESSIONS = 5;
/**
 * Parse rule entries from evolved-rules.md body.
 *
 * Matches the rule format documented in the file header comment:
 *   ### R{N}: {title}
 *   ...
 *   **Last_triggered**: {YYYY-MM-DD}
 *
 * Ignores the "Retired Rules" section (case-insensitive header match).
 * Non-R{N} headings are silently skipped.
 */
export function parseRules(fileContent) {
    const rules = [];
    // Cut off the "Retired Rules" section if present
    const retiredIdx = fileContent.search(/^##\s+Retired Rules\b/im);
    const activeBody = retiredIdx === -1 ? fileContent : fileContent.slice(0, retiredIdx);
    const headingRe = /^###\s+(R\d+):\s*(.+?)$/gm;
    let match = headingRe.exec(activeBody);
    while (match !== null) {
        const id = match[1];
        const title = match[2].trim();
        const startIdx = match.index;
        // Find the end of this rule block (next ### or end of active body)
        headingRe.lastIndex = match.index + match[0].length;
        const nextMatch = headingRe.exec(activeBody);
        const endIdx = nextMatch ? nextMatch.index : activeBody.length;
        const block = activeBody.slice(startIdx, endIdx);
        rules.push({
            id,
            title,
            lastTriggered: extractField(block, "Last_triggered"),
            added: extractField(block, "Added"),
        });
        // Rewind so next iteration resumes from nextMatch
        headingRe.lastIndex = nextMatch ? nextMatch.index : activeBody.length;
        match = nextMatch;
    }
    return rules;
}
/**
 * Estimate sessions elapsed by counting directory entries under `.forge/runs/`
 * whose mtime is strictly later than `lastTriggeredIso`.
 *
 * This is an approximation: a "session" = one run directory. Sessions without
 * any `runs/` artifact are not counted. The caller provides session
 * directory names and their mtimes (ms epoch).
 */
export function estimateSessionsSince(lastTriggeredIso, runDirMtimes) {
    const lastMs = Date.parse(lastTriggeredIso);
    if (Number.isNaN(lastMs))
        return null;
    return runDirMtimes.filter((m) => m > lastMs).length;
}
/**
 * Evaluate staleness for every parsed rule.
 *
 * A rule is stale when `sessionsElapsed >= STALE_THRESHOLD_SESSIONS`.
 * Rules without a `Last_triggered` field are NOT auto-flagged (we can't tell
 * if they were just never triggered or just never updated).
 */
export function evaluateStaleness(rules, runDirMtimes) {
    return rules.map((rule) => {
        if (!rule.lastTriggered) {
            return {
                id: rule.id,
                title: rule.title,
                lastTriggered: null,
                sessionsElapsed: null,
                stale: false,
            };
        }
        const elapsed = estimateSessionsSince(rule.lastTriggered, [...runDirMtimes]);
        return {
            id: rule.id,
            title: rule.title,
            lastTriggered: rule.lastTriggered,
            sessionsElapsed: elapsed,
            stale: elapsed !== null && elapsed >= STALE_THRESHOLD_SESSIONS,
        };
    });
}
/**
 * Serialize the `stale_flags:` list back into frontmatter content.
 *
 * Returns the new frontmatter block (without the surrounding ---). Preserves
 * existing fields in source order. If no rules are stale, the `stale_flags`
 * field is omitted entirely (rather than written as `[]`) to keep the file
 * clean when the project is healthy.
 */
export function writeStaleFlagsToFrontmatter(originalFrontmatter, staleIds) {
    const lines = originalFrontmatter.split("\n");
    const filtered = lines.filter((l) => !/^stale_flags:/.test(l));
    if (staleIds.length === 0) {
        return filtered.join("\n");
    }
    const flagsLine = `stale_flags: [${staleIds.join(", ")}]`;
    // Insert before the trailing empty line (if any) or at the end
    const lastNonEmpty = filtered.map((l) => l.trim()).lastIndexOf("");
    if (lastNonEmpty === filtered.length - 1 && filtered.length > 1) {
        filtered.splice(filtered.length - 1, 0, flagsLine);
    }
    else {
        filtered.push(flagsLine);
    }
    return filtered.join("\n");
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * Extract the value of `**{field}**: {value}` from a block.
 * Returns null if the field is absent or empty.
 */
function extractField(block, field) {
    // Field names in the file use mixed case (Added / Last_triggered)
    const re = new RegExp(`\\*\\*${field}\\*\\*:\\s*(.+?)$`, "mi");
    const match = block.match(re);
    if (!match)
        return null;
    const value = match[1].trim();
    return value.length > 0 ? value : null;
}
//# sourceMappingURL=evolved-rules-staleness.js.map