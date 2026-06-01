import { describe, expect, it } from "vitest";
import { runSubagentsInParallel, runSubagentsWithConcurrency } from "../../src/subagent-runner.js";
import type { SubagentInvocation, SubagentResult } from "../../src/types.js";

function makeInvocation(i: number): SubagentInvocation {
  return {
    agentType: `agent-${i}`,
    prompt: `Task ${i}`,
    permissionMode: "default",
    maxTurns: 10,
  };
}

function makeExecutor(delayMs: number) {
  return async (inv: SubagentInvocation): Promise<SubagentResult> => {
    await new Promise((r) => setTimeout(r, delayMs));
    return { agentType: inv.agentType, status: "success", output: `result-${inv.agentType}` };
  };
}

describe("runSubagentsWithConcurrency", () => {
  it("concurrency >= N behaves like runSubagentsInParallel", async () => {
    const invocations = [makeInvocation(0), makeInvocation(1), makeInvocation(2)];
    const executor = makeExecutor(5);

    const parallel = await runSubagentsInParallel(invocations, executor);
    const concurrencyHigh = await runSubagentsWithConcurrency(invocations, executor, 3);
    const concurrencyHigher = await runSubagentsWithConcurrency(invocations, executor, 10);

    const extract = (r: {
      succeeded: Array<{ agentType: string }>;
      failed: Array<{ agentType: string }>;
    }) => [...r.succeeded.map((s) => s.agentType)].sort();

    expect(extract(concurrencyHigh)).toEqual(extract(parallel));
    expect(extract(concurrencyHigher)).toEqual(extract(parallel));
    expect(concurrencyHigh.failed).toEqual(parallel.failed);
  });

  it("concurrency=1 executes sequentially", async () => {
    const timestamps: number[] = [];
    const invocations = [makeInvocation(0), makeInvocation(1), makeInvocation(2)];

    const executor = async (inv: SubagentInvocation): Promise<SubagentResult> => {
      timestamps.push(Date.now());
      await new Promise((r) => setTimeout(r, 20));
      return { agentType: inv.agentType, status: "success", output: `result-${inv.agentType}` };
    };

    const result = await runSubagentsWithConcurrency(invocations, executor, 1);

    expect(result.succeeded).toHaveLength(3);
    expect(result.failed).toHaveLength(0);
    // Timestamps should be strictly increasing (sequential)
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
    }
  });

  it("concurrency=2 with 5 invocations uses rolling window", async () => {
    let inflight = 0;
    let maxInflight = 0;
    const invocations = Array.from({ length: 5 }, (_, i) => makeInvocation(i));

    const executor = async (inv: SubagentInvocation): Promise<SubagentResult> => {
      inflight++;
      maxInflight = Math.max(maxInflight, inflight);
      await new Promise((r) => setTimeout(r, 30));
      inflight--;
      return { agentType: inv.agentType, status: "success", output: `result-${inv.agentType}` };
    };

    const result = await runSubagentsWithConcurrency(invocations, executor, 2);

    expect(result.succeeded).toHaveLength(5);
    expect(result.failed).toHaveLength(0);
    expect(maxInflight).toBeLessThanOrEqual(2);
  });

  it("throws on concurrency=0", async () => {
    await expect(
      runSubagentsWithConcurrency(
        [],
        async () => ({ agentType: "x", status: "success" as const, output: "" }),
        0,
      ),
    ).rejects.toThrow("concurrency must be >= 1");
  });

  it("throws on concurrency=-1", async () => {
    await expect(
      runSubagentsWithConcurrency(
        [],
        async () => ({ agentType: "x", status: "success" as const, output: "" }),
        -1,
      ),
    ).rejects.toThrow("concurrency must be >= 1");
  });

  it("throws on concurrency=101", async () => {
    await expect(
      runSubagentsWithConcurrency(
        [],
        async () => ({ agentType: "x", status: "success" as const, output: "" }),
        101,
      ),
    ).rejects.toThrow("concurrency must be <= 100");
  });

  it("executor rejection isolated to single invocation", async () => {
    const invocations = [
      makeInvocation(0),
      makeInvocation(1),
      makeInvocation(2),
      makeInvocation(3),
      makeInvocation(4),
    ];

    const executor = async (inv: SubagentInvocation): Promise<SubagentResult> => {
      if (inv.agentType === "agent-2") {
        throw new Error("boom");
      }
      return { agentType: inv.agentType, status: "success", output: `result-${inv.agentType}` };
    };

    const result = await runSubagentsWithConcurrency(invocations, executor, 3);

    expect(result.succeeded).toHaveLength(4);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].agentType).toBe("agent-2");
    expect(result.failed[0].error).toContain("boom");
  });
});
