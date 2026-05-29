/**
 * SDK Agent Adapter — @deprecated
 *
 * Replaced by CliSubprocessDriver (src/cli-subprocess-driver.ts) in
 * workflows-integration (T8). This file is retained for backward-compatible
 * type imports only. Do not use for runtime agent dispatch.
 *
 * DEPRECATED: Use CliSubprocessDriver instead.
 *
 * Design reference: sdk-autonomous-loop § sdk-agent-adapter.ts
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7**
 */
import { type WarmQuery } from "@anthropic-ai/claude-agent-sdk";
import type { AgentInterface, AgentOutputSchema, AgentResult, AgentRunOptions, TokenUsage } from "./loop-types.js";
import { type SandboxProfile } from "./sandbox-profile.js";
/**
 * Configuration for the SDK agent adapter.
 *
 * Accepts a pre-warmed query handle from `startup()`, the JSON schema for
 * structured output, and an optional budget limit.
 * @public
 */
export interface SdkAgentAdapterConfig {
    /** Pre-warmed query handle from `startup()`. */
    warmQuery: WarmQuery;
    /** JSON schema describing the expected agent output structure. */
    outputSchema: AgentOutputSchema;
    /** Maximum budget in USD, if configured. */
    maxBudgetUsd?: number;
    /**
     * Global timeout in milliseconds for each SDK `query()` call.
     * If the call exceeds this duration, it is aborted via `AbortController`
     * and an error containing "timeout" is thrown.
     * Defaults to 1,800,000 ms (30 minutes).
     */
    globalTimeoutMs?: number;
    /** Sandbox profile for SDK native sandbox mode. When set, uses acceptEdits + allowedTools + sandbox. */
    sandboxProfile?: SandboxProfile;
}
/**
 * Wraps the Agent SDK's `query()` to implement `AgentInterface`.
 *
 * On the first `run()` call, uses the pre-warmed `WarmQuery.query()` for
 * zero-latency startup. Subsequent calls use the standalone `query()`
 * function with full options. Tracks warm query consumption via an
 * internal flag.
 *
 * @deprecated Slated for removal once the workflows-integration default-swap
 *   (T11) lands. New code should use `CliSubprocessDriver` from
 *   `cli-subprocess-driver.ts`. This adapter remains while warm-query and
 *   startup() compatibility paths are still wired in forge-loop-cli.ts.
 *
 * @public
 */
export declare class SdkAgentAdapter implements AgentInterface {
    readonly name = "claude-sdk";
    private readonly config;
    private activeQuery;
    constructor(config: SdkAgentAdapterConfig);
    /**
     * Execute a single iteration by sending a prompt to the Agent SDK.
     *
     * 1. Creates an `AbortController` wired to `options.signal` if provided.
     * 2. Calls `sdkQuery()` with full options including structured output schema.
     * 3. Iterates the async generator to collect messages.
     * 4. Extracts `structured_output` and `usage` from the `SDKResultMessage`.
     * 5. Maps SDK usage fields to `TokenUsage`.
     * 6. Validates structured output via `validateAgentOutput()`.
     * 7. Returns `AgentResult` on success; throws on validation or SDK errors.
     *
     * @param prompt  The iteration prompt to send to the agent.
     * @param cwd     Working directory for the agent session.
     * @param options Optional run options (signal, callbacks).
     * @returns The agent result with validated output and token usage.
     * @throws Error if the SDK returns an error result or output validation fails.
     */
    run(prompt: string, cwd: string, options?: AgentRunOptions): Promise<AgentResult>;
    /**
     * Clean up SDK resources.
     *
     * Closes any active query and the warm query handle.
     */
    close(): Promise<void>;
}
/**
 * Map SDK usage fields to the `TokenUsage` structure.
 *
 * SDK fields:
 * - `input_tokens` → `inputTokens`
 * - `output_tokens` → `outputTokens`
 * - `cache_read_input_tokens` → `cacheReadTokens`
 * - `cache_creation_input_tokens` → `cacheCreationTokens`
 *
 * @param sdkUsage  The SDK's `NonNullableUsage` object.
 * @returns A `TokenUsage` object with mapped fields.
 */
export declare function mapTokenUsage(sdkUsage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens: number;
    cache_creation_input_tokens: number;
}): TokenUsage;
