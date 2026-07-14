/**
 * Learn engine — core logic extracted from forge-learn/SKILL.md.
 *
 * Implements:
 *   - generateKnowledgeDocument:    Creates a knowledge document with valid YAML frontmatter
 *   - maintainKnowledgeBase:        Enforces knowledge base invariants (doc limit + confidence floor)
 *   - extractSessionTermCandidates: Surfaces candidate glossary terms from a learn session
 *   - buildNewGlossaryTerm:         Lifts a candidate into a GlossaryTerm draft ready for mergeTerm
 *
 * Property 13: 知识文档格式有效性
 *   - YAML frontmatter must contain: title, tags, date, confidence
 *   - confidence must be in [0.3, 0.9] range
 *   **Validates: Requirements 9.2, 9.3**
 *
 * Property 14: 知识库维护不变量
 *   - After maintenance: doc count ≤ limit (default 20)
 *   - After maintenance: no pattern with confidence < 0.3
 *   **Validates: Requirements 9.4, 9.5**
 *
 * Glossary writeback (Requirement 1.6): the learn skill scans the session's
 * decisions / findings / reviews / progress / prior sessions for TitleCase,
 * PascalCase and contiguous CJK candidate terms that are not yet present in
 * `.forge/glossary.md`, and presents them to the user for confirmation
 * before calling `mergeTerm(..., "append")`.
 *   **Validates: Requirements 1.6**
 *
 * Sub-modules (extracted for independent testability):
 *   - learn/validation.ts       — date validation, frontmatter validation, knowledge base maintenance
 *   - learn/feedback-analysis.ts — skill feedback analysis and cross-validation
 */

// ---------------------------------------------------------------------------
// Re-export from extracted sub-modules
// ---------------------------------------------------------------------------

export {
  analyzeSkillFeedback,
  type CommandStats,
  crossValidateFailures,
  FAILURE_RATE_ALERT_THRESHOLD,
  type FeedbackAnalysis,
  type SkillFeedbackEntry,
} from "./learn/feedback-analysis.js";
export {
  DEFAULT_KNOWLEDGE_LIMIT,
  generateKnowledgeDocument,
  type InstinctPattern,
  isValidCalendarDate,
  type KnowledgeBaseState,
  type KnowledgeDocument,
  type KnowledgeFrontmatter,
  MAX_CONFIDENCE,
  type MaintenanceResult,
  MIN_CONFIDENCE,
  maintainKnowledgeBase,
  validateKnowledgeFrontmatter,
} from "./learn/validation.js";

import type { Episode, EpisodeOutcome, EpisodeTier } from "./episode.js";
import { generateEpisodeId } from "./episode.js";
import {
  aggregateEvolutionMarkers,
  type EvolutionMarker,
  type EvolutionReport,
  parseEvolutionMarkers,
} from "./evolution-marker.js";
import { findStaleterms, type Glossary, type GlossaryTerm } from "./glossary.js";

// P3-2: SessionData moved to session-types.ts to break the learn ↔
// glossary-hook barrel cycle. Re-exported here for backward compatibility.
export type { SessionData } from "./session-types.js";

import {
  DEFAULT_EXTRACTION_RULES,
  extractCandidates,
  filterCandidates,
  type TermCandidate,
} from "./glossary-extractor.js";
import type { SessionData } from "./session-types.js";

export { renderGlossaryConflictPrompt, runGlossaryCheck } from "./glossary-hook.js";

import { findUpgradableEpisodes, type Pattern } from "./pattern-stats.js";

// ---------------------------------------------------------------------------
// Glossary writeback (Requirement 1.6)
// ---------------------------------------------------------------------------

/**
 * Aggregated text sources consumed by {@link extractSessionTermCandidates}.
 *
 * All fields are optional so callers can feed in only the sources they have
 * access to. Each entry is treated as free-form markdown / prose and is
 * concatenated with single newlines before extraction.
 *
 *   - decisions: ADR / decision document bodies (e.g. `.forge/decisions/*.md`)
 *   - findings:  finding document bodies (e.g. `.forge/findings/*.md`)
 *   - reviews:   review document bodies (e.g. `.forge/reviews/*.md`)
 *   - progress:  progress notes (e.g. `.forge/progress/*.md`)
 *   - sessions:  existing session journals (e.g. `.forge/knowledge/sessions/*.md`)
 */
