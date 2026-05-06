/**
 * Orchestrator transition benchmark.
 *
 * BUDGET: p99 < 1 ms, ops/sec > 50 000 (Requirement 4.2, 4.3)
 */

import { bench, describe } from "vitest";
import type { OrchestratorEvent } from "../../src/loop-types.js";
import { createInitialState, transition } from "../../src/orchestrator.js";

const state = createInitialState();

const successEvent: OrchestratorEvent = {
  type: "iteration_success",
  summary: "noop",
  tokenUsage: {
    inputTokens: 100,
    outputTokens: 200,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  },
};

const startEvent: OrchestratorEvent = { type: "start", limits: {} };
const stopEvent: OrchestratorEvent = { type: "stop_condition_met" };
const backoffEvent: OrchestratorEvent = { type: "backoff_elapsed" };

describe("orchestrator.transition", () => {
  bench("start → running", () => {
    transition(state, startEvent);
  });

  bench("iteration_success", () => {
    transition(state, successEvent);
  });

  bench("stop_condition_met", () => {
    transition(state, stopEvent);
  });

  bench("backoff_elapsed", () => {
    transition(state, backoffEvent);
  });
});
