/**
 * Episode / pattern lifecycle integration (Requirements 7.9, 7.10,
 * 7.11, 7.15).
 *
 * Extracted from learn.ts for independent testability. The learn skill is
 * the convergence point for the episode + pattern lifecycle pieces
 * introduced by Phase 4.1:
 *
 *   - After a session completes, synthesise a v2 episode summarising the
 *     outcome so `knowledge/sessions/<date>-<topic>.md` gets a
 *     structured record without the user having to hand-author one
 *     (Requirement 7.9).
 *   - During wrap-up, offer the user a chance to archive stale or
 *     decayed patterns and to promote recurring episode clusters into
 *     new instinct patterns (Requirements 7.10, 7.11).
 *   - The user-facing prompt stays lightweight: no mandatory 1-10
 *     rating, only a short free-form failure reason when the outcome is
 *     a failure (Requirement 7.15).
 *
 * Everything here is pure. The driver layer supplies the clock, reads
 * the existing patterns / episodes, performs user confirmation and
 * writes back to disk.
 *
 * `toIsoDate` is imported as a peer from `./glossary-writeback.js`
 * (NOT from the barrel) to keep the dependency graph one-directional.
 */

import type { Episode, EpisodeOutcome, EpisodeTier } from "../episode.js";
import { generateEpisodeId } from "../episode.js";
import { findUpgradableEpisodes, type Pattern } from "../pattern-stats.js";
import { toIsoDate } from "./glossary-writeback.js";

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
