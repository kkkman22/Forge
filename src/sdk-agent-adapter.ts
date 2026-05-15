/**
 * SDK Agent Adapter — wraps the Claude Code Agent SDK's `query()` to
 * implement the `AgentInterface` from `loop-types.ts`.
 *
 * This is the only module that imports from `@anthropic-ai/claude-agent-sdk`.
 * It translates between the SDK's message types and Forge's pure-function
 * types, handling structured output extraction, token usage mapping, and
 * output validation.
 *
 * Design reference: sdk-autonomous-loop § sdk-agent-adapter.ts
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7**
 */

import {
  type Options,
  type Query,
  type SDKMessage,
  type SDKResultMessage,
  query as sdkQuery,
  type WarmQuery,
} from "@anthropic-ai/claude-agent-sdk";
import { validateAgentOutput } from "./agent-output.js";
import { createFrozenZoneHook } from "./frozen-zone-hook.js";
import type {
  AgentInterface,
  AgentOutputSchema,
  AgentResult,
  AgentRunOptions,
  TokenUsage,
} from "./loop-types.js";
import { FORGE_LOOP_TOOLS, type SandboxProfile, toSdkSandboxSettings } from "./sandbox-profile.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default global timeout for SDK calls: 30 minutes. */
const DEFAULT_GLOBAL_TIMEOUT_MS = 1_800_000;

// ---------------------------------------------------------------------------
// SdkAgentAdapter class
// ---------------------------------------------------------------------------

/**
 * Wraps the Agent SDK's `query()` to implement `AgentInterface`.
 *
 * On the first `run()` call, uses the pre-warmed `WarmQuery.query()` for
 * zero-latency startup. Subsequent calls use the standalone `query()`
 * function with full options. Tracks warm query consumption via an
 * internal flag.
 * @public
 */
export class SdkAgentAdapter implements AgentInterface {
  readonly name = "claude-sdk";

  private readonly config: SdkAgentAdapterConfig;
  private warmQueryUsed = false;
  private activeQuery: Query | null = null;

  constructor(config: SdkAgentAdapterConfig) {
    this.config = config;
  }