/**
 * Identify candidate glossary terms surfaced by a single learn session.
 *
 * Behaviour:
 *   1. All non-empty source strings are concatenated with `\n` into a single
 *      corpus.
 *   2. {@link extractCandidates} is invoked with the glossary's canonical
 *      terms + aliases as the "already known" list so pre-defined concepts
 *      are never surfaced again.
 *   3. {@link filterCandidates} applies {@link DEFAULT_EXTRACTION_RULES}
 *      (minFrequency=2, minLength=3, exclude camelCase / underscore names,
 *      cap at 10) to produce a deterministic, ranked shortlist.
 *
 * The result is the subset of candidate terms that (a) passed the
 * heuristic filters and (b) are genuinely new to the glossary. Callers
 * should present the list to the user for confirmation before promoting
 * individual entries via `mergeTerm(glossary, term, "append")`.
 *
 * This function is pure: same inputs → same output, no IO.
 *
 * **Validates: Requirements 1.6**
 */
export function extractSessionTermCandidates(
  sessionData: SessionData,
  glossary: Glossary,
): TermCandidate[] {
  const chunks: string[] = [];
  const pushAll = (values: string[] | undefined): void => {
    if (values === undefined) return;
    for (const value of values) {
      if (value.length > 0) chunks.push(value);
    }
  };

  pushAll(sessionData.decisions);
  pushAll(sessionData.findings);
  pushAll(sessionData.reviews);
  pushAll(sessionData.progress);
  pushAll(sessionData.sessions);

  if (chunks.length === 0) return [];

  const text = chunks.join("\n");
  const knownNames = collectGlossaryNamesAndAliases(glossary);

  const raw = extractCandidates(text, knownNames);
  return filterCandidates(raw, DEFAULT_EXTRACTION_RULES);
}

/**
 * Convert a {@link TermCandidate} into a {@link GlossaryTerm} draft suitable
 * for appending to the glossary via `mergeTerm(..., "append")`.
 *
 * Field mapping:
 *   - `term`          = `candidate.term` (the first observed surface form)
 *   - `definition`    = first 200 characters of `candidate.context`, trimmed.
 *                        This is an intentionally rough placeholder — the
 *                        learn skill surfaces the draft to the user so they
 *                        can refine the wording before it is merged.
 *   - `last_updated`  = `now` formatted as `YYYY-MM-DD` in UTC
 *   - `source_session`= provided `sessionFile` when present (omitted when
 *                        undefined or blank)
 *
 * The `aliases` field is deliberately left unset: the extractor cannot
 * reliably infer alternative surface forms, so the user supplies those in
 * the confirmation step.
 *
 * This function is pure.
 *
 * **Validates: Requirements 1.6**
 */
export function buildNewGlossaryTerm(
  candidate: TermCandidate,
  now: Date,
  sessionFile?: string,
): GlossaryTerm {
  const definition = candidate.context.slice(0, 200).trim();
  const entry: GlossaryTerm = {
    term: candidate.term,
    definition,
    last_updated: toIsoDate(now),
  };
  if (sessionFile !== undefined && sessionFile.trim().length > 0) {
    entry.source_session = sessionFile.trim();
  }
  return entry;
}

/**
 * Collect every canonical term and alias from a glossary into a single
 * string array. Blank entries are filtered out so the extractor's
 * "existing terms" set is clean.
 */
function collectGlossaryNamesAndAliases(glossary: Glossary): string[] {
  const out: string[] = [];
  for (const term of glossary.terms) {
    if (term.term.trim().length > 0) out.push(term.term);
    if (term.aliases !== undefined) {
      for (const alias of term.aliases) {
        if (alias.trim().length > 0) out.push(alias);
      }
    }
  }
  return out;
}

/**
 * Format a `Date` as an ISO date (YYYY-MM-DD) in UTC. Using UTC keeps
 * output deterministic across developer timezones.
 */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Stale glossary-term archival (Requirement 1.11)
// ---------------------------------------------------------------------------

/** Default maximum age, in days, before an active term is considered stale. */
const DEFAULT_STALE_TERM_MAX_AGE_DAYS = 30;

/**
 * Result of {@link proposeStaleTerms}.
 *
 *   - `staleTerms`: the (possibly empty) list of active terms whose
 *     `last_updated` is older than `maxAgeDays` before `now`. Already
 *     archived entries are never surfaced because they live under a
 *     separate `archivedTerms` list.
 *   - `prompt`: a short, human-facing message the caller can show the
 *     user before asking for archival confirmation. Empty when there are
 *     no stale terms, so callers can use `prompt.length > 0` as the
 *     "anything to do?" signal without reading `staleTerms.length`.
 */
export interface ProposeStaleTermsResult {
  staleTerms: GlossaryTerm[];
  prompt: string;
}

