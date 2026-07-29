/**
 * Evolution report aggregation (Requirements 8.9, 8.11, 8.14, 8.15).
 *
 * Extracted from learn.ts for independent testability. The learn skill
 * reads the Evolution markers sprinkled across the reviews / progress /
 * findings zones, aggregates them via {@link aggregateEvolutionMarkers},
 * and emits a single `evolution-report.md` into the open zone. We
 * intentionally do NOT keep a historical snapshot: the report always
 * reflects the current on-disk state of the marker sources, so a user
 * running `/forge learn --maintain` to prune a stale marker sees it
 * disappear from the next report without any extra bookkeeping
 * (Requirement 8.15).
 */

import {
  aggregateEvolutionMarkers,
  type EvolutionMarker,
  type EvolutionReport,
  parseEvolutionMarkers,
} from "../evolution-marker.js";

/**
 * Filesystem contract required by {@link generateEvolutionReport}.
 *
 *   - `listFilesUnder(dir)` — recursively enumerate every file below
 *     `dir`. Paths may be absolute or relative; the aggregator sorts
 *     them for deterministic output so only stable ordering is
 *     required. Directories outside the caller-supplied roots are
 *     never visited.
 *   - `readFile(path)`       — return the UTF-8 content of a file.
 *                              Binary files are tolerated because
 *                              {@link parseEvolutionMarkers} ignores
 *                              lines that fail to match the marker
 *                              regex.
 *   - `exists(path)`         — true when the path resolves to a file
 *                              or directory the driver can list /
 *                              read. Used to silently skip missing
 *                              roots (fresh installs with no reviews
 *                              yet).
 *
 * The adapter is free to implement these however it pleases
 * (`readdirSync` + recursion, `fast-glob`, an in-memory Map); the
 * aggregator never inspects stat modes or mtimes.
 */
export interface EvolutionReportFs {
  listFilesUnder(dir: string): string[];
  readFile(path: string): string;
  exists(path: string): boolean;
}

/** Roots scanned by {@link generateEvolutionReport}, relative to `forgeRoot`. */
const EVOLUTION_MARKER_ROOTS = ["reviews", "progress", "findings"] as const;

/** Archive segment that must never contribute markers to the report. */
const EVOLUTION_ARCHIVE_SEGMENT = "/archive/";

/**
 * Walk the reviews / progress / findings directories under `forgeRoot`,
 * collect every Evolution marker they contain, and aggregate the
 * markers into an {@link EvolutionReport}.
 *
 * Behaviour:
 *   - Each root is consulted through `fs.exists` first so missing
 *     directories (typical for a fresh project) do not raise errors.
 *   - The `.forge/archive/**` subtree is skipped; archived sessions
 *     represent historical snapshots and re-surfacing their markers
 *     would contradict the "current state only" contract (Requirement
 *     8.15).
 *   - Per-file markers are produced by {@link parseEvolutionMarkers}
 *     and grouped by file path; the path is preserved so later
 *     rendering can cite it.
 *   - {@link aggregateEvolutionMarkers} is called with the shared
 *     `skillsRegistry` so unknown targets land in `orphans`.
 *
 * This is the driver seam the learn skill plugs into after its other
 * wrap-up steps; the file is written to `.forge/knowledge/evolution-
 * report.md` (open zone, always overwritten) by the caller using
 * {@link renderEvolutionReport}.
 *
 * **Validates: Requirements 8.9, 8.11, 8.14, 8.15**
 */
export function generateEvolutionReport(
  fs: EvolutionReportFs,
  forgeRoot: string,
  skillsRegistry: string[],
  now: Date = new Date(),
): EvolutionReport {
  const markersByFile = new Map<string, EvolutionMarker[]>();

  for (const segment of EVOLUTION_MARKER_ROOTS) {
    const root = joinPath(forgeRoot, segment);
    if (!fs.exists(root)) continue;
    const files = fs.listFilesUnder(root);
    for (const file of files) {
      if (file.includes(EVOLUTION_ARCHIVE_SEGMENT)) continue;
      if (!isMarkdownPath(file)) continue;
      let content: string;
      try {
        content = fs.readFile(file);
      } catch (_err: unknown) {
        // Deliberately swallow read errors so a single unreadable
        // file never aborts the aggregation (Requirement 8.12: write
        // failures degrade to warnings; by symmetry, read failures
        // here are non-fatal as well).
        continue;
      }
      const markers = parseEvolutionMarkers(content, file);
      if (markers.length === 0) continue;
      markersByFile.set(file, markers);
    }
  }

  return aggregateEvolutionMarkers(markersByFile, skillsRegistry, now);
}

