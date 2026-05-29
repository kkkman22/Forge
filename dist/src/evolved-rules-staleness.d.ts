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
export declare const STALE_THRESHOLD_SESSIONS = 5;
/** A parsed rule from evolved-rules.md (minimal fields for staleness). */
export interface ParsedRule {
    id: string;
    title: string;
    lastTriggered: string | null;
    added: string | null;
}
/** Result of staleness evaluation for a single rule. */
export interface StalenessVerdict {
    id: string;
    title: string;
    lastTriggered: string | null;
    sessionsElapsed: number | null;
    stale: boolean;
}
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
export declare function parseRules(fileContent: string): ParsedRule[];
/**
 * Estimate sessions elapsed by counting directory entries under `.forge/runs/`
 * whose mtime is strictly later than `lastTriggeredIso`.
 *
 * This is an approximation: a "session" = one run directory. Sessions without
 * any `runs/` artifact are not counted. The caller provides session
 * directory names and their mtimes (ms epoch).
 */
export declare function estimateSessionsSince(lastTriggeredIso: string, runDirMtimes: number[]): number | null;
/**
 * Evaluate staleness for every parsed rule.
 *
 * A rule is stale when `sessionsElapsed >= STALE_THRESHOLD_SESSIONS`.
 * Rules without a `Last_triggered` field are NOT auto-flagged (we can't tell
 * if they were just never triggered or just never updated).
 */
export declare function evaluateStaleness(rules: readonly ParsedRule[], runDirMtimes: readonly number[]): StalenessVerdict[];
/**
 * Serialize the `stale_flags:` list back into frontmatter content.
 *
 * Returns the new frontmatter block (without the surrounding ---). Preserves
 * existing fields in source order. If no rules are stale, the `stale_flags`
 * field is omitted entirely (rather than written as `[]`) to keep the file
 * clean when the project is healthy.
 */
export declare function writeStaleFlagsToFrontmatter(originalFrontmatter: string, staleIds: readonly string[]): string;
