/**
 * Subagent parallel runner for the Agent Team → Subagent migration.
 *
 * Provides utilities to build subagent invocations and collect results
 * from parallel execution using Promise.allSettled.
 */
/**
 * Build SubagentInvocation objects from a list of agent types and a task description.
 *
 * Each agent type maps to a SubagentInvocation with a descriptive prompt,
 * default permission mode, and configurable max turns.
 */
export function buildSubagentInvocations(agentTypes, taskDescription, options) {
    const permissionMode = options?.permissionMode ?? "default";
    const maxTurns = options?.maxTurns ?? 10;
    return agentTypes.map((agentType) => ({
        agentType,
        prompt: `[${agentType}] ${taskDescription}`,
        permissionMode,
        maxTurns,
    }));
}
/**
 * Run multiple SubagentInvocations in parallel and collect results.
 *
 * Uses Promise.allSettled to ensure partial failures don't block
 * successful results.
 *
 * In the actual runtime, this delegates to Claude Code's Agent tool.
 * This function provides the pure coordination logic for result collection.
 */
export async function runSubagentsInParallel(invocations, executor) {
    const outcomes = await Promise.allSettled(invocations.map((inv) => executor(inv)));
    const succeeded = [];
    const failed = [];
    for (let i = 0; i < outcomes.length; i++) {
        const outcome = outcomes[i];
        const invocation = invocations[i];
        if (outcome.status === "fulfilled") {
            const result = outcome.value;
            if (result.status === "success") {
                succeeded.push({ agentType: result.agentType, result: result.output ?? "" });
            }
            else {
                failed.push({ agentType: result.agentType, error: result.error ?? "Unknown error" });
            }
        }
        else {
            failed.push({ agentType: invocation.agentType, error: outcome.reason?.message ?? String(outcome.reason) });
        }
    }
    return { succeeded, failed };
}
//# sourceMappingURL=subagent-runner.js.map