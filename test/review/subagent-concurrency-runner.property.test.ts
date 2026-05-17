import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { SubagentInvocation, SubagentResult } from "../../src/loop-types.js";
import {
  runSubagentsInParallel,
  runSubagentsWithConcurrency,
} from "../../src/subagent-runner.js";

function makeInvocations(n: number): SubagentInvocation[] {
  return Array.from({ length: n }, (_, i) => ({
    agentType: `agent-${i}`,
    prompt: `Task ${i}`,
    permissionMode: "default" as const,
    maxTurns: 10,
  }));
}

describe("runSubagentsWithConcurrency property tests", () => {
  it("window cap invariant: inflight <= concurrency", async () => {
    const concurrency = 3;
    let inflight = 0;
    let maxInflight = 0;

    const executor = async (inv: SubagentInvocation): Promise<SubagentResult> => {
      inflight++;
      maxInflight = Math.max(maxInflight, inflight);
      await new Promise((r) => setTimeout(r, 5));
      inflight--;
      return { agentType: inv.agentType, status: "success", output: `ok-${inv.agentType}` };
    };

    const invocations = makeInvocations(10);
    await runSubagentsWithConcurrency(invocations, executor, concurrency);

    expect(maxInflight).toBeLessThanOrEqual(concurrency);
  });

  it("complete coverage: all invocations end up in succeeded or failed", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 8 }),
        fc.integer({ min: 1, max: 5 }),
        fc.array(fc.boolean(), { minLength: 1, maxLength: 8 }),
        async (concurrency, _delay, shouldFail) => {
          const invocations = makeInvocations(shouldFail.length);

          const executor = async (inv: SubagentInvocation): Promise<SubagentResult> => {
            const idx = parseInt(inv.agentType.split("-")[1], 10);
            if (shouldFail[idx]) {
              return { agentType: inv.agentType, status: "failure", error: "planned" };
            }
            return { agentType: inv.agentType, status: "success", output: `ok-${idx}` };
          };

          const result = await runSubagentsWithConcurrency(invocations, executor, concurrency);

          const totalResult = result.succeeded.length + result.failed.length;
          expect(totalResult).toBe(shouldFail.length);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("API equivalence: concurrency=N output multiset equals runSubagentsInParallel", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 6 }),
        fc.array(fc.boolean(), { minLength: 1, maxLength: 6 }),
        async (_seed, shouldFail) => {
          const invocations = makeInvocations(shouldFail.length);

          const makeExecutor = () => async (inv: SubagentInvocation): Promise<SubagentResult> => {
            const idx = parseInt(inv.agentType.split("-")[1], 10);
            if (shouldFail[idx]) {
              return { agentType: inv.agentType, status: "failure", error: "fail" };
            }
            return { agentType: inv.agentType, status: "success", output: `ok-${idx}` };
          };

          const parallel = await runSubagentsInParallel(invocations, makeExecutor());
          const bounded = await runSubagentsWithConcurrency(invocations, makeExecutor(), shouldFail.length);

          const sort = <T extends { agentType: string }>(arr: T[]) =>
            [...arr].sort((a, b) => a.agentType.localeCompare(b.agentType));

          expect(sort(bounded.succeeded).map((s) => s.agentType)).toEqual(
            sort(parallel.succeeded).map((s) => s.agentType),
          );
          expect(sort(bounded.failed).map((f) => f.agentType)).toEqual(
            sort(parallel.failed).map((f) => f.agentType),
          );
        },
      ),
      { numRuns: 50 },
    );
  });

  it("failure isolation: K rejections don't affect N-K successes", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 4 }),
        fc.array(fc.boolean(), { minLength: 2, maxLength: 6 }),
        async (concurrency, shouldThrow) => {
          const invocations = makeInvocations(shouldThrow.length);
          const expectedFailures = shouldThrow.filter(Boolean).length;
          const expectedSuccesses = shouldThrow.length - expectedFailures;

          const executor = async (inv: SubagentInvocation): Promise<SubagentResult> => {
            const idx = parseInt(inv.agentType.split("-")[1], 10);
            if (shouldThrow[idx]) throw new Error("boom");
            return { agentType: inv.agentType, status: "success", output: `ok-${idx}` };
          };

          const result = await runSubagentsWithConcurrency(invocations, executor, concurrency);

          expect(result.failed).toHaveLength(expectedFailures);
          expect(result.succeeded).toHaveLength(expectedSuccesses);
        },
      ),
      { numRuns: 50 },
    );
  });
});
