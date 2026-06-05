/**
 * Date validation and knowledge frontmatter validation utilities.
 *
 * Extracted from learn.ts for independent testability.
 *
 * Property 13: 知识文档格式有效性
 *   - YAML frontmatter must contain: title, tags, date, confidence
 *   - confidence must be in [0.3, 0.9] range
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KnowledgeFrontmatter {
  title: string;
  tags: string[];
  date: string;
  confidence: number;
}

export interface KnowledgeDocument {
  frontmatter: KnowledgeFrontmatter;
  body: {
    problemPattern: string;
    solution: string;
    pitfalls: string;
    decisionRationale: string;
    reusablePatterns: string;
  };
}

export interface InstinctPattern {
  name: string;
  confidenceScore: number;
  tags: string[];
  sources: string[];
  description: string;
}

export interface KnowledgeBaseState {
  documents: KnowledgeDocument[];
  instinctPatterns: InstinctPattern[];
  limit: number;
}

export interface MaintenanceResult {
  documents: KnowledgeDocument[];
  instinctPatterns: InstinctPattern[];
  removedDocuments: KnowledgeDocument[];
  removedPatterns: InstinctPattern[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MIN_CONFIDENCE = 0.3;
export const MAX_CONFIDENCE = 0.9;
export const DEFAULT_KNOWLEDGE_LIMIT = 20;

// ---------------------------------------------------------------------------
// Date validation
// ---------------------------------------------------------------------------

/**
 * Validate that a date string is a real calendar date in YYYY-MM-DD format
 * using a round-trip check through Date.UTC.
 *
 * new Date() silently overflows invalid dates (e.g. Feb 30 → Mar 2),
 * so we parse → construct → compare to catch these cases.
 *
 * Returns true if the date is valid, false otherwise.
 */
export function isValidCalendarDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }
  const [yearStr, monthStr, dayStr] = date.split("-");
  const year = Number.parseInt(yearStr, 10);
  const month = Number.parseInt(monthStr, 10);
  const day = Number.parseInt(dayStr, 10);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() + 1 === month &&
    parsed.getUTCDate() === day
  );
}

/**
 * Sanitize a date string: return it unchanged if valid, or fallback to "1970-01-01".
 */
export function sanitizeDate(date: string): string {
  return isValidCalendarDate(date) ? date : "1970-01-01";
}

// ---------------------------------------------------------------------------
// Knowledge document validation (Property 13)
// ---------------------------------------------------------------------------

/**
 * Validate that a knowledge document's frontmatter contains all required fields
 * and that confidence is within the valid range [0.3, 0.9].
 *
 * Per SKILL.md §3 and design Property 13:
 *   - title: required, non-empty string
 *   - tags: required, non-empty array
 *   - date: required, YYYY-MM-DD format
 *   - confidence: required, in [0.3, 0.9]
 */
export function validateKnowledgeFrontmatter(frontmatter: KnowledgeFrontmatter): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!frontmatter.title || frontmatter.title.trim().length === 0) {
    errors.push("title 字段缺失或为空");
  }

  if (!frontmatter.tags || !Array.isArray(frontmatter.tags) || frontmatter.tags.length === 0) {
    errors.push("tags 字段缺失或为空数组");
  }

  if (!frontmatter.date || !/^\d{4}-\d{2}-\d{2}$/.test(frontmatter.date)) {
    errors.push("date 字段缺失或格式不正确（需要 YYYY-MM-DD）");
  } else if (!isValidCalendarDate(frontmatter.date)) {
    errors.push(`date 字段值无效：${frontmatter.date} 不是合法日期`);
  }

  if (
    frontmatter.confidence === undefined ||
    frontmatter.confidence === null ||
    typeof frontmatter.confidence !== "number" ||
    frontmatter.confidence < MIN_CONFIDENCE ||
    frontmatter.confidence > MAX_CONFIDENCE
  ) {
    errors.push(`confidence 字段无效：需要 ${MIN_CONFIDENCE}-${MAX_CONFIDENCE} 范围内的数值`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Generate a knowledge document with valid frontmatter.
 *
 * Clamps confidence to [0.3, 0.9] range, validates the date via round-trip
 * check, and ensures all required fields are present.
 */
export function generateKnowledgeDocument(
  title: string,
  tags: string[],
  date: string,
  confidence: number,
  body: KnowledgeDocument["body"],
): KnowledgeDocument {
  // Clamp confidence to valid range
  const clampedConfidence = Math.max(MIN_CONFIDENCE, Math.min(MAX_CONFIDENCE, confidence));

  // Ensure tags is non-empty
  const safeTags = tags.length > 0 ? tags : ["general"];

  // Ensure title is non-empty
  const safeTitle = title.trim().length > 0 ? title.trim() : "Untitled";

  // Validate date via round-trip check (same logic as validateKnowledgeFrontmatter)
  const safeDate = sanitizeDate(date);

  return {
    frontmatter: {
      title: safeTitle,
      tags: safeTags,
      date: safeDate,
      confidence: clampedConfidence,
    },
    body,
  };
}

// ---------------------------------------------------------------------------
// Knowledge base maintenance (Property 14)
// ---------------------------------------------------------------------------

/**
 * Maintain the knowledge base by enforcing two invariants:
 *
 * 1. Document count ≤ limit (default 20)
 *    - When over limit, remove documents with lowest confidence first
 *
 * 2. No instinct patterns with confidence < 0.3
 *    - Remove any pattern below the minimum confidence threshold
 *
 * Per SKILL.md §5 and design Property 14.
 */
export function maintainKnowledgeBase(state: KnowledgeBaseState): MaintenanceResult {
  const removedDocuments: KnowledgeDocument[] = [];
  const removedPatterns: InstinctPattern[] = [];

  // --- Invariant 1: Document count ≤ limit ---
  // Sort by confidence ascending (lowest first) for removal priority
  const documents = [...state.documents].sort(
    (a, b) => a.frontmatter.confidence - b.frontmatter.confidence,
  );

  while (documents.length > state.limit) {
    // biome-ignore lint/style/noNonNullAssertion: shift() is safe here — loop guard ensures length > 0
    const removed = documents.shift()!;
    removedDocuments.push(removed);
  }

  // --- Invariant 2: No instinct patterns with confidence < MIN_CONFIDENCE ---
  const keptPatterns: InstinctPattern[] = [];
  for (const pattern of state.instinctPatterns) {
    if (pattern.confidenceScore < MIN_CONFIDENCE) {
      removedPatterns.push(pattern);
    } else {
      keptPatterns.push(pattern);
    }
  }

  return {
    documents,
    instinctPatterns: keptPatterns,
    removedDocuments,
    removedPatterns,
  };
}
