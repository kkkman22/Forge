/**
 * Mock agent adapter for testing and platform-agnostic development.
 *
 * Returns pre-configured responses from a sequence, with optional
 * delay simulation and loop/cycle behaviour. Useful for CI pipelines,
 * local development without API keys, and deterministic test scenarios.
 *
 * **Validates: Requirements 4.1–4.4**
 */

import type {
  AgentInterface,
  AgentOutput,
  AgentResult,
  AgentRunOptions,
  TokenUsage,
} from "./loop-types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_TOKEN_USAGE: TokenUsage = {
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
export class MockAgentAdapter implements AgentInterface {
  readonly name = "mock";

  private readonly config: MockAgentConfig;
  private callIndex = 0;

  constructor(config: MockAgentConfig) {
    this.config = config;
  }

  async run(_prompt: string, _cwd: string, options?: AgentRunOptions): Promise<AgentResult> {
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

    let index: number;
    if (this.callIndex < responses.length) {
      index = this.callIndex;
    } else if (loop) {
      index = this.callIndex % responses.length;
    } else {
      throw new Error(
        `MockAgentAdapter: response sequence exhausted after ${responses.length} call(s)`,
      );
    }

    this.callIndex += 1;
    const entry = responses[index];

    return {
      output: entry.output,
      usage: entry.usage ?? { ...DEFAULT_TOKEN_USAGE },
    };
  }

  close(): void {
    // No-op — mock adapter holds no external resources.
  }
}
