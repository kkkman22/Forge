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
export declare const MIN_CONFIDENCE = 0.3;
export declare const MAX_CONFIDENCE = 0.9;
export declare const DEFAULT_KNOWLEDGE_LIMIT = 20;
/**
 * Validate that a date string is a real calendar date in YYYY-MM-DD format
 * using a round-trip check through Date.UTC.
 *
 * new Date() silently overflows invalid dates (e.g. Feb 30 → Mar 2),
 * so we parse → construct → compare to catch these cases.
 *
 * Returns true if the date is valid, false otherwise.
 */
export declare function isValidCalendarDate(date: string): boolean;
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
export declare function validateKnowledgeFrontmatter(frontmatter: KnowledgeFrontmatter): {
    valid: boolean;
    errors: string[];
};
/**
 * Generate a knowledge document with valid frontmatter.
 *
 * Clamps confidence to [0.3, 0.9] range, validates the date via round-trip
 * check, and ensures all required fields are present.
 */
export declare function generateKnowledgeDocument(title: string, tags: string[], date: string, confidence: number, body: KnowledgeDocument["body"]): KnowledgeDocument;
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
export declare function maintainKnowledgeBase(state: KnowledgeBaseState): MaintenanceResult;
/**
 * A single skill execution feedback entry.
 */
export interface SkillFeedbackEntry {
    /** The forge command that was executed, e.g. "build", "review", "plan". */
    command: string;
    /** Whether the execution succeeded. */
    success: boolean;
    /** Execution duration in seconds (0 if unknown). */
    durationSeconds: number;
    /** Failure reason (empty string if success). */
    failureReason: string;
}
/**
 * Aggregated statistics for a single command.
 */
export interface CommandStats {
    command: string;
    totalRuns: number;
    successCount: number;
    failureCount: number;
    successRate: number;
    avgDurationSeconds: number;
    /** Top failure reasons sorted by frequency (most common first). */
    topFailureReasons: {
        reason: string;
        count: number;
    }[];
}
/**
 * Result of analyzing skill feedback entries.
 */
export interface FeedbackAnalysis {
    /** Per-command statistics. */
    commandStats: CommandStats[];
    /** Commands with failure rate above the alert threshold. */
    alertCommands: string[];
    /** Total entries analyzed. */
    totalEntries: number;
}
/** Failure rate threshold above which a command is flagged for attention. */
export declare const FAILURE_RATE_ALERT_THRESHOLD = 0.3;
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
export declare function analyzeSkillFeedback(entries: SkillFeedbackEntry[]): FeedbackAnalysis;
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
export declare function crossValidateFailures(feedbackReasons: string[], knownFailureDescriptions: string[]): string[];