/**
 * Render an {@link EvolutionReport} as the markdown content written to
 * `.forge/knowledge/evolution-report.md`.
 *
 * Layout (frozen by integration tests):
 *
 * ```markdown
 * ---
 * generated_at: "<ISO timestamp>"
 * total_markers: <n>
 * ---
 *
 * # Evolution Report
 *
 * ## 🚨 建议走 ADR 的高频进化点
 * ### forge-build (3 条)
 * - 来源：ep-..., ep-...
 * - 建议运行 `/forge decide` 评估是否升级为 ADR
 *
 * ## 一般进化候选
 * ### forge-ship (1 条)
 * - 来源：ep-...
 *
 * ## Orphan 标记
 * - `.forge/reviews/xxx.md:42` target `forge-nonexistent`
 * ```
 *
 * Empty sections are elided to keep the report short on quiet days,
 * except for the top-level header + frontmatter which are always
 * emitted so downstream tooling can rely on the shape.
 */
export function renderEvolutionReport(report: EvolutionReport): string {
  const lines: string[] = [];

  lines.push("---");
  lines.push(`generated_at: "${report.generatedAt}"`);
  lines.push(`total_markers: ${report.totalMarkers}`);
  lines.push("---");
  lines.push("");
  lines.push("# Evolution Report");
  lines.push("");

  const highlighted = report.bySkill.filter((s) => s.suggestAdr);
  const normal = report.bySkill.filter((s) => !s.suggestAdr);

  if (highlighted.length > 0) {
    lines.push("## 🚨 建议走 ADR 的高频进化点");
    lines.push("");
    for (const entry of highlighted) {
      appendBySkillSection(lines, entry, /* highlight */ true);
    }
  }

  if (normal.length > 0) {
    lines.push("## 一般进化候选");
    lines.push("");
    for (const entry of normal) {
      appendBySkillSection(lines, entry, /* highlight */ false);
    }
  }

  if (report.orphans.length > 0) {
    lines.push("## Orphan 标记");
    lines.push("");
    for (const marker of report.orphans) {
      const location = `${marker.filePath}:${marker.lineNumber}`;
      lines.push(`- \`${location}\` target \`${marker.target}\`（source: ${marker.source}）`);
    }
    lines.push("");
  }

  if (highlighted.length === 0 && normal.length === 0 && report.orphans.length === 0) {
    lines.push("_没有检测到 Evolution 标记。_");
    lines.push("");
  }

  // Ensure the file always ends with a single trailing newline.
  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

// ---------------------------------------------------------------------------
// Helpers (internal)
// ---------------------------------------------------------------------------

/**
 * Append a single `### <skill>` block to the growing report output. We
 * keep the layout identical between the highlight and normal sections
 * so reviewers only have to learn one shape; the only difference is
 * that the highlighted block spells out the ADR suggestion.
 */
function appendBySkillSection(
  lines: string[],
  entry: EvolutionReport["bySkill"][number],
  highlight: boolean,
): void {
  lines.push(`### ${entry.targetSkill} (${entry.markerCount} 条)`);
  if (entry.sources.length > 0) {
    lines.push(`- 来源：${entry.sources.join(", ")}`);
  }
  if (highlight) {
    lines.push("- 建议运行 `/forge decide` 走 ADR 三问筛");
  }
  lines.push("");
}

/**
 * Minimal path join that tolerates both POSIX and mixed slash input.
 * We intentionally avoid importing `node:path` so the function can be
 * used in adapters that supply pre-normalised paths.
 */
function joinPath(base: string, segment: string): string {
  if (base === "") return segment;
  const trimmedBase = base.replace(/[/\\]+$/, "");
  const trimmedSegment = segment.replace(/^[/\\]+/, "");
  return `${trimmedBase}/${trimmedSegment}`;
}

/**
 * Treat `.md` / `.markdown` files as potentially marker-bearing. Other
 * extensions are ignored so binary artefacts inside reviews/ (for
 * example screenshots committed alongside a report) do not slow down
 * aggregation.
 */
function isMarkdownPath(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".markdown");
}
