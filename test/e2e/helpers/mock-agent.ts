/**
 * E2E helper — ScriptedAgent mock implementing AgentInterface.
 *
 * Supports success / failure / stop responses with configurable sequences.
 */
import type {
  AgentInterface,
  AgentResult,
  AgentRunOptions,
  TokenUsage,
} from "../../../src/loop-types.js";

export interface ScriptedResponse {
  kind: "success" | "failure" | "stop";
  summary?: string;
  keyChanges?: string[];
  keyLearnings?: string[];
  usage?: Partial<TokenUsage>;
  errorMessage?: string;
}

function createMockUsage(overrides?: Partial<TokenUsage>): TokenUsage {
  return {
    inputTokens: 100,
    outputTokens: 50,
    cacheReadTokens: 10,
    cacheCreationTokens: 5,
    ...overrides,
  };
}

/**
 * Programmable agent mock for E2E tests.
 * Returns responses in sequence from the provided script, then repeats the last one.
 */
export class ScriptedAgent implements AgentInterface {
  name = "scripted-agent";
  private callCount = 0;

  constructor(private script: ScriptedResponse[]) {}

  async run(_prompt: string, _cwd: string, _options?: AgentRunOptions): Promise<AgentResult> {
    const response = this.script[this.callCount] ?? this.script.at(-1) ?? { kind: "stop" as const };
    this.callCount++;

    switch (response.kind) {
      case "success":
        return {
          output: {
            success: true,
            summary: response.summary ?? "mock success",
            key_changes_made: response.keyChanges ?? ["mock change"],
            key_learnings: response.keyLearnings ?? [],
          },
          usage: createMockUsage(response.usage),
        };
      case "failure":
        return {
          output: {
            success: false,
            summary: response.errorMessage ?? "mock failure",
            key_changes_made: [],
            key_learnings: [],
          },
          usage: createMockUsage(response.usage),
        };
      case "stop":
        return {
          output: {
            success: true,
            summary: response.summary ?? "target reached",
            key_changes_made: response.keyChanges ?? ["final change"],
            key_learnings: [],
            should_fully_stop: true,
          },
          usage: createMockUsage(response.usage),
        };
    }
  }

  async close(): Promise<void> {
    // No-op
  }

  get invocationCount(): number {
    return this.callCount;
  }
}
