import type { Frontmatter } from "./types.js";

export interface StalenessConfig {
  warning_days: number;
  critical_days: number;
  exempt_paths: readonly string[];
  /**
   * Max tolerated gap (days) between frontmatter `updated` and the file's
   * git last-modified date. When the body was touched in git but the
   * `updated` field was not bumped beyond this window, the doc is flagged
   * as a drift warning. Defaults to 7.
   */
  drift_days?: number;
}

/**
 * Returns the document body with its leading YAML frontmatter block removed.
 * A frontmatter block is a leading `---` fence … `---` fence. Files without
 * such a fence are returned verbatim. Used to decide whether a commit changed
 * only metadata (frontmatter) vs. actual content.
 */
export function stripFrontmatter(content: string): string {
  const lines = content.split("\n");
  if (lines.length === 0) return content;
  const first = lines[0].replace(/^\uFEFF/, "");
  if (first.trim() !== "---") return content;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      return lines.slice(i + 1).join("\n");
    }
  }
  return content;
}

/**
 * True when two revisions of a document have identical bodies, i.e. the
 * commit only touched the frontmatter block (add/edit/remove metadata). This
 * is more robust than hunk-line heuristics because it is unaffected by line
 * renumbering caused by inserting/removing a frontmatter block.
 */
export function isFrontmatterOnlyCommit(before: string, after: string): boolean {
  return stripFrontmatter(before) === stripFrontmatter(after);
}

/**
 * True when a commit made no *substantive* content change — it touched only
 * frontmatter metadata and/or whitespace (blank lines, trailing spaces) in
 * the body. Drift detection uses this so that formatting-only edits (e.g. a
 * bulk frontmatter backfill that also normalized a trailing blank line) do
 * not force a frontmatter `updated` bump. Substantive edits — any change
 * visible after trimming each line — still count.
 */
export function isNonSubstantiveCommit(before: string, after: string): boolean {
  const b = stripFrontmatter(before);
  const a = stripFrontmatter(after);
  if (a === b) return true;
  // Normalize per-line: trim trailing whitespace, drop empty lines, then join.
  // If the normalized bodies match, only whitespace differed.
  const norm = (s: string) =>
    s
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .join("\n");
  return norm(a) === norm(b);
}

const DEFAULT_DRIFT_DAYS = 7;

export function classifyStaleness(
  fm: Frontmatter,
  today: Date,
  config: StalenessConfig,
  filePath?: string,
  gitMtime?: Date,
): "fresh" | "warning" | "critical" | "invalid" {
  // Check exempt paths
  if (filePath && config.exempt_paths.includes(filePath)) {
    return "fresh";
  }

  const updated = fm.updated;
  if (!updated) return "invalid";

  // Validate YYYY-MM-DD format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(updated)) return "invalid";

  const updatedDate = new Date(`${updated}T00:00:00Z`);
  if (Number.isNaN(updatedDate.getTime())) return "invalid";

  const todayUtc = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );

  // Future date → invalid
  if (updatedDate > todayUtc) return "invalid";

  const diffMs = todayUtc.getTime() - updatedDate.getTime();
  const daysDiff = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // Age-based staleness takes precedence: a critically stale doc is already
  // failing the stronger signal, no need to also report drift.
  if (daysDiff > config.critical_days) return "critical";
  if (daysDiff > config.warning_days) return "warning";

  // Drift check: body changed in git more recently than frontmatter claims.
  // Catches the blind spot where a doc's text was edited but its `updated`
  // field was left stale (and the field date itself is still within the
  // fresh window, so age-based staleness misses it).
  if (gitMtime) {
    const gitUtc = new Date(
      Date.UTC(gitMtime.getUTCFullYear(), gitMtime.getUTCMonth(), gitMtime.getUTCDate()),
    );
    const driftMs = gitUtc.getTime() - updatedDate.getTime();
    const driftDays = Math.floor(driftMs / (1000 * 60 * 60 * 24));
    const tolerance = config.drift_days ?? DEFAULT_DRIFT_DAYS;
    if (driftDays > tolerance) return "warning";
  }

  return "fresh";
}
