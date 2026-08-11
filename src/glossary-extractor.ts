/**
 * Glossary term extraction — pure, IO-free heuristics that surface
 * candidate terms for potential inclusion in the Forge shared glossary.
 *
 * The extractor runs over free-form text (spec drafts, plan bodies,
 * session notes) and returns a list of `TermCandidate` values that
 * downstream skills can filter, rank, and present to the user before
 * merging into `.tinkerman/glossary.md`.
 *
 * Heuristics are intentionally simple and language-agnostic:
 *
 *   1. TitleCase multi-word noun phrases (e.g. "Dynamic Dispatch",
 *      "Event Sourcing") — two or more space-separated words where each
 *      word starts with an uppercase letter followed by lowercase.
 *   2. PascalCase / CamelCase technical terms (e.g. "EventSourcing",
 *      "DynamicDispatch") — a single word with at least one internal
 *      uppercase letter after a lowercase run.
 *   3. Contiguous Chinese character sequences of 2+ characters (CJK
 *      unified ideographs U+4E00..U+9FFF).
 *
 * The module is pure: same input → same output, no IO, no RNG. See
 * `test/glossary-extractor.property.test.ts` for the behavioural
 * contract.
 *
 * **Validates: Requirements 1.2, 1.6, 1.8, 1.9**
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single candidate term identified by {@link extractCandidates}.
 *
 *   - term:       the surface form as it first appeared in the text
 *   - context:    a trimmed snippet of surrounding text (≈ 40 chars) useful
 *                 for the user to judge meaning at a glance
 *   - frequency:  number of occurrences in the source text (matches of the
 *                 same surface form collapse into one candidate whose
 *                 frequency is the count)
 */
export interface TermCandidate {
  term: string;
  context: string;
  frequency: number;
}

/**
 * Filter and ranking rules applied by {@link filterCandidates}.
 *
 *   - minFrequency:             minimum occurrence count; candidates below
 *                               this threshold are dropped
 *   - minLength:                minimum term length (characters); shorter
 *                               candidates are dropped
 *   - excludePatterns:          regex patterns; any candidate whose term
 *                               matches *any* pattern is dropped
 *   - maxCandidatesPerSession:  final cap on the result list, applied
 *                               after sorting by frequency
 */
export interface ExtractionRules {
  minFrequency: number;
  minLength: number;
  excludePatterns: RegExp[];
  maxCandidatesPerSession: number;
}

// ---------------------------------------------------------------------------
// Default rules
// ---------------------------------------------------------------------------

/**
 * Default extraction rules tuned for Forge session transcripts and spec
 * drafts. Callers are encouraged to clone and tweak rather than mutate.
 *
 * Patterns excluded by default:
 *   - camelCase variables / identifiers starting with a lowercase letter
 *   - private function / member names starting with an underscore
 */
export const DEFAULT_EXTRACTION_RULES: ExtractionRules = {
  minFrequency: 2,
  minLength: 3,
  excludePatterns: [
    // camelCase starting with a lowercase letter (variable / local fn names)
    /^[a-z][a-zA-Z0-9_]*$/,
    // private / underscored function or member names
    /^_[a-zA-Z0-9_]+$/,
  ],
  maxCandidatesPerSession: 10,
};

// ---------------------------------------------------------------------------
// Regex patterns (module-scope so they are compiled once)
// ---------------------------------------------------------------------------