  /**
   * Execute a single iteration by sending a prompt to the Agent SDK.
   *
   * 1. Creates an `AbortController` wired to `options.signal` if provided.
   * 2. Calls `warmQuery.query(prompt)` on first invocation, or the
   *    standalone `query()` with full options on subsequent calls.
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
  async run(prompt: string, cwd: string, options?: AgentRunOptions): Promise<AgentResult> {
    // Wire abort signal to an AbortController for the SDK.
    const abortController = new AbortController();
    if (options?.signal) {
      if (options.signal.aborted) {
        abortController.abort(options.signal.reason);
      } else {
        options.signal.addEventListener(
          "abort",
          () => abortController.abort(options.signal?.reason),
          { once: true },
        );
      }
    }

    // Build SDK options for standalone query() calls.
    //
    // Permission bypass rationale:
    // `bypassPermissions` / `allowDangerouslySkipPermissions` is the standard
    // practice for Claude Agent SDK autonomous loops. The SDK's built-in
    // interactive permission prompts are designed for human-in-the-loop
    // scenarios and are incompatible with unattended autonomous execution.
    //
    // Access control is enforced by upper-layer protection mechanisms instead:
    //   1. PreToolUse hooks (hooks/hooks.json) — intercept Write, Edit, and
    //      Bash tool calls to run frozen-zone checks before execution.
    //   2. Frozen zone protection (src/check-frozen.ts, scripts/check-frozen.sh)
    //      — rejects writes to .forge/specs/*, .forge/plans/*, and
    //      .forge/config.md when their status is "locked" or "approved".
    //   3. State gate checks — build.ts and other orchestrator modules verify
    //      spec/plan status before allowing state transitions.
    //
    // Because the SDK permission layer is bypassed here, the integrity of
    // these upper-layer mechanisms is critical. Any changes to the hook
    // configuration or frozen-zone logic must be reviewed carefully.
    const sandboxProfile = this.config.sandboxProfile;

    const sdkOptions: Options = {
      cwd,
      permissionMode: sandboxProfile ? "acceptEdits" : "bypassPermissions",
      ...(!sandboxProfile && { allowDangerouslySkipPermissions: true }),
      ...(sandboxProfile && {
        allowedTools: [...FORGE_LOOP_TOOLS],
        sandbox: toSdkSandboxSettings(sandboxProfile, cwd),
        hooks: {
          PreToolUse: [
            {
              matcher: "Write|Edit",
              hooks: [createFrozenZoneHook(cwd)],
              timeout: 5,
            },
          ],
        },
      }),
      outputFormat: {
        type: "json_schema",
        schema: this.config.outputSchema as unknown as Record<string, unknown>,
      },
      abortController,
      systemPrompt: { type: "preset", preset: "claude_code" },
      ...(this.config.maxBudgetUsd !== undefined && {
        maxBudgetUsd: this.config.maxBudgetUsd,
      }),
    };

    // Obtain the async generator (Query).
    let queryHandle: Query;
    if (!this.warmQueryUsed) {
      this.warmQueryUsed = true;
      queryHandle = this.config.warmQuery.query(prompt);
    } else {
      queryHandle = sdkQuery({ prompt, options: sdkOptions });
    }
    this.activeQuery = queryHandle;

    // Set up global timeout: abort the SDK call if it exceeds the configured
    // duration. Uses setTimeout + AbortController to enforce the limit.
    const timeoutMs = this.config.globalTimeoutMs ?? DEFAULT_GLOBAL_TIMEOUT_MS;
    const timeoutId = setTimeout(() => {
      abortController.abort("timeout");
    }, timeoutMs);

    try {
      // Iterate the async generator to find the result message.
      let resultMessage: SDKResultMessage | null = null;

      for await (const message of queryHandle as AsyncIterable<SDKMessage>) {
        // Forward text messages to the onMessage callback if provided.
        if (
          options?.onMessage &&
          "result" in message &&
          message.type === "result" &&
          "result" in message
        ) {
          // Result messages are handled below; skip onMessage for them.
        }

        // Capture the result message (last message of type 'result').
        if (message.type === "result") {
          resultMessage = message as SDKResultMessage;
        }
      }

      this.activeQuery = null;

      if (!resultMessage) {
        throw new Error("Agent SDK query completed without returning a result message");
      }

      // Handle error results from the SDK.
      if (resultMessage.subtype !== "success") {
        const errorMessages =
          "errors" in resultMessage && Array.isArray(resultMessage.errors)
            ? (resultMessage.errors as string[]).join("; ")
            : "Unknown SDK error";
        throw new Error(`Agent SDK error (${resultMessage.subtype}): ${errorMessages}`);
      }

      // Extract usage and map to TokenUsage.
      const usage = mapTokenUsage(resultMessage.usage);

      // Report usage via callback if provided.
      if (options?.onUsage) {
        options.onUsage(usage);
      }

      // Extract and validate structured output.
      const structuredOutput = resultMessage.structured_output;
      const validation = validateAgentOutput(structuredOutput);

      if (!validation.valid) {
        throw new Error(`Agent output validation failed: ${validation.errors.join("; ")}`);
      }

      return {
        output: validation.value,
        usage,
      };
    } catch (error) {
      // If the abort was triggered by our timeout, throw a descriptive
      // timeout error so the upper layer can classify it as iteration_hard_failure.
      if (abortController.signal.aborted && abortController.signal.reason === "timeout") {
        throw new Error(`Agent SDK call timed out after ${timeoutMs}ms (timeout)`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
      this.activeQuery = null;
    }
  }

  /**
   * Clean up SDK resources.
   *
   * Closes any active query and the warm query handle.
   */
  async close(): Promise<void> {
    if (this.activeQuery) {
      this.activeQuery.close();
      this.activeQuery = null;
    }
    this.config.warmQuery.close();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
export function mapTokenUsage(sdkUsage: {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}): TokenUsage {
  return {
    inputTokens: sdkUsage.input_tokens,
    outputTokens: sdkUsage.output_tokens,
    cacheReadTokens: sdkUsage.cache_read_input_tokens,
    cacheCreationTokens: sdkUsage.cache_creation_input_tokens,
  };
}
