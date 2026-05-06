/**
 * Backlog Manager — captures unfixed P2/P3 findings for future work cycles.
 *
 * **Validates: Requirements 6.1–6.6**
 */
import type { ReviewFinding } from "./review.js";
export interface BacklogEntry {
    /** Unique identifier for deduplication. */
    id: string;
    severity: "P2" | "P3";
    filePath: string;
    lineNumber: number;
    description: string;
    suggestion: string;
    /** Date the entry was captured (ISO 8601). */
    capturedAt: string;
    /** Name of the task that originated this finding. */
    originatingTask: string;
    /** Reference to the review report file. */
    reviewRef: string;
    /** Whether the entry has been resolved. */
    resolved: boolean;
    /** Name of the task that resolved this entry (when applicable). */
    resolvedByTask?: string;
    /** Date the entry was resolved (when applicable). */
    resolvedAt?: string;
}
export interface BacklogFile {
    entries: BacklogEntry[];
}
export declare function serializeBacklog(backlog: BacklogFile): string;
export declare function deserializeBacklog(content: string): BacklogFile;
export declare function readBacklog(backlogPath: string): BacklogFile;
export declare function writeBacklog(backlogPath: string, backlog: BacklogFile): void;
/**
 * Append P2/P3 findings to the backlog, skipping duplicates.
 *
 * @param backlogPath — path to `.forge/backlog.md`
 * @param findings — review findings to capture (only P2/P3 are retained)
 * @param originatingTask — name of the current task
 * @param reviewRef — reference to the review report file
 * @returns number of newly added entries
 */
export declare function captureFindings(backlogPath: string, findings: ReviewFinding[], originatingTask: string, reviewRef: string): number;
/**
 * Find backlog entries whose file paths overlap with the given file paths.
 * Used during `/forge plan` to surface relevant historical findings.
 *
 * @param backlogPath — path to `.forge/backlog.md`
 * @param affectedFiles — list of file paths from the new plan
 * @returns matching unresolved entries
 */
export declare function findOverlappingEntries(backlogPath: string, affectedFiles: string[]): BacklogEntry[];
/**
 * Mark backlog entries as resolved.
 *
 * @param backlogPath — path to `.forge/backlog.md`
 * @param entryIds — IDs of entries to mark resolved
 * @param resolvingTask — name of the task that resolved them
 * @returns number of entries marked resolved
 */
export declare function markResolved(backlogPath: string, entryIds: string[], resolvingTask: string): number;
