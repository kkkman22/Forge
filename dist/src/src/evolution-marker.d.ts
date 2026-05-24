/**
 * Evolution markers — machine-readable pointers embedded in guarded /
 * open-zone files that signal "some SKILL's guidance should evolve
 * here, but not by an automated rewrite of the frozen zone".
 *
 * A marker is a single HTML comment line immediately followed by a
 * description block:
 *
 * ```markdown
 * <!-- Evolution: YYYY-MM-DD | source: <id> | target: <skill>[#<section>] -->
 * <description text spanning one or more lines>
 * ```
 *
 * The description block ends at the next HTML comment opener (`<!--`)
 * or end-of-file, whichever comes first. Surrounding whitespace is
 * trimmed on extraction.
 *
 * This module is IO-free. Three pure functions are exposed:
 *
 *   - {@link parseEvolutionMarkers}  — scan a document for markers.
 *   - {@link validateEvolutionTarget} — confirm a target references a
 *     known skill.
 *   - {@link aggregateEvolutionMarkers} — fold per-file marker arrays
 *     into a deterministic {@link EvolutionReport}.
 *
 * The driver layer walks the filesystem and feeds text in; rendering
 * the final `evolution-report.md` is handled by the learn driver that
 * consumes {@link EvolutionReport}.
 *
 * **Validates: Requirements 8.1, 8.3, 8.4, 8.8, 8.13, 8.14**
 */
/**
 * A single parsed Evolution marker.
 *
 *   - `date`:        ISO 8601 date string as written in the comment.
 *                    Not re-validated here; format drift is surfaced
 *                    downstream when the report is rendered.
 *   - `source`:      episode id, review id, or relative file path that
 *                    originated this marker.
 *   - `target`:      either a plain skill name (`forge-build`) or a
 *                    `<skill>#<section>` qualifier. Base name is
 *                    validated by {@link validateEvolutionTarget}.
 *   - `description`: body text collected from the lines after the
 *                    comment until the next `<!--` or EOF, trimmed.
 *   - `filePath`:    file the marker was found in. Defaults to `""`
 *                    when the caller does not supply a path.
 *   - `lineNumber`:  1-indexed line number of the comment line.
 *
 * @internal
 */
export interface EvolutionMarker {
    date: string;
    source: string;
    target: string;
    description: string;
    filePath: string;
    lineNumber: number;
}
/**
 * Result of validating a target string against the known skill
 * registry.
 *
 *   - `valid`:  true only when the target's base skill name is present
 *               in the registry.
 *   - `orphan`: true when the base skill name is not in the registry
 *               (either empty target or unknown skill).
 *   - `reason`: human-readable explanation for a non-valid result.
 *               Absent on valid targets.
 *
 * @internal
 */
export interface ValidationResult {
    valid: boolean;
    orphan: boolean;
    reason?: string;
}
/** @internal Per-target-skill rollup inside an {@link EvolutionReport}. */
export interface EvolutionBySkill {
    targetSkill: string;
    markerCount: number;
    sources: string[];
    suggestAdr: boolean;
    details: EvolutionMarker[];
}
/**
 * Aggregated report produced by {@link aggregateEvolutionMarkers}.
 *
 *   - `generatedAt`:  ISO timestamp of the aggregation run.
 *   - `totalMarkers`: total markers across all files, including
 *                     orphans.
 *   - `bySkill`:      per-skill rollups, sorted by `targetSkill`.
 *   - `orphans`:      markers whose target skill is unknown.
 *
 * @internal
 */
export interface EvolutionReport {
    generatedAt: string;
    totalMarkers: number;
    bySkill: EvolutionBySkill[];
    orphans: EvolutionMarker[];
}
/**
 * Scan `content` for Evolution markers and return them in document
 * order.
 *
 * The parser is tolerant: any line that fails to match
 * `MARKER_REGEX` is ignored, so feeding arbitrary markdown or
 * even binary-ish text never throws. The description block is
 * collected from the lines following the comment until the next
 * `<!--` or EOF; leading / trailing whitespace is trimmed.
 *
 * `filePath` is echoed onto each marker for downstream aggregation /
 * error reporting. When the caller does not supply a path (e.g. unit
 * tests), an empty string is used.
 *
 * @internal
 */
export declare function parseEvolutionMarkers(content: string, filePath?: string): EvolutionMarker[];
/**
 * Check whether `target` points at a known skill in `skillsRegistry`.
 *
 * The target may be either `<skill_name>` or `<skill_name>#<section>`;
 * only the base name (before `#`) is matched against the registry. An
 * empty base name is treated as an orphan so malformed input cannot
 * pass validation silently.
 *
 * Returns `{ valid, orphan, reason? }`:
 *   - `{ valid: true, orphan: false }` when the base name is in the registry.
 *   - `{ valid: false, orphan: true, reason: ... }` otherwise.
 *
 * @internal
 */
export declare function validateEvolutionTarget(target: string, skillsRegistry: string[]): ValidationResult;
/**
 * Aggregate a collection of per-file markers into a deterministic
 * {@link EvolutionReport}.
 *
 *   - Input files are consumed in ascending path order so the
 *     aggregation result is fully deterministic for a given input.
 *   - Each marker is classified via {@link validateEvolutionTarget}:
 *     valid targets are grouped by base skill name, orphans are
 *     collected in a separate list.
 *   - `suggestAdr` is set on a per-skill rollup when at least one
 *     `skill[#section]` qualifier inside that rollup has ≥3 markers.
 *     The threshold reflects the rule "≥3 pointers at the same
 *     section → candidate for ADR".
 *   - `sources` is a deduplicated, lexicographically sorted list of
 *     source ids.
 *   - Output `bySkill` is sorted by `targetSkill` (locale-insensitive
 *     lexicographic).
 *
 * `now` defaults to `new Date()`; callers who need stable snapshots
 * (e.g. tests, deterministic learn output) should supply a fixed
 * clock.
 *
 * @internal
 */
export declare function aggregateEvolutionMarkers(markersByFile: Map<string, EvolutionMarker[]>, skillsRegistry: string[], now?: Date): EvolutionReport;