/**
 * Identify stale glossary terms and render a prompt the learn skill can
 * show the user before archival.
 *
 * This is a thin wrapper around {@link findStaleterms} that adds the
 * human-facing messaging layer required by the forge-learn execution
 * flow (see SKILL.md §9 "Glossary 陈旧术语归档"). It is intentionally
 * pure so the same inputs always produce the same prompt, independent
 * of locale or clock.
 *
 * Behaviour:
 *   - Only `glossary.terms` (the active set) is inspected. Archived
 *     terms already live under `glossary.archivedTerms` and must not be
 *     re-proposed.
 *   - The prompt is written in Chinese to match the SKILL.md voice and
 *     references the effective threshold (`maxAgeDays ?? 30`) so the
 *     user sees the exact age window the detector used.
 *   - When no terms are stale, `prompt` is the empty string. Callers
 *     should treat this as "nothing to do" and not surface anything to
 *     the user.
 *
 * **Validates: Requirements 1.11**
 */
export function proposeStaleTerms(
  glossary: Glossary,
  now: Date,
  maxAgeDays: number = DEFAULT_STALE_TERM_MAX_AGE_DAYS,
): ProposeStaleTermsResult {
  const staleTerms = findStaleterms(glossary, now, maxAgeDays);
  if (staleTerms.length === 0) {
    return { staleTerms, prompt: "" };
  }

  const names = staleTerms.map((t) => t.term).join(", ");
  const prompt = `发现 ${staleTerms.length} 个陈旧术语（>${maxAgeDays} 天未更新），建议归档：${names}`;

  return { staleTerms, prompt };
}

// ---------------------------------------------------------------------------
// Episode / pattern lifecycle integration (Requirements 7.9, 7.10, 7.11, 7.15)
// ---------------------------------------------------------------------------

// The learn skill is the convergence point for the episode + pattern
// lifecycle pieces introduced by Phase 4.1:
//
//   - After a session completes, synthesise a v2 episode summarising the
//     outcome so `knowledge/sessions/<date>-<topic>.md` gets a
//     structured record without the user having to hand-author one
//     (Requirement 7.9).
//   - During wrap-up, offer the user a chance to archive stale or
//     decayed patterns and to promote recurring episode clusters into
//     new instinct patterns (Requirements 7.10, 7.11).
//   - The user-facing prompt stays lightweight: no mandatory 1-10
//     rating, only a short free-form failure reason when the outcome is
//     a failure (Requirement 7.15).
//
// Everything below is pure. The driver layer supplies the clock, reads
// the existing patterns / episodes, performs user confirmation and
// writes back to disk.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single phase transition recorded in `.forge/status.md` during the
 * session. The learn skill walks this history backwards to recover the
 * most relevant skill to attribute the episode to.
 *
 *   - `phase`: short phase token, e.g. `"build"`, `"review"`, `"ship"`.
 *   - `at`:    ISO 8601 timestamp of the transition (free-form; only
 *              stored so downstream tooling can render an audit trail).
 */
export interface PhaseTransition {
  phase: string;
  at: string;
}

/**
 * Outcome-bearing fragments of the session state, as recorded by the
 * upstream skills (`forge-review`, `forge-test`, `forge-ship`). Each
 * field is optional because the session may have stopped short — for
 * example an aborted task never reaches `ship`.
 */
export interface SessionPhaseHistory {
  phases: PhaseTransition[];
  reviewResult?: "pass" | "fail";
  testResult?: "pass" | "fail";
  shipResult?: "shipped" | "blocked";
}

/**
 * Session-level metadata required to address the generated episode.
 * `date` must be an ISO date (`YYYY-MM-DD`) so `generateEpisodeId`
 * produces a stable `ep-YYYY-MM-DD-NNN` identifier.
 */
export interface SessionMeta {
  topic: string;
  tier: EpisodeTier;
  date: string;
}

/**
 * Full pattern draft + traceability information for a single upgrade
 * suggestion. The driver surfaces `draft` to the user for confirmation;
 * `sourceEpisodes` lets the UI explain which episodes triggered the
 * suggestion; `clusterKey` is the deterministic dedup key returned by
 * {@link findUpgradableEpisodes}.
 */
export interface PatternUpgradeDraft {
  clusterKey: string;
  sourceEpisodes: Episode[];
  draft: Pattern;
}

/**
 * Prompt-shape declaration the learn skill uses to drive the final
 * user interaction. The rating field is intentionally always optional
 * (Requirement 7.15); only `failure` outcomes require a short free-form
 * reason so we capture useful context without taxing successful flows.
 */
