/**
 * Plan engine — format detection & glossary normalization (T-02 拆分自 src/plan.ts).
 *
 * 包含：占位符常量/扫描、plan 格式检测、heading anchor 提取、glossary 术语归一化。
 * 依赖：types（AtomicTask/LightweightTask 等）+ 外部 frontmatter.js/glossary.js。
 *
 * @module plan/format
 */

import { extractStringField } from "../frontmatter.js";
import type { Glossary } from "../glossary.js";
import type { AtomicTask, LightweightTask, PlanFormat } from "./types.js";

// ---------------------------------------------------------------------------
// Forbidden placeholders
// ---------------------------------------------------------------------------

/** @public */
export const FORBIDDEN_PLACEHOLDERS = [
  "TBD",
  "TODO",
  "待定",
  "后续补充",
  "类似 Task",
  "添加适当的错误处理",
];

const FORBIDDEN_PLACEHOLDERS_LOWER = FORBIDDEN_PLACEHOLDERS.map((p) => p.toLowerCase());

/**
 * Scan a text string for forbidden placeholder content.
 *
 * Per SKILL.md §4, the scan is case-insensitive and matches exact text
 * and common variants (e.g., `tbd`, `Todo`, `TODO:`, `// TODO`).
 *
 * Returns an array of found placeholder strings. Empty array means clean.
 * @public
 */
export function scanForPlaceholders(text: string): string[] {
  const found: string[] = [];
  const lowerText = text.toLowerCase();

  for (let i = 0; i < FORBIDDEN_PLACEHOLDERS_LOWER.length; i++) {
    if (lowerText.includes(FORBIDDEN_PLACEHOLDERS_LOWER[i])) {
      found.push(FORBIDDEN_PLACEHOLDERS[i]);
    }
  }

  return found;
}

// ---------------------------------------------------------------------------
// Lightweight format — format detection & heading anchor extraction
// ---------------------------------------------------------------------------

/** @public */
export function detectPlanFormat(frontmatter: string): PlanFormat {
  const value = extractStringField(frontmatter, "format");
  if (value === "lightweight") return "lightweight";
  return "full";
}

/** @public */
export function extractHeadingAnchors(markdownContent: string): string[] {
  const anchors: string[] = [];
  const lines = markdownContent.split("\n");

  for (const line of lines) {
    const match = line.match(/^#{1,6}\s+(.+)$/);
    if (match) {
      const headingText = match[1];
      const anchor = headingText
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9\-_]/g, "")
        .replace(/^-+|-+$/g, "");
      anchors.push(anchor);
    }
  }

  return anchors;
}

// ---------------------------------------------------------------------------
// Glossary term normalization (Requirement 1.5)
// ---------------------------------------------------------------------------

/**
 * Regex special characters that must be escaped when embedding a glossary
 * term or alias into a dynamically built `RegExp`.
 */
const REGEX_META_CHARS_REGEX = /[.*+?^${}()|[\]\\]/g;

/**
 * Characters that are considered "word" characters for the purposes of the
 * whole-word match. We include ASCII alphanumerics plus the CJK ranges so
 * that Chinese phrases like "复杂度档位" only match when they are not a
 * substring of a larger CJK run.
 */
const WORD_CHAR_CLASS = "[\\p{L}\\p{N}_]";

/**
 * Escape a literal string so it can be safely embedded into a RegExp.
 * @public
 */
export function escapeForRegExp(value: string): string {
  return value.replace(REGEX_META_CHARS_REGEX, "\\$&");
}

/**
 * Build the ordered list of "surface form → canonical term" replacements
 * for a glossary. Sorted by surface length descending so greedy longest-match
 * replacement wins when two surface forms overlap.
 */
function buildReplacementTable(glossary: Glossary): Array<{ surface: string; canonical: string }> {
  const table: Array<{ surface: string; canonical: string }> = [];
  for (const entry of glossary.terms) {
    const canonical = entry.term.trim();
    if (canonical.length === 0) continue;
    table.push({ surface: canonical, canonical });
    if (entry.aliases !== undefined) {
      for (const alias of entry.aliases) {
        const trimmed = alias.trim();
        if (trimmed.length === 0) continue;
        // Skip aliases identical to canonical term — comparison is case-insensitive.
        if (trimmed.toLowerCase() === canonical.toLowerCase()) continue;
        table.push({ surface: trimmed, canonical });
      }
    }
  }
  // Longest surface first for greedy matching. Ties broken by surface order
  // to keep the algorithm deterministic.
  table.sort((a, b) => {
    if (b.surface.length !== a.surface.length) {
      return b.surface.length - a.surface.length;
    }
    return a.surface.localeCompare(b.surface);
  });
  return table;
}

/**
 * Replace whole-word occurrences of `surface` in `text` with `canonical`.
 * Returns the updated text and whether any change happened.
 */
function replaceWholeWord(
  text: string,
  surface: string,
  canonical: string,
): { text: string; changed: boolean } {
  const escaped = escapeForRegExp(surface);
  // Whole-word via lookbehind/lookahead with Unicode `u` flag so CJK chars
  // are treated as word characters.
  const pattern = new RegExp(`(?<!${WORD_CHAR_CLASS})${escaped}(?!${WORD_CHAR_CLASS})`, "giu");

  let changed = false;
  const next = text.replace(pattern, () => {
    changed = true;
    return canonical;
  });
  return { text: next, changed };
}

/**
 * Normalize domain terminology inside a task title string.
 *
 * For each alias (and canonical term) defined in the glossary, finds
 * case-insensitive whole-word matches inside `title` and replaces them with
 * the canonical `term` form. Longest surface wins (greedy). Pure & idempotent.
 *
 * **Validates: Requirements 1.5**
 *
 * @public
 */
export function normalizeTaskTerms(title: string, glossary: Glossary): string {
  if (title.length === 0) return title;
  if (glossary.terms.length === 0) return title;

  const table = buildReplacementTable(glossary);
  let current = title;
  for (const { surface, canonical } of table) {
    const result = replaceWholeWord(current, surface, canonical);
    if (result.changed) {
      current = result.text;
    }
  }
  return current;
}

/**
 * Return a copy of `task` whose `title` field has been normalized against
 * the glossary. All other fields are passed through unchanged.
 * @public
 */
export function normalizeLightweightTask(
  task: LightweightTask,
  glossary: Glossary,
): LightweightTask {
  const normalizedTitle = normalizeTaskTerms(task.title, glossary);
  if (normalizedTitle === task.title) return task;
  return { ...task, title: normalizedTitle };
}

/**
 * Return a copy of `task` whose `title` field has been normalized against
 * the glossary. All other fields are passed through unchanged.
 * @public
 */
export function normalizeAtomicTask(task: AtomicTask, glossary: Glossary): AtomicTask {
  const normalizedTitle = normalizeTaskTerms(task.title, glossary);
  if (normalizedTitle === task.title) return task;
  return { ...task, title: normalizedTitle };
}
