/**
 * Learn engine — core logic extracted from forge-learn/SKILL.md.
 *
 * Implements:
 *   - generateKnowledgeDocument: Creates a knowledge document with valid YAML frontmatter
 *   - maintainKnowledgeBase:    Enforces knowledge base invariants (doc limit + confidence floor)
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
 */
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
export const MIN_CONFIDENCE = 0.3;
export const MAX_CONFIDENCE = 0.9;
export const DEFAULT_KNOWLEDGE_LIMIT = 20;
// ---------------------------------------------------------------------------
// Date validation (shared logic)
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
export function isValidCalendarDate(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return false;
    }
    const [yearStr, monthStr, dayStr] = date.split("-");
    const year = Number.parseInt(yearStr, 10);
    const month = Number.parseInt(monthStr, 10);
    const day = Number.parseInt(dayStr, 10);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (!Number.isNaN(parsed.getTime()) &&
        parsed.getUTCFullYear() === year &&
        parsed.getUTCMonth() + 1 === month &&
        parsed.getUTCDate() === day);
}
/**
 * Sanitize a date string: return it unchanged if valid, or fallback to "1970-01-01".
 */
function sanitizeDate(date) {
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
export function validateKnowledgeFrontmatter(frontmatter) {
    const errors = [];
    if (!frontmatter.title || frontmatter.title.trim().length === 0) {
        errors.push("title 字段缺失或为空");
    }
    if (!frontmatter.tags || !Array.isArray(frontmatter.tags) || frontmatter.tags.length === 0) {
        errors.push("tags 字段缺失或为空数组");
    }
    if (!frontmatter.date || !/^\d{4}-\d{2}-\d{2}$/.test(frontmatter.date)) {
        errors.push("date 字段缺失或格式不正确（需要 YYYY-MM-DD）");
    }
    else if (!isValidCalendarDate(frontmatter.date)) {
        errors.push(`date 字段值无效：${frontmatter.date} 不是合法日期`);
    }
    if (frontmatter.confidence === undefined ||
        frontmatter.confidence === null ||
        typeof frontmatter.confidence !== "number" ||
        frontmatter.confidence < MIN_CONFIDENCE ||
        frontmatter.confidence > MAX_CONFIDENCE) {
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
export function generateKnowledgeDocument(title, tags, date, confidence, body) {
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
export function maintainKnowledgeBase(state) {
    const removedDocuments = [];
    const removedPatterns = [];
    // --- Invariant 1: Document count ≤ limit ---
    // Sort by confidence ascending (lowest first) for removal priority
    const documents = [...state.documents].sort((a, b) => a.frontmatter.confidence - b.frontmatter.confidence);
    while (documents.length > state.limit) {
        // biome-ignore lint/style/noNonNullAssertion: shift() is safe here — loop guard ensures length > 0
        const removed = documents.shift();
        removedDocuments.push(removed);
    }
    // --- Invariant 2: No instinct patterns with confidence < MIN_CONFIDENCE ---
    const keptPatterns = [];
    for (const pattern of state.instinctPatterns) {
        if (pattern.confidenceScore < MIN_CONFIDENCE) {
            removedPatterns.push(pattern);
        }
        else {
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
/** Failure rate threshold above which a command is flagged for attention. */
export const FAILURE_RATE_ALERT_THRESHOLD = 0.3;
/**
 * Analyze a collection of skill feedback entries.
 *
 * Groups entries by command, computes success/failure rates, average duration,
 * and identifies commands with failure rates above the alert threshold (30%).
 *
 * Per design Property 24 (Self-evolution Phase 2):
 *   - Commands with >30% failure rate are flagged
 *   - Failure reasons are aggregated and ranked by frequency
 */
export function analyzeSkillFeedback(entries) {
    if (entries.length === 0) {
        return { commandStats: [], alertCommands: [], totalEntries: 0 };
    }
    // Group by command
    const groups = new Map();
    for (const entry of entries) {
        const key = entry.command;
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key)?.push(entry);
    }
    const commandStats = [];
    for (const [command, commandEntries] of groups) {
        const totalRuns = commandEntries.length;
        const successCount = commandEntries.filter((e) => e.success).length;
        const failureCount = totalRuns - successCount;
        const successRate = totalRuns > 0 ? successCount / totalRuns : 0;
        // Average duration (only count entries with known duration > 0)
        const durationsWithValue = commandEntries.map((e) => e.durationSeconds).filter((d) => d > 0);
        const avgDurationSeconds = durationsWithValue.length > 0
            ? durationsWithValue.reduce((a, b) => a + b, 0) / durationsWithValue.length
            : 0;
        // Aggregate failure reasons
        const reasonCounts = new Map();
        for (const entry of commandEntries) {
            if (!entry.success && entry.failureReason.trim().length > 0) {
                const reason = entry.failureReason.trim();
                reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
            }
        }
        const topFailureReasons = [...reasonCounts.entries()]
            .map(([reason, count]) => ({ reason, count }))
            .sort((a, b) => b.count - a.count);
        commandStats.push({
            command,
            totalRuns,
            successCount,
            failureCount,
            successRate,
            avgDurationSeconds,
            topFailureReasons,
        });
    }
    // Sort by failure rate descending (worst first)
    commandStats.sort((a, b) => a.successRate - b.successRate);
    // Flag commands above alert threshold
    const alertCommands = commandStats
        .filter((s) => s.totalRuns >= 2 && 1 - s.successRate >= FAILURE_RATE_ALERT_THRESHOLD)
        .map((s) => s.command);
    return {
        commandStats,
        alertCommands,
        totalEntries: entries.length,
    };
}
/**
 * Check if a specific failure reason appears in both skill feedback and known failures.
 *
 * This is the cross-validation step from Phase 2: if a failure reason from
 * skill-feedback.md also appears in known-failures.md, it's a confirmed
 * recurring pattern that should be prioritized.
 *
 * @param feedbackReasons - Failure reasons from skill feedback analysis
 * @param knownFailureDescriptions - Descriptions from known-failures.md
 * @returns Reasons that appear in both sources (confirmed recurring patterns)
 */
export function crossValidateFailures(feedbackReasons, knownFailureDescriptions) {
    if (feedbackReasons.length === 0 || knownFailureDescriptions.length === 0) {
        return [];
    }
    const knownLower = knownFailureDescriptions.map((d) => d.toLowerCase());
    return feedbackReasons.filter((reason) => {
        const reasonLower = reason.toLowerCase();
        return knownLower.some((known) => known.includes(reasonLower) || reasonLower.includes(known));
    });
}
//# sourceMappingURL=learn.js.map