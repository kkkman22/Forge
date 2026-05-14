/**
 * Mock agent adapter for testing and platform-agnostic development.
 *
 * Returns pre-configured responses from a sequence, with optional
 * delay simulation and loop/cycle behaviour. Useful for CI pipelines,
 * local development without API keys, and deterministic test scenarios.
 *
 * **Validates: Requirements 4.1–4.4**
 */
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const DEFAULT_TOKEN_USAGE = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
};
// ---------------------------------------------------------------------------
// MockAgentAdapter
// ---------------------------------------------------------------------------
/**
 * Mock implementation of `AgentInterface` for testing and development.
 *
 * Behaviour:
 *   - Each `run()` call consumes the next response in the sequence.
 *   - When `loop` is enabled and the sequence is exhausted, cycling
 *     resumes from the first response.
 *   - When `loop` is disabled and the sequence is exhausted, an error
 *     is thrown.
 *   - `delayMs` simulates network latency via `setTimeout`.
 *   - `close()` is a no-op.
 */
export class MockAgentAdapter {
    name = "mock";
    config;
    callIndex = 0;
    constructor(config) {
        this.config = config;
    }
    async run(_prompt, _cwd, options) {
        // Honour abort signal before starting.
        if (options?.signal?.aborted) {
            throw new Error("MockAgentAdapter run aborted");
        }
        const { responses, delayMs = 0, loop = false } = this.config;
        if (responses.length === 0) {
            throw new Error("MockAgentAdapter: no responses configured");
        }
        // Simulate delay if configured.
        if (delayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            // Re-check abort after delay.
            if (options?.signal?.aborted) {
                throw new Error("MockAgentAdapter run aborted");
            }
        }
        let index;
        if (this.callIndex < responses.length) {
            index = this.callIndex;
        }
        else if (loop) {
            index = this.callIndex % responses.length;
        }
        else {
            throw new Error(`MockAgentAdapter: response sequence exhausted after ${responses.length} call(s)`);
        }
        this.callIndex += 1;
        const entry = responses[index];
        return {
            output: entry.output,
            usage: entry.usage ?? { ...DEFAULT_TOKEN_USAGE },
        };
    }
    close() {
        // No-op — mock adapter holds no external resources.
    }
}
//# sourceMappingURL=mock-agent-adapter.js.map