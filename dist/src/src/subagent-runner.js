/**
 * Subagent parallel runner for the Agent Team → Subagent migration.
 *
 * Provides utilities to build subagent invocations and collect results
 * from parallel execution using Promise.allSettled.
 */
/** Agent types defined in .claude/agents/ that may be used as subagent_type. @public */
export const VALID_AGENT_TYPES = [
    "spec-check",
    "quality-check",
    "security-check",
    "product",
    "architect",
    "security",
    "designer",
    "critic",
    "Explore",
];
/**
 * Build SubagentInvocation objects from a list of agent types and a task description.
 *
 * Each agent type maps to a SubagentInvocation with a descriptive prompt,
 * default permission mode, and configurable max turns.
 * @public
 */
export function buildSubagentInvocations(agentTypes, taskDescription, options) {
    for (const at of agentTypes) {
        if (!VALID_AGENT_TYPES.includes(at)) {
            throw new Error(`Invalid agentType: "${at}". Must be one of: ${VALID_AGENT_TYPES.join(", ")}`);
        }
    }
    const permissionMode = options?.permissionMode ?? "default";
    const maxTurns = Math.min(options?.maxTurns ?? 10, 30);
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
 * @public
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
            failed.push({
                agentType: invocation.agentType,
                error: outcome.reason?.message ?? String(outcome.reason),
            });
        }
    }
    return { succeeded, failed };
}
/**
 * Run SubagentInvocations with bounded concurrency.
 *
 * - concurrency >= N: equivalent to runSubagentsInParallel (allSettled)
 * - concurrency === 1: sequential for-await
 * - 1 < concurrency < N: rolling window using Promise.race + Set
 *
 * @public
 */
export async function runSubagentsWithConcurrency(invocations, executor, concurrency) {
    if (concurrency < 1)
        throw new Error("concurrency must be >= 1");
    if (concurrency > 100)
        throw new Error("concurrency must be <= 100");
    if (concurrency >= invocations.length) {
        return runSubagentsInParallel(invocations, executor);
    }
    const succeeded = [];
    const failed = [];
    let nextIndex = 0;
    const inflight = new Set();
    const startNext = () => {
        if (nextIndex >= invocations.length)
            return false;
        const i = nextIndex++;
        const inv = invocations[i];
        const p = (async () => {
            try {
                const result = await executor(inv);
                if (result.status === "success") {
                    succeeded.push({ agentType: result.agentType, result: result.output ?? "" });
                }
                else {
                    failed.push({ agentType: result.agentType, error: result.error ?? "Unknown error" });
                }
            }
            catch (err) {
                failed.push({
                    agentType: inv.agentType,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        })();
        const wrapped = p.finally(() => {
            inflight.delete(wrapped);
        });
        inflight.add(wrapped);
        return true;
    };
    for (let k = 0; k < concurrency && startNext(); k++) {
        /* fill initial window */
    }
    while (inflight.size > 0) {
        await Promise.race(inflight);
        while (inflight.size < concurrency && startNext()) {
            /* refill */
        }
    }
    return { succeeded, failed };
}
//# sourceMappingURL=subagent-runner.js.map