/**
 * Agent registry for multi-platform support.
 *
 * Provides a factory-based registry that maps agent names to
 * `AgentInterface` factories. Built-in agents ("claude", "mock")
 * are registered on startup via `registerBuiltinAgents()`.
 *
 * **Validates: Requirements 9.1–9.4**
 */
import { MockAgentAdapter } from "./mock-agent-adapter.js";
import { SdkAgentAdapter } from "./sdk-agent-adapter.js";
// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------
/** Create a fresh, empty agent registry. */
export function createAgentRegistry() {
    const factories = new Map();
    return {
        register(name, factory) {
            factories.set(name, factory);
        },
        resolve(name, config) {
            const factory = factories.get(name);
            if (factory === undefined) {
                const available = [...factories.keys()].sort().join(", ");
                throw new Error(`Agent "${name}" is not registered. Available agents: ${available}`);
            }
            return factory(config);
        },
        listAgents() {
            return [...factories.keys()].sort();
        },
        has(name) {
            return factories.has(name);
        },
    };
}
/**
 * Register the built-in "claude" and "mock" agents.
 *
 * The "claude" factory is wired with the SDK warm-query handle and
 * output schema so it can produce a fully functional `SdkAgentAdapter`.
 * The "mock" factory produces a `MockAgentAdapter` with a single
 * default response; callers that need custom response sequences can
 * register their own "mock" factory afterward (overwriting this one).
 */
export function registerBuiltinAgents(registry, deps) {
    registry.register("claude", (config) => new SdkAgentAdapter({
        warmQuery: deps.warmQuery,
        outputSchema: deps.outputSchema,
        maxBudgetUsd: config.budgetUsd,
        globalTimeoutMs: config.timeoutMs,
        sandboxProfile: deps.sandboxProfile,
    }));
    registry.register("mock", (config) => new MockAgentAdapter({
        cwd: config.cwd,
        responses: [
            {
                output: {
                    success: true,
                    summary: "mock response",
                    key_changes_made: [],
                    key_learnings: [],
                },
            },
        ],
    }));
}
//# sourceMappingURL=agent-registry.js.map