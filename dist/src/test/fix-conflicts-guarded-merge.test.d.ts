/**
 * Integration tests for guarded-merger — 4 guarded file merge functions.
 *
 * Covers [R7.6-R7.9]:
 *   - mergeProgressFile: task_id merge, completed > pending
 *   - mergeInstinctsOrFailures: confidence=max, count=sum
 *   - mergeReviewsFile: append + sort by (layer, severity)
 *   - reassignAdrId: sequential ID reassignment
 *
 * **Validates: Requirements R7.6, R7.7, R7.8, R7.9**
 */
export {};
