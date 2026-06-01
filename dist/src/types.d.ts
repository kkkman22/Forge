/**
 * Core shared type definitions used across Forge modules.
 *
 * These types were originally defined in loop-types.ts alongside loop-specific
 * types. They are used by core Forge modules (build, review, decide, branch-gate,
 * subagent-runner, etc.) and must be independently available regardless of the
 * loop subsystem's lifecycle.
 *
 * @module forge-types
 */
/**
 * Cumulative token counts for a single agent invocation.
 * @public
 */
export interface TokenUsage {
    /** Number of input (prompt) tokens consumed. */
    inputTokens: number;
    /** Number of output (completion) tokens generated. */
    outputTokens: number;
    /** Number of tokens read from cache. */
    cacheReadTokens: number;
    /** Number of tokens written to cache. */
    cacheCreationTokens: number;
}
/**
 * Describes a single subagent invocation's complete parameters.
 * @public
 */
export interface SubagentInvocation {
    /** Subagent role identifier, corresponding to .claude/agents/ definitions. */
    agentType: string;
    /** Task instructions for the subagent. */
    prompt: string;
    /** Permission mode for the subagent. */
    permissionMode: "default" | "acceptEdits";
    /** Maximum number of turns. */
    maxTurns: number;
}
/**
 * Subagent execution result.
 * @public
 */
export interface SubagentResult {
    /** Subagent role identifier. */
    agentType: string;
    /** Execution status. */
    status: "success" | "failure" | "timeout";
    /** Structured output (on success). */
    output?: string;
    /** Error message (on failure/timeout). */
    error?: string;
}
/**
 * Parallel execution aggregate result.
 * @public
 */
export interface ParallelExecutionResult<T = string> {
    /** Successfully completed subagent results. */
    succeeded: Array<{
        agentType: string;
        result: T;
    }>;
    /** Failed subagent records. */
    failed: Array<{
        agentType: string;
        error: string;
    }>;
}
/**
 * Result of checking whether a branch topic matches the task topic.
 * @public
 */
export interface BranchTopicGateResult {
    /** Whether the build gate allows proceeding. */
    allowed: boolean;
    /** Human-readable reasons when not allowed. */
    reasons: string[];
}
/**
 * A pending-delivery record for "keep branch" ship selections.
 * @public
 */
export interface PendingDeliveryRecord {
    /** The branch name (e.g. "feature/my-topic"). */
    branchName: string;
    /** The topic extracted from the branch at recording time. */
    topic: string;
    /** Unix timestamp (ms) when the record was created. */
    timestamp: number;
}
/**
 * Result of checking whether a commit's topic matches the branch topic.
 * @public
 */
export interface CommitTopicCheckResult {
    /** Whether the commit is allowed. */
    allowed: boolean;
    /** Reason when not allowed. */
    reason?: string;
}
/**
 * Decision about what to do with a worktree after a run completes.
 * @public
 */
export interface WorktreeDecision {
    /** Whether to keep or remove the worktree. */
    action: "preserve" | "remove";
    /** Human-readable explanation for the decision. */
    reason: string;
}
