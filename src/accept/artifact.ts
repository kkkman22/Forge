/**
 * Shared acceptance-runner types + artifact builder — extracted from
 * accept-driver.ts (P3-1 god-file split).
 *
 * Leaf module: holds `RunnerContext`, `Runner` and `makeArtifact` so that the
 * runner submodules (ui-runner, delegate-runners) and the accept-driver.ts
 * barrel itself can import them WITHOUT depending back on the barrel (which
 * would create a madge cycle, since the barrel re-exports from the
 * submodules). Precedent: `ship-gates/types.ts` + `pua-engine/types.ts`.
 */

import type { Scenario, ScenarioArtifact, ScenarioType, Verdict } from "../accept.js";
import type { AgentBrowserClient } from "../agent-browser-client.js";

// ---------------------------------------------------------------------------
// Runner Interface
// ---------------------------------------------------------------------------

export interface RunnerContext {
  topic: string;
  projectRoot: string;
  outputDir: string;
  tierAvailability: {
    cmuxAvailable: boolean;
    devServerRunning: boolean;
  };
  /** Injected agent-browser client for UI runner (optional; absent → INCONCLUSIVE). */
  agentBrowserClient?: AgentBrowserClient;
  /** App URL the agent-browser should open (defaults to localhost:5173). */
  appUrl?: string;
}

export interface Runner {
  type: ScenarioType;
  supports(scenario: Scenario): boolean;
  run(scenario: Scenario, ctx: RunnerContext): Promise<ScenarioArtifact>;
}

// ---------------------------------------------------------------------------
// Helpers (pure functions, testable)
// ---------------------------------------------------------------------------

export function makeArtifact(
  scenario: Scenario,
  _ctx: RunnerContext,
  verdict: Verdict,
  evidence: readonly string[],
  failureReason?: string,
): ScenarioArtifact {
  return {
    scenarioId: scenario.id,
    source: scenario.source,
    givenWhenThen: `Given ${scenario.given}\nWhen ${scenario.when}\nThen ${scenario.then}`,
    executedAt: new Date().toISOString(),
    verdict,
    evidence,
    failureReason,
    type: scenario.type,
  };
}
