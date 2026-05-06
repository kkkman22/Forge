/**
 * context-budget serialize/deserialize benchmark.
 *
 * BUDGET: p99 < 2 ms, ops/sec > 10 000 (Requirement 4.2, 4.3)
 */

import { bench, describe } from "vitest";
import {
  deserializeSubagentSummary,
  type SubagentSummary,
  serializeSubagentSummary,
} from "../../src/context-budget.js";

const SAMPLE: SubagentSummary = {
  status: "DONE",
  taskDescription: "refactor the router module for clarity",
  changedFiles: ["src/router.ts", "test/router.property.test.ts"],
  testResult: { passed: 120, failed: 0 },
  commitMessage: "refactor(router): extract helper functions",
  selfCheckResults: "typecheck ok; lint ok; tests ok",
};

const serialised = serializeSubagentSummary(SAMPLE);

describe("context-budget / subagent summary", () => {
  bench("serialize", () => {
    serializeSubagentSummary(SAMPLE);
  });

  bench("deserialize", () => {
    deserializeSubagentSummary(serialised);
  });

  bench("round-trip", () => {
    deserializeSubagentSummary(serializeSubagentSummary(SAMPLE));
  });
});
