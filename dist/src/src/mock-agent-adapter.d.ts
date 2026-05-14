/**
 * Mock agent adapter for testing and platform-agnostic development.
 *
 * Returns pre-configured responses from a sequence, with optional
 * delay simulation and loop/cycle behaviour. Useful for CI pipelines,
 * local development without API keys, and deterministic test scenarios.
 *
 * **Validates: Requirements 4.1–4.4**
 */
import type { AgentInterface, AgentOutput, AgentResult, AgentRunOptions, TokenUsage } from "./loop-types.js";
/** A single mock response entry. */
export interface MockResponse {
    /** Structured output for this response. */
    output: AgentOutput;
    /** Optional token usage for this response. */
    usage?: TokenUsage;
}
/** Configuration for the mock agent adapter. */
export interface MockAgentConfig {
    /** Working directory (stored but not used in mock runs). */
    cwd: string;
    /** Sequence of responses to return from successive `run()` calls. */
    responses: MockResponse[];
    /** Optional delay in milliseconds before returning each response. */
    delayMs?: number;
    /** When true, cycle back to the start of the sequence after exhaustion. */
    loop?: boolean;
}
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
export declare class MockAgentAdapter implements AgentInterface {
    readonly name = "mock";
    private readonly config;
    private callIndex;
    constructor(config: MockAgentConfig);
    run(_prompt: string, _cwd: string, options?: AgentRunOptions): Promise<AgentResult>;
    close(): void;
}
