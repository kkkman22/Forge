/**
 * PUA Quality Engine — failure-pattern detection + stall response.
 *
 * Extracted from `pua-engine.ts` (god-file split, following the
 * `context-budget/` precedent). See `pua-engine.ts` for the re-export barrel
 * that preserves the public API.
 */

import type { FailurePattern, StallResponse } from "./types.js";

// ---------------------------------------------------------------------------
// Stall Detection
// ---------------------------------------------------------------------------

/**
 * Keyword tables for failure pattern detection.
 *
 * Each pattern (except `spinning`) is detected by checking the most recent
 * summary for trigger keywords. If any trigger keyword is found AND none of
 * the exclusion keywords are present, the pattern is matched.
 *
 * `spinning` uses a different algorithm (keyword overlap rate).
 *
 * @internal
 */
interface PatternKeywords {
  trigger: string[];
  exclusion: string[];
}

const PATTERN_KEYWORDS: Record<
  Exclude<FailurePattern, "spinning" | "low-quality">,
  PatternKeywords
> = {
  "giving-up": {
    trigger: [
      "无法解决",
      "超出范围",
      "建议手动",
      "环境问题",
      "cannot",
      "unable",
      "out of scope",
      "manual",
    ],
    exclusion: [],
  },
  "empty-claim": {
    trigger: ["已完成", "done", "completed", "fixed"],
    exclusion: ["test", "verify", "output", "result", "passed"],
  },
  "passive-waiting": {
    trigger: ["等待用户", "需要确认", "waiting", "need confirmation"],
    exclusion: ["searched", "checked", "verified", "tried"],
  },
  guessing: {
    trigger: ["可能是", "probably", "might be", "i think"],
    exclusion: ["searched", "found", "documentation", "source", "verified"],
  },
};

/**
 * Jaccard similarity threshold for spinning detection.
 *
 * When all pairwise Jaccard similarities among the last 3 iteration
 * summaries exceed this value, the engine flags a "spinning" pattern
 * (repeatedly tweaking the same spot without real progress).
 *
 * Valid range: (0, 1) exclusive — 0 would flag everything, 1 would
 * never flag.
 */
export const SPINNING_JACCARD_THRESHOLD = 0.6;

/**
 * Maximum number of recent iteration summaries retained for failure
 * pattern detection.
 *
 * The PUA engine keeps a sliding window of the most recent summaries
 * so that `detectFailurePattern` can analyse trends (e.g. spinning
 * detection requires at least 3 entries). Older entries are discarded
 * to bound memory usage and keep pattern detection focused on the
 * current problem-solving trajectory.
 */
export const MAX_SUMMARY_HISTORY = 5;

/**
 * Tokenize a summary string into a set of lowercase tokens.
 *
 * Splits on whitespace and punctuation, lowercases, and filters out
 * tokens shorter than 2 characters.
 *
 * @internal
 */
function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .split(/[\s\p{P}]+/u)
    .filter((t) => t.length >= 2);
  return new Set(tokens);
}

/**
 * Compute the Jaccard similarity (intersection / union) of two token sets.
 *
 * Returns 0 if both sets are empty.
 *
 * @internal
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;

  let intersectionSize = 0;
  for (const token of a) {
    if (b.has(token)) intersectionSize++;
  }

  const unionSize = a.size + b.size - intersectionSize;
  if (unionSize === 0) return 0;

  return intersectionSize / unionSize;
}

/**
 * Detect whether the last 3 summaries exhibit a "spinning" pattern.
 *
 * Spinning is detected when the pairwise keyword overlap rate among the
 * last 3 summaries all exceed 60% (Jaccard similarity > 0.6).
 *
 * @internal
 */
function detectSpinning(summaryHistory: string[]): boolean {
  if (summaryHistory.length < 3) return false;

  const last3 = summaryHistory.slice(-3);
  const tokenSets = last3.map(tokenize);

  // Check all 3 pairwise similarities
  const sim01 = jaccardSimilarity(tokenSets[0], tokenSets[1]);
  const sim02 = jaccardSimilarity(tokenSets[0], tokenSets[2]);
  const sim12 = jaccardSimilarity(tokenSets[1], tokenSets[2]);

  return (
    sim01 > SPINNING_JACCARD_THRESHOLD &&
    sim02 > SPINNING_JACCARD_THRESHOLD &&
    sim12 > SPINNING_JACCARD_THRESHOLD
  );
}

/**
 * Check whether a summary matches a keyword-based failure pattern.
 *
 * A pattern matches when at least one trigger keyword is found in the
 * lowercased summary AND none of the exclusion keywords are present.
 *
 * @internal
 */
function matchesKeywordPattern(summary: string, keywords: PatternKeywords): boolean {
  const lower = summary.toLowerCase();

  const hasTrigger = keywords.trigger.some((kw) => lower.includes(kw));
  if (!hasTrigger) return false;

  if (keywords.exclusion.length === 0) return true;

  const hasExclusion = keywords.exclusion.some((kw) => lower.includes(kw));
  return !hasExclusion;
}

/**
 * Detect the failure pattern from recent iteration summaries.
 *
 * Detection priority (highest first):
 * 1. **spinning** — last 3 summaries' keyword overlap rate > 60%
 * 2. **giving-up** — last summary contains give-up/blame keywords
 * 3. **empty-claim** — last summary contains completion keywords without verification keywords
 * 4. **passive-waiting** — last summary contains waiting keywords without evidence keywords
 * 5. **guessing** — last summary contains guessing keywords without search evidence keywords
 * 6. **null** — no known pattern detected
 *
 * Empty array returns null. Spinning requires at least 3 summaries.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**
 *
 * @param summaryHistory - Array of summary strings (most recent at end)
 * @returns The detected failure pattern, or null
 */
export function detectFailurePattern(summaryHistory: string[]): FailurePattern | null {
  if (summaryHistory.length === 0) return null;

  // Priority 1: spinning (needs at least 3 summaries)
  if (detectSpinning(summaryHistory)) {
    return "spinning";
  }

  // For remaining patterns, check the most recent summary
  const lastSummary = summaryHistory[summaryHistory.length - 1];

  // Priority 2: giving-up
  if (matchesKeywordPattern(lastSummary, PATTERN_KEYWORDS["giving-up"])) {
    return "giving-up";
  }

  // Priority 3: empty-claim
  if (matchesKeywordPattern(lastSummary, PATTERN_KEYWORDS["empty-claim"])) {
    return "empty-claim";
  }

  // Priority 4: passive-waiting
  if (matchesKeywordPattern(lastSummary, PATTERN_KEYWORDS["passive-waiting"])) {
    return "passive-waiting";
  }

  // Priority 5: guessing
  if (matchesKeywordPattern(lastSummary, PATTERN_KEYWORDS.guessing)) {
    return "guessing";
  }

  return null;
}

/**
 * Get the stall response strategy based on consecutive failure count.
 *
 * Mapping:
 * - 1-2 failures → "remind" (suggest switching approach)
 * - 3-4 failures → "reassess" (re-read output, list 3 different hypotheses)
 * - 5+ failures  → "force-pivot" (fall back to questioning the requirement)
 * - 0 or negative → "remind" (defensive default)
 *
 * **Validates: Requirements 3.8, 3.9, 3.10, 3.11**
 *
 * @param consecutiveFailures - Number of consecutive failures
 * @returns The stall response strategy
 */
export function getStallResponse(consecutiveFailures: number): StallResponse {
  if (consecutiveFailures >= 5) return "force-pivot";
  if (consecutiveFailures >= 3) return "reassess";
  return "remind";
}
