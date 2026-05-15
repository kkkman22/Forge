/**
 * Agent registry for multi-platform support.
 *
 * Provides a factory-based registry that maps agent names to
 * `AgentInterface` factories. Built-in agents ("claude", "mock")
 * are registered on startup via `registerBuiltinAgents()`.
 *
 * **Validates: Requirements 9.1–9.4**
 */

import type { WarmQuery } from "@anthropic-ai/claude-agent-sdk";
import type { AgentInterface, AgentOutputSchema } from "./loop-types.js";
import { MockAgentAdapter } from "./mock-agent-adapter.js";
import { SdkAgentAdapter } from "./sdk-agent-adapter.js";
import type { SandboxProfile } from "./sandbox-profile.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Common configuration shared by all agent factories. */
export interface AgentFactoryConfig {
  /** Working directory for the agent session. */
  cwd: string;
  /** Optional JSON schema for structured output validation. */
  outputSchema?: AgentOutputSchema;
  /** Optional timeout in milliseconds. */
  timeoutMs?: number;
  /** Optional budget in USD. */
  budgetUsd?: number;
}

/** Factory function that creates an `AgentInterface` from config. */
export type AgentFactory = (config: AgentFactoryConfig) => AgentInterface;

/** Registry that stores named agent factories. */
export interface AgentRegistry {
  /** Register a factory under a name. Overwrites on duplicate. */
  register(name: string, factory: AgentFactory): void;
  /** Look up a factory by name, instantiate with config, and return the agent. */
  resolve(name: string, config: AgentFactoryConfig): AgentInterface;
  /** Return a sorted list of all registered agent names. */
  listAgents(): string[];
  /** Check whether a name is registered. */
  has(name: string): boolean;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/** Create a fresh, empty agent registry. */
export function createAgentRegistry(): AgentRegistry {
  const factories = new Map<string, AgentFactory>();

  return {
    register(name: string, factory: AgentFactory): void {
      factories.set(name, factory);
    },

    resolve(name: string, config: AgentFactoryConfig): AgentInterface {
      const factory = factories.get(name);
      if (factory === undefined) {
        const available = [...factories.keys()].sort().join(", ");
        throw new Error(`Agent "${name}" is not registered. Available agents: ${available}`);
      }
      return factory(config);
    },

    listAgents(): string[] {
      return [...factories.keys()].sort();
    },

    has(name: string): boolean {
      return factories.has(name);
    },
  };
}

// ---------------------------------------------------------------------------
// Built-in registration
// ---------------------------------------------------------------------------

/** Dependencies required to register the built-in "claude" agent. */
export interface BuiltinAgentDeps {
  /** Pre-warmed query handle from `startup()`. */
  warmQuery: WarmQuery;
  /** JSON schema for structured output validation. */
  outputSchema: AgentOutputSchema;
  /** Sandbox profile for SDK native sandbox mode. When set, enables acceptEdits + SDK sandbox. */
  sandboxProfile?: SandboxProfile;
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
export function registerBuiltinAgents(registry: AgentRegistry, deps: BuiltinAgentDeps): void {
  registry.register(
    "claude",
    (config) =>
      new SdkAgentAdapter({
        warmQuery: deps.warmQuery,
        outputSchema: deps.outputSchema,
        maxBudgetUsd: config.budgetUsd,
        globalTimeoutMs: config.timeoutMs,
        sandboxProfile: deps.sandboxProfile,
      }),
  );

  registry.register(
    "mock",
    (config) =>
      new MockAgentAdapter({
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
      }),
  );
}