export interface LearnPromptConfig {
  outcome: EpisodeOutcome;
  requireUserRating: boolean;
  requireFailureReason: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Phase tokens that should never be used as the episode's attributed
 * skill. `completed` is a terminal marker and `learn` is the current
 * skill, so both are skipped when walking the phase history.
 */
const NON_ATTRIBUTABLE_PHASES: ReadonlySet<string> = new Set(["completed", "learn"]);

/** Fallback skill used when the phase history attributes no usable phase. */
const DEFAULT_EPISODE_SKILL = "forge-learn";

/**
 * Prior strength for the Beta-mean confidence used when bootstrapping a
 * fresh pattern from an upgrade draft. Kept local so we do not re-import
 * the pattern-stats internals.
 */
const PATTERN_DRAFT_BETA_ALPHA = 2;
const PATTERN_DRAFT_BETA_BETA = 2;
const PATTERN_DRAFT_DEFAULT_DECAY = 0.5;

// ---------------------------------------------------------------------------
// buildEpisodeFromSession (Requirement 7.9)
// ---------------------------------------------------------------------------

/**
 * Build a schema_version=2 {@link Episode} from the session's phase
 * history and the user-supplied narrative (`situation`, `lesson`).
 *
 * Outcome inference follows the mapping in the design doc:
 *   - `shipResult === "shipped"` → `"success"`
 *   - `shipResult === "blocked"` OR `testResult === "fail"` → `"partial"`
 *   - `reviewResult === "fail"` without a subsequent recovery → `"failure"`
 *   - any other state → `"success"`
 *
 * Skill attribution scans `phaseHistory.phases` from the end, skipping
 * terminal (`completed`) and current-skill (`learn`) markers, and
 * prefixes the resulting phase with `forge-`. When the history has no
 * attributable phase we fall back to `forge-learn`.
 *
 * The function is pure: same inputs always yield the same episode.
 *
 * **Validates: Requirements 7.9**
 */
export function buildEpisodeFromSession(
  meta: SessionMeta,
  phaseHistory: SessionPhaseHistory,
  situation: string,
  lesson: string,
  sequenceInDay: number,
): Episode {
  return {
    schema_version: 2,
    id: generateEpisodeId(meta.date, sequenceInDay),
    date: meta.date,
    skill: deriveSkillFromPhaseHistory(phaseHistory.phases),
    tier: meta.tier,
    situation,
    lesson,
    outcome: inferOutcomeFromPhaseHistory(phaseHistory),
    body: "",
  };
}

/**
 * Infer the episode outcome from the session's review/test/ship signals.
 * Exported as an internal helper only; callers should route through
 * {@link buildEpisodeFromSession} so the logic stays in one place.
 */
function inferOutcomeFromPhaseHistory(history: SessionPhaseHistory): EpisodeOutcome {
  if (history.shipResult === "shipped") return "success";
  if (history.shipResult === "blocked") return "partial";
  if (history.testResult === "fail") return "partial";
  if (history.reviewResult === "fail") return "failure";
  return "success";
}

/**
 * Walk the phase history from the end and return the first phase that
 * is neither `completed` nor `learn`, prefixed with `forge-`. When the
 * history is empty or only contains non-attributable phases, return the
 * default skill.
 */
function deriveSkillFromPhaseHistory(phases: PhaseTransition[]): string {
  for (let i = phases.length - 1; i >= 0; i -= 1) {
    const phase = phases[i].phase.trim();
    if (phase.length === 0) continue;
    if (NON_ATTRIBUTABLE_PHASES.has(phase)) continue;
    return phase.startsWith("forge-") ? phase : `forge-${phase}`;
  }
  return DEFAULT_EPISODE_SKILL;
}

// ---------------------------------------------------------------------------
// archivePatternByName (Requirements 7.10, 7.14)
// ---------------------------------------------------------------------------

/**
 * Result of {@link archivePatternByName}: the updated active list plus
 * every pattern that is now considered archived. Archival is a move,
 * not a delete — both the original non-matching entries and the freshly
 * archived entry survive somewhere in the return value.
 */
export interface ArchivePatternResult {
  active: Pattern[];
  archived: Pattern[];
}

/**
 * Move the pattern whose name matches `name` (case-insensitive) from
 * the active list into the archived list. When no matching pattern is
 * found the result is a pass-through: `active` equals the input and
 * `archived` is empty.
 *
 * Only the first match is moved — pattern names are expected to be
 * unique within `knowledge/instincts.md`, and if they are not the
 * duplicates are left in the active list so the user can resolve the
 * ambiguity manually.
 *
 * Pure function: the input arrays are never mutated.
 *
 * **Validates: Requirements 7.10, 7.14**
 */
export function archivePatternByName(patterns: Pattern[], name: string): ArchivePatternResult {
  const needle = name.trim().toLowerCase();
  if (needle.length === 0) {
    return { active: [...patterns], archived: [] };
  }
  const active: Pattern[] = [];
  const archived: Pattern[] = [];
  let moved = false;
  for (const pattern of patterns) {
    if (!moved && pattern.name.trim().toLowerCase() === needle) {
      archived.push(pattern);
      moved = true;
      continue;
    }
    active.push(pattern);
  }
  return { active, archived };
}

// ---------------------------------------------------------------------------
// buildPatternUpgradeDrafts (Requirement 7.11)
// ---------------------------------------------------------------------------

/**
 * Detect episode clusters that warrant a new instinct pattern and
 * promote each cluster's partial draft into a full {@link Pattern}
 * ready for confirmation + append.
 *
 * Under the hood this calls {@link findUpgradableEpisodes} with the
 * default window (60 days) and minimum occurrence count (3). Each
 * resulting cluster is enriched with a deterministic `pattern_id` of
 * the form `pat-YYYY-MM-DD-NNN`, where `NNN` is the 1-based index of
 * the cluster in the suggestion list.
 *
 * Any missing fields on the upstream `Partial<Pattern>` draft fall back
 * to the Beta(α=2, β=2) prior mean and the default decay threshold so
 * the returned object satisfies the full `Pattern` contract.
 *
 * Pure function.
 *
 * **Validates: Requirements 7.11**
 */
export function buildPatternUpgradeDrafts(
  episodes: Episode[],
  patterns: Pattern[],
  now: Date,
): PatternUpgradeDraft[] {
  const suggestions = findUpgradableEpisodes(episodes, patterns, now);
  if (suggestions.length === 0) return [];

  const dateStr = toIsoDate(now);
  const priorMean = PATTERN_DRAFT_BETA_ALPHA / (PATTERN_DRAFT_BETA_ALPHA + PATTERN_DRAFT_BETA_BETA);

  return suggestions.map((suggestion, index) => {
    const partial = suggestion.patternDraft;
    const pattern: Pattern = {
      pattern_id: `pat-${dateStr}-${String(index + 1).padStart(3, "0")}`,
      name: partial.name ?? `Recurring pattern ${suggestion.clusterKey}`,
      confidence: partial.confidence ?? priorMean,
      applications: partial.applications ?? 0,
      successes: partial.successes ?? 0,
      failures: partial.failures ?? 0,
      last_triggered: partial.last_triggered ?? dateStr,
      decay_threshold: partial.decay_threshold ?? PATTERN_DRAFT_DEFAULT_DECAY,
      tags: partial.tags ?? [],
      body: partial.body ?? "",
    };
    return {
      clusterKey: suggestion.clusterKey,
      sourceEpisodes: suggestion.episodes,
      draft: pattern,
    };
  });
}

// ---------------------------------------------------------------------------
// getLearnPromptConfig (Requirement 7.15)
// ---------------------------------------------------------------------------

/**
 * Decide what the learn skill should ask the user for based on the
 * inferred episode outcome.
 *
 * Rules:
 *   - `requireUserRating` is always `false`. A 1-10 rating is never
 *     mandatory, regardless of outcome, because most sessions do not
 *     benefit from the number and forcing it produces noise.
 *   - `requireFailureReason` is `true` only when the outcome is
 *     `"failure"`. For a failure we still want a short free-form reason
 *     so the lesson is anchored in reality — but we do not demand a
 *     numeric rating.
 *
 * Pure function.
 *
 * **Validates: Requirements 7.15**
 */
export function getLearnPromptConfig(outcome: EpisodeOutcome): LearnPromptConfig {
  return {
    outcome,
    requireUserRating: false,
    requireFailureReason: outcome === "failure",
  };
}

// ---------------------------------------------------------------------------
// Evolution report aggregation (Requirements 8.9, 8.11, 8.14, 8.15)
// ---------------------------------------------------------------------------

// The learn skill reads the Evolution markers sprinkled across the
// reviews / progress / findings zones, aggregates them via
// {@link aggregateEvolutionMarkers} (re-exported from the top-level
// imports), and emits a single `evolution-report.md` into the open
// zone. We intentionally do NOT keep a historical snapshot: the
// report always reflects the current on-disk state of the marker
// sources, so a user running `/forge learn --maintain` to prune a
// stale marker sees it disappear from the next report without any
// extra bookkeeping (Requirement 8.15).

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
