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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Regex that matches the marker comment line. The three capture groups
 * are `date | source | target`. Whitespace around the separators is
 * tolerated; `source` and `target` are captured non-greedily so a `#`
 * section inside `target` does not leak into the description.
 *
 * Tested against the spec format:
 *   `<!-- Evolution: YYYY-MM-DD | source: <id> | target: <skill>[#<section>] -->`
 */
const MARKER_REGEX =
  /^\s*<!--\s*Evolution:\s*(\S+?)\s*\|\s*source:\s*(.+?)\s*\|\s*target:\s*(.+?)\s*-->\s*$/;

/** Threshold for suggesting an ADR: ≥3 markers under the same `skill#section`. */
const SUGGEST_ADR_THRESHOLD = 3;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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
export function parseEvolutionMarkers(content: string, filePath = ""): EvolutionMarker[] {
  const markers: EvolutionMarker[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(MARKER_REGEX);
    if (match === null) continue;

    const [, date, source, target] = match;

    // Description body: lines after the comment, stopping at the next
    // HTML comment opener or end of file. Blank lines are preserved
    // internally; outer whitespace is trimmed when we join.
    const descLines: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trimStart().startsWith("<!--")) break;
      descLines.push(lines[j]);
    }

    markers.push({
      date: date.trim(),
      source: source.trim(),
      target: target.trim(),
      description: descLines.join("\n").trim(),
      filePath,
      lineNumber: i + 1,
    });
  }

  return markers;
}

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
export function validateEvolutionTarget(
  target: string,
  skillsRegistry: string[],
): ValidationResult {
  const baseName = target.split("#")[0].trim();
  if (baseName === "") {
    return { valid: false, orphan: true, reason: "target 为空" };
  }
  if (skillsRegistry.includes(baseName)) {
    return { valid: true, orphan: false };
  }
  return {
    valid: false,
    orphan: true,
    reason: `target skill "${baseName}" 不在 skills registry 中`,
  };
}

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
export function aggregateEvolutionMarkers(
  markersByFile: Map<string, EvolutionMarker[]>,
  skillsRegistry: string[],
  now: Date = new Date(),
): EvolutionReport {
  // Flatten in deterministic (sorted path) order.
  const allMarkers: EvolutionMarker[] = [];
  const sortedPaths = Array.from(markersByFile.keys()).sort();
  for (const path of sortedPaths) {
    const markers = markersByFile.get(path) ?? [];
    for (const m of markers) allMarkers.push(m);
  }

  const orphans: EvolutionMarker[] = [];
  const bySkillMap = new Map<string, EvolutionMarker[]>();
  const bySectionCount = new Map<string, number>();

  for (const m of allMarkers) {
    const validation = validateEvolutionTarget(m.target, skillsRegistry);
    if (validation.orphan) {
      orphans.push(m);
      continue;
    }
    const baseName = m.target.split("#")[0].trim();
    const existing = bySkillMap.get(baseName);
    if (existing === undefined) {
      bySkillMap.set(baseName, [m]);
    } else {
      existing.push(m);
    }
    const sectionKey = m.target.trim();
    bySectionCount.set(sectionKey, (bySectionCount.get(sectionKey) ?? 0) + 1);
  }

  const bySkill: EvolutionBySkill[] = Array.from(bySkillMap.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([targetSkill, details]) => {
      const suggestAdr = details.some(
        (m) => (bySectionCount.get(m.target.trim()) ?? 0) >= SUGGEST_ADR_THRESHOLD,
      );
      const sources = Array.from(new Set(details.map((m) => m.source))).sort();
      return {
        targetSkill,
        markerCount: details.length,
        sources,
        suggestAdr,
        details,
      };
    });

  return {
    generatedAt: now.toISOString(),
    totalMarkers: allMarkers.length,
    bySkill,
    orphans,
  };
}
