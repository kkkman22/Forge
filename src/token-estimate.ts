/**
 * Locale-aware token estimation utility.
 *
 * Provides a fast, deterministic token count estimate that accounts for
 * CJK (Chinese, Japanese, Korean) characters, which tokenize at ~1.5
 * chars/token versus ~4 chars/token for Latin text.
 *
 * **Validates: Phase 3 T2 — Token estimation CJK optimization**
 */

// CJK Unicode ranges: Han, Hiragana, Katakana, Hangul
const CJK_REGEX = /[一-鿿㐀-䶿぀-ゟ゠-ヿ가-힯]/g;

/** Characters per token for Latin/alphanumeric text. */
const LATIN_CHARS_PER_TOKEN = 4;

/** Characters per token for CJK text. */
const CJK_CHARS_PER_TOKEN = 1.5;

/**
 * Estimate the number of tokens in a text string, accounting for CJK.
 *
 * Uses a simple dual-ratio model:
 *   - CJK characters: ~1.5 chars per token
 *   - Non-CJK characters: ~4 chars per token
 *
 * Consistency > precision. Deterministic and O(n).
 *
 * @param text - Input text to estimate tokens for
 * @returns Estimated token count (always ≥ 0, 0 for empty string)
 */
export function tokenEstimate(text: string): number {
  if (text.length === 0) return 0;

  const cjkCount = (text.match(CJK_REGEX) ?? []).length;
  const nonCjkCount = text.length - cjkCount;

  return Math.ceil(cjkCount / CJK_CHARS_PER_TOKEN + nonCjkCount / LATIN_CHARS_PER_TOKEN);
}