/** "Dynamic Dispatch", "Event Sourcing" — two or more TitleCase words. */
const PATTERN_MULTI_WORD_TITLE = /[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/g;

/** "EventSourcing", "DynamicDispatch" — PascalCase with internal cap. */
const PATTERN_PASCAL_CASE = /\b[A-Z][a-z]+[A-Z][a-zA-Z0-9]*\b/g;

/** 2+ contiguous CJK unified ideographs. */
const PATTERN_CHINESE = /[\u4e00-\u9fff]{2,}/g;

/** Number of characters of context to keep on each side of the match. */
const CONTEXT_RADIUS = 20;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Identify candidate terms in `text`, skipping anything already present in
 * `existingTerms` (case- and whitespace-insensitive match).
 *
 * Behaviour:
 *   - Empty input returns `[]`.
 *   - Duplicate surface forms collapse; the first occurrence supplies the
 *     canonical casing and context snippet, later occurrences only bump
 *     `frequency`.
 *   - Overlapping matches across patterns are deduplicated by
 *     case-insensitive surface form (e.g. "EventSourcing" and
 *     "eventsourcing" collapse).
 *   - Terms appearing in `existingTerms` (compared case-insensitively
 *     after trimming) are skipped entirely — even if the surface form is
 *     a new casing.
 *   - The function never throws: unusual characters, RTL text, control
 *     bytes, and huge inputs all yield a (possibly empty) array.
 *
 * The output is not sorted and not capped; use {@link filterCandidates}
 * to shape it into a ranked shortlist.
 *
 * This function is pure.
 */
export function extractCandidates(text: string, existingTerms: string[]): TermCandidate[] {
  if (text.length === 0) return [];

  const excluded = new Set<string>();
  for (const t of existingTerms) {
    const key = t.trim().toLowerCase();
    if (key.length > 0) excluded.add(key);
  }

  const byKey = new Map<string, TermCandidate>();

  const collect = (pattern: RegExp): void => {
    // Clone to guarantee `lastIndex = 0` and a `g` flag regardless of the
    // caller / module-level state.
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const rx = new RegExp(pattern.source, flags);
    let match: RegExpExecArray | null = rx.exec(text);
    while (match !== null) {
      const surface = match[0];
      if (surface.length === 0) {
        // Defensive: zero-length match would spin forever on some patterns.
        rx.lastIndex += 1;
        match = rx.exec(text);
        continue;
      }

      const key = surface.toLowerCase();
      if (!excluded.has(key)) {
        const existing = byKey.get(key);
        if (existing !== undefined) {
          existing.frequency += 1;
        } else {
          byKey.set(key, {
            term: surface,
            context: sliceContext(text, match.index, surface.length),
            frequency: 1,
          });
        }
      }

      match = rx.exec(text);
    }
  };

  collect(PATTERN_MULTI_WORD_TITLE);
  collect(PATTERN_PASCAL_CASE);
  collect(PATTERN_CHINESE);

  return Array.from(byKey.values());
}

/**
 * Apply {@link ExtractionRules} to a list of candidates and return the
 * shortlist that should be surfaced to the user.
 *
 * Pipeline (order matters for monotonicity reasoning):
 *
 *   1. Dedupe — collapse case-insensitive duplicates, taking the higher
 *      `frequency` and preserving the first-seen surface form / context.
 *   2. `minLength` — drop shorter terms.
 *   3. `excludePatterns` — drop terms matching any excluded pattern.
 *   4. `minFrequency` — drop terms below the frequency threshold.
 *   5. Sort by `frequency` descending; ties broken by term ascending (so
 *      the result is deterministic and stable).
 *   6. Cap at `maxCandidatesPerSession`.
 *
 * Monotonicity: tightening any filter axis (`minLength`,
 * `excludePatterns`, `minFrequency`) while keeping
 * `maxCandidatesPerSession` large enough to be non-binding yields a
 * subset of the looser rule's result. See the property test for the
 * formal statement.
 *
 * This function is pure and does not mutate its inputs.
 */
export function filterCandidates(
  candidates: TermCandidate[],
  rules: ExtractionRules,
): TermCandidate[] {
  // 1. Dedupe case-insensitively. We combine by taking the higher
  //    frequency and keeping the first-seen surface form so that two
  //    upstream callers producing overlapping candidate lists cannot
  //    double-count.
  const byKey = new Map<string, TermCandidate>();
  for (const c of candidates) {
    const key = c.term.trim().toLowerCase();
    if (key.length === 0) continue;
    const existing = byKey.get(key);
    if (existing === undefined) {
      byKey.set(key, { term: c.term, context: c.context, frequency: c.frequency });
    } else if (c.frequency > existing.frequency) {
      byKey.set(key, { term: existing.term, context: existing.context, frequency: c.frequency });
    }
  }

  let working = Array.from(byKey.values());

  // 2. minLength
  working = working.filter((c) => c.term.length >= rules.minLength);

  // 3. excludePatterns — any match drops the candidate
  if (rules.excludePatterns.length > 0) {
    working = working.filter((c) => !rules.excludePatterns.some((p) => p.test(c.term)));
  }

  // 4. minFrequency
  working = working.filter((c) => c.frequency >= rules.minFrequency);

  // 5. Sort — frequency desc, then term asc (deterministic tiebreak)
  working.sort((a, b) => {
    if (b.frequency !== a.frequency) return b.frequency - a.frequency;
    return a.term.localeCompare(b.term);
  });

  // 6. Cap
  const cap = Math.max(0, rules.maxCandidatesPerSession);
  return working.slice(0, cap);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build a trimmed, whitespace-collapsed context snippet around `index`.
 * The returned string is purely informational and never mutates the
 * underlying text.
 */
function sliceContext(text: string, index: number, length: number): string {
  const start = Math.max(0, index - CONTEXT_RADIUS);
  const end = Math.min(text.length, index + length + CONTEXT_RADIUS);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}
