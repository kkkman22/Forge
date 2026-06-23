// category: internal-only
/**
 * injection-helpers.mjs — shared helpers for context-injection scripts.
 *
 * Extracted to fix Q4 (phase regex divergence between stop/inject), Q5
 * (escapeAngleBrackets duplicated across scripts), and to centralize the
 * byte-budget truncation (Q2) so CJK content cannot blow past the cap.
 *
 * Consumed by: scripts/stop-incomplete-tasks.mjs, scripts/inject-plan-context.mjs
 */

/**
 * Escape literal angle brackets so injected content cannot forge boundary tags
 * (N-1/N-2 fix). Note (S-5): this defense relies on the downstream model not
 * reconstructing HTML entities (&lt; → <) at the instruction-parsing layer — a
 * reasonable but not provable assumption. It is a soft defense, consistent with
 * R1's prompt-only model, NOT a cryptographic guarantee.
 */
export function escapeAngleBrackets(content) {
  return content.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Truncate a string to a byte budget (Q2 fix). String.prototype.slice counts
 * UTF-16 code units, not bytes — for CJK (3 bytes/char UTF-8) a 65536-char
 * slice yields ~196KB, defeating the cap. This truncates on the byte buffer
 * and walks back to a valid UTF-8 boundary so multi-byte sequences aren't split.
 */
export function truncateToBytes(content, byteCap) {
  const buf = Buffer.from(content, "utf-8");
  if (buf.length <= byteCap) return content;
  let cut = byteCap;
  // Walk back to a UTF-8 lead byte (continuation bytes are 10xxxxxx = 0x80-0xBF).
  while (cut > 0 && (buf[cut] & 0xc0) === 0x80) cut--;
  return buf.subarray(0, cut).toString("utf-8");
}

/**
 * Parse the `phase:` field from a status.md-style file. Shared so stop and
 * inject agree on phase (Q4 fix — the two scripts previously used divergent
 * regexes that could read different phases from the same file).
 *
 * Returns the trimmed phase string, or null if absent/unparseable.
 */
export function parseStatusPhase(statusContent) {
  if (!statusContent) return null;
  const match = statusContent.match(/^phase:\s*["']?([^\s"']+)["']?\s*$/m);
  return match ? match[1].trim() : null;
}

/**
 * Parse the `phase:` field from a file's YAML frontmatter (used by R1 to
 * decide whether a progress file belongs to the current phase).
 */
export function parseFrontmatterPhase(content) {
  const fm = content?.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return null;
  return parseStatusPhase(fm[1]);
}
