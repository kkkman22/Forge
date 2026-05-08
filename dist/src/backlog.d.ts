/**
 * Backlog Manager — captures unfixed P2/P3 findings for future work cycles.
 *
 * **Validates: Requirements 6.1–6.6**
 */
/**
 * @internal
 * A single backlog entry representing an unfixed P2/P3 finding.
 */
export interface BacklogEntry {
    /** Unique ID derived from the finding fingerprint. */
    id: string;
    severity: "P2" | "P3";
    filePath: string;
    lineNumber: number;
    description: string;
    /** Path to the source review report. */
    sourceReview: string;
    /** Task name that generated the finding. */
    originTask: string;
    /** ISO date when the entry was captured. */
    capturedDate: string;
    /** Whether the entry has been resolved. */
    resolved: boolean;
    /** Task name that resolved the entry (if resolved). */
    resolvedBy?: string;
    /** ISO date when the entry was resolved (if resolved). */
    resolvedDate?: string;
}
/** @internal Generate the standard header for a new backlog file. */
export declare function generateBacklogHeader(): string;
/** @internal Serialize backlog entries to `.forge/backlog.md` format. */
export declare function serializeBacklog(entries: BacklogEntry[]): string;
/** @internal Parse `.forge/backlog.md` content into structured entries. */
export declare function parseBacklog(content: string): BacklogEntry[];
/**
 * Append new findings to the backlog, deduplicating by ID.
 * Returns the merged list and the count of newly added entries.
 * @internal
 */
export declare function appendToBacklog(existing: BacklogEntry[], newFindings: BacklogEntry[]): {
    entries: BacklogEntry[];
    added: number;
};
/**
 * Find backlog entries whose filePath overlaps with a set of affected files.
 * Used by `/forge plan` to surface relevant backlog items.
 * @internal
 */
export declare function findOverlappingEntries(entries: BacklogEntry[], affectedFiles: string[]): BacklogEntry[];
/**
 * Mark a backlog entry as resolved.
 * Returns the updated entry, or null if the ID was not found.
 * @internal
 */
export declare function resolveEntry(entries: BacklogEntry[], entryId: string, resolvedBy: string, resolvedDate: string): BacklogEntry | null;
