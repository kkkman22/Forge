/**
 * Glossary writeback (Requirement 1.6) + stale-term archival (Requirement 1.11).
 *
 * Extracted from learn.ts for independent testability. The learn skill scans
 * the session's decisions / findings / reviews / progress / prior sessions
 * for TitleCase, PascalCase and contiguous CJK candidate terms that are not
 * yet present in `.forge/glossary.md`, and presents them to the user for
 * confirmation before calling `mergeTerm(..., "append")`.
 *
 * `toIsoDate` lives in THIS module so the episode-lifecycle cluster can import
 * it via a peer import (`./glossary-writeback.js`) instead of reaching back
 * through the barrel — that keeps the dependency graph one-directional.
 */

import { findStaleterms, type Glossary, type GlossaryTerm } from "../glossary.js";
import {
  DEFAULT_EXTRACTION_RULES,
  extractCandidates,
  filterCandidates,
  type TermCandidate,
} from "../glossary-extractor.js";
import type { SessionData } from "../session-types.js";

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
