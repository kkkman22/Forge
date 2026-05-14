/**
 * Evolved rules violation detection (pure functions).
 *
 * Scans recent Events_NDJSON / session logs for patterns that indicate
 * an evolved rule was either violated or successfully guarded. When found,
 * produces a map of `ruleId → ISO date` to update each rule's
 * `Last_triggered` field.
 *
 * Rationale: `Last_triggered` should reflect real evidence, not manual edits.
 * Every rule has a declarative `patterns[]` specification that describes what
 * text signals a trigger. Matches drive the `Last_triggered` update.
 *
 * Keeping the logic pure enables:
 *   - property tests against arbitrary event streams
 *   - local preview of "which rules would trigger" before committing
 *   - future integration with CI (fail PR on never-triggered rules)
 */
/** A declarative pattern that signals a rule was observed. */
export interface RuleSignal {
    /** Rule ID this signal belongs to (e.g. "R1"). */
    ruleId: string;
    /**
     * Regex source (string). Case-insensitive match is always applied.
     * Matches against a single event's serialized text.
     */
    pattern: string;
    /**
     * Type of match:
     *   - "violation": rule was broken (AI did the forbidden thing)
     *   - "guard":     rule was successfully enforced (hook blocked, AI self-corrected)
     * Both types count as "triggered" — presence in the session means the
     * rule is still relevant.
     */
    type: "violation" | "guard";
}
/** Output of the violation scanner. */
export interface TriggerReport {
    /** rule id → most recent ISO date (YYYY-MM-DD) where a signal matched. */
    triggers: Map<string, string>;
    /** Per-rule counts, useful for staleness trending. */
    counts: Map<string, {
        violations: number;
        guards: number;
    }>;
}
/**
 * Built-in signal catalogue for the canonical R1-R5 (post-retirement) rules.
 *
 * Patterns are intentionally conservative: they match text that would ONLY
 * appear when the rule's specific concern is at play. We prefer false
 * negatives (under-count) to false positives (which would artificially keep
 * retired rules "fresh").
 *
 * Reference: `.forge/knowledge/evolved-rules.md`
 */
export declare const DEFAULT_SIGNALS: readonly RuleSignal[];
/**
 * Scan arbitrary text (concatenated session logs / event lines / PR diffs)
 * for rule signals.
 *
 * Each signal's regex is applied with `gi` flags; the scanner emits a trigger
 * for the rule's id when any match occurs. The `sessionDate` parameter
 * should be the ISO date representing "when this scan corresponds to" — it
 * becomes the new `Last_triggered` value for matching rules.
 */
export declare function scanForTriggers(text: string, sessionDate: string, signals?: readonly RuleSignal[]): TriggerReport;
/**
 * Apply a TriggerReport to a rule file body by updating each rule's
 * `Last_triggered:` line. Returns the new body.
 *
 * Non-matching rules keep their existing `Last_triggered` value. Rules
 * without a `Last_triggered` line get one inserted after `**Confidence**:`.
 * If no `**Confidence**:` anchor exists (shouldn't happen with compliant
 * rules), the line is appended at the end of the rule block.
 */
export declare function applyTriggerUpdates(body: string, report: TriggerReport): string;
