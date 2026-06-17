/**
 * evaluateUiVerdict — pure function assessing a UI scenario's THEN clause
 * against an agent-browser snapshot. [Spec R1-AC5]
 *
 * Returns PASS when the snapshot satisfies every keyword in the THEN clause,
 * FAIL otherwise. Deterministic: same inputs → same output (no /g regex,
 * per instinct "regex .test() uses inline regex").
 */

export interface UiSnapshot {
  url: string;
  title: string;
  text: string;
}

// F9: module-level constant (was: re-sorted on every call).
// Ordered by length DESC so the longest matching prefix wins
// (e.g. "跳转到" before "跳转", avoiding "跳转到" → "到").
const FILLER_PREFIXES = [
  "跳转到",
  "跳转",
  "显示",
  "出现",
  "看到",
  "应当",
  "应该",
  "shall",
  "should",
  "show",
  "display",
  "see",
].sort((a, b) => b.length - a.length);

const FILLER_EXACT = new Set([
  "跳转到",
  "跳转",
  "显示",
  "出现",
  "看到",
  "应当",
  "应该",
  "应",
  "且",
  "并",
  "和",
  "shall",
  "should",
  "show",
  "display",
  "see",
  "the",
  "a",
]);

/**
 * Extract assertion keywords from a THEN clause.
 * Splits on Chinese conjunctions (且/并/和/以及) and whitespace,
 * drops connective/filler tokens (跳转到/显示/应当/should/...).
 */
export function extractThenKeywords(thenClause: string): string[] {
  if (!thenClause) return [];
  const raw = thenClause
    .split(/[且并和以及,\s，、]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const keywords: string[] = [];
  for (let token of raw) {
    // First: if the whole token is a filler (e.g. "显示", "跳转"), drop it.
    if (FILLER_EXACT.has(token.toLowerCase())) continue;
    // Then: strip the single longest matching filler PREFIX once
    // (e.g. "跳转到/dashboard" → "/dashboard"). Use >= so a prefix equal
    // to the whole token also strips (leaving "" which is then dropped).
    for (const prefix of FILLER_PREFIXES) {
      if (token.startsWith(prefix)) {
        token = token.slice(prefix.length);
        break; // only the longest prefix
      }
    }
    token = token.trim();
    if (token.length === 0) continue;
    if (FILLER_EXACT.has(token.toLowerCase())) continue;
    keywords.push(token);
  }
  return keywords;
}

/**
 * Does the snapshot satisfy a single keyword? Path-like keywords (containing
 * "/") are matched against url only; otherwise against url+title+text.
 */
function snapshotSatisfies(snapshot: UiSnapshot, keyword: string): boolean {
  const hay = keyword.includes("/")
    ? snapshot.url
    : `${snapshot.url} ${snapshot.title} ${snapshot.text}`;
  // Inline regex (no /g) — instinct: avoid lastIndex bug.
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped, "i").test(hay);
}

export function evaluateUiVerdict(snapshot: UiSnapshot, thenClause: string): "PASS" | "FAIL" {
  const keywords = extractThenKeywords(thenClause);
  // Empty assertion → nothing to violate → PASS.
  if (keywords.length === 0) return "PASS";
  for (const kw of keywords) {
    if (!snapshotSatisfies(snapshot, kw)) return "FAIL";
  }
  return "PASS";
}
