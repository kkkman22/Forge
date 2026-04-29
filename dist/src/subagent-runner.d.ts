/**
 * Subagent parallel runner for the Agent Team → Subagent migration.
 *
 * Provides utilities to build subagent invocations and collect results
 * from parallel execution using Promise.allSettled.
 */
import type { SubagentInvocation, SubagentResult, ParallelExecutionResult } from "./loop-types.js";
/**
 * Build SubagentInvocation objects from a list of agent types and a task description.
 *
 * Each agent type maps to a SubagentInvocation with a descriptive prompt,
 * default permission mode, and configurable max turns.
 */
export declare function buildSubagentInvocations(agentTypes: string[], taskDescription: string, options?: {
    permissionMode?: "default" | "acceptEdits";
    maxTurns?: number;
}): SubagentInvocation[];
/**
 * Run multiple SubagentInvocations in parallel and collect results.
 *
 * Uses Promise.allSettled to ensure partial failures don't block
 * successful results.
 *
 * In the actual runtime, this delegates to Claude Code's Agent tool.
 * This function provides the pure coordination logic for result collection.
 */
export declare function runSubagentsInParallel(invocations: SubagentInvocation[], executor: (invocation: SubagentInvocation) => Promise<SubagentResult>): Promise<ParallelExecutionResult>;
