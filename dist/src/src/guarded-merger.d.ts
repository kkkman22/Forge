export interface GuardedMergeResult {
    resolvedContent: string;
    strategy: string;
    warnings: string[];
}
/**
 * Merge progress files by task_id [R7.6].
 * completed > pending; tie-break: latest completed_at; then ours.
 */
export declare function mergeProgressFile(ours: string, theirs: string): GuardedMergeResult;
/**
 * Merge instincts or known-failures files [R7.7].
 * By pattern_id / failure_id: confidence = max, occurred_count = sum.
 * Single-side entries preserved verbatim.
 */
export declare function mergeInstinctsOrFailures(ours: string, theirs: string): GuardedMergeResult;
/**
 * Merge review files by appending both sides, sorted by (layer, severity) [R7.9].
 */
export declare function mergeReviewsFile(ours: string, theirs: string): GuardedMergeResult;
/**
 * Reassign ADR IDs in theirs content starting from nextId [R7.8].
 */
export declare function reassignAdrId(theirs: string, nextId: number): GuardedMergeResult;
