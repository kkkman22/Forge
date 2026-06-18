import * as fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SubagentInvocation, SubagentResult } from "../../src/types.js";

vi.mock("../../src/subagent-runner.js", () => ({
  runSubagentsWithConcurrency: vi.fn(),
}));

import { runReviewFallbackLadder } from "../../src/review.js";
import { runSubagentsWithConcurrency } from "../../src/subagent-runner.js";

const ARBITRARY_AGENT_TYPES = ["spec-check", "quality-check", "security-check"] as const;

function makeInvocation(agentType: string): SubagentInvocation {
  return { agentType, prompt: `Review ${agentType}`, permissionMode: "default", maxTurns: 10 };
}

const failureErrorArb = fc.constantFrom(
  "No task found with ID: abc-123",
  "Error: timeout exceeded",
  "Error: turn limit reached",
  "Error: unknown failure",
);

const subagentResultArb = fc.record({
  status: fc.constantFrom("success", "failure") as fc.Arbitrary<"success" | "failure">,
  agentType: fc.constantFrom(...ARBITRARY_AGENT_TYPES),
  output: fc.string({ minLength: 1, maxLength: 20 }),
  error: fc.string({ minLength: 0, maxLength: 50 }),
});

describe("fallback-ladder property tests", () => {
  // The fallback ladder emits user-facing console.warn on every L0/L1/L2
  // degradation (src/review/fallback.ts). With numRuns:200 these flood stderr
  // and make `npm run check` (pre-push) output unreadable. Silence the
  // expected warnings during this suite; restored in afterEach.
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("silences console.warn during fallback degradation (test hygiene)", async () => {
    // Drive the ladder all the way to L3 (unavailable) so every warn path fires.
    vi.clearAllMocks();
    (runSubagentsWithConcurrency as ReturnType<typeof vi.fn>).mockResolvedValue({
      succeeded: [],
      failed: ARBITRARY_AGENT_TYPES.map((agentType) => ({ agentType, error: "fail" })),
    });
    const invocations = ARBITRARY_AGENT_TYPES.map(makeInvocation);
    const executor = async (inv: SubagentInvocation): Promise<SubagentResult> => ({
      status: "failure",
      agentType: inv.agentType,
      error: "fail",
    });

    await runReviewFallbackLadder({ invocations, executor });

    // The ladder MUST have warned (degradation happened) ...
    expect(warnSpy).toHaveBeenCalled();
    // ... but nothing reached the real stderr (spy swallowed it).
    expect(warnSpy.mock.calls.length).toBeGreaterThan(0);
  });

  it("retry never exceeds 1 — runSubagentsWithConcurrency called at most twice", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(subagentResultArb, { minLength: 1, maxLength: 6 }),
        async (results) => {
          vi.clearAllMocks();
          let callCount = 0;

          (runSubagentsWithConcurrency as ReturnType<typeof vi.fn>).mockImplementation(
            (
              _invs: SubagentInvocation[],
              _exec: (inv: SubagentInvocation) => Promise<SubagentResult>,
              _concurrency: number,
            ) => {
              callCount++;
              const succeeded = results
                .filter((r) => r.status === "success")
                .map((r) => ({ agentType: r.agentType, result: r.output }));
              const failed = results
                .filter((r) => r.status === "failure")
                .map((r) => ({ agentType: r.agentType, error: r.error }));
              return { succeeded, failed };
            },
          );

          const invocations = ARBITRARY_AGENT_TYPES.map(makeInvocation);
          const executor = async (inv: SubagentInvocation): Promise<SubagentResult> => ({
            status: "success",
            agentType: inv.agentType,
            output: "ok",
          });

          await runReviewFallbackLadder({ invocations, executor });

          expect(callCount).toBeLessThanOrEqual(2);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("methodology and trace are consistent", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          l0AllFail: fc.boolean(),
          l1AllFail: fc.boolean(),
          hasCiEvidence: fc.boolean(),
        }),
        async ({ l0AllFail, l1AllFail, hasCiEvidence }) => {
          vi.clearAllMocks();
          const invocations = ARBITRARY_AGENT_TYPES.map(makeInvocation);
          let callCount = 0;

          (runSubagentsWithConcurrency as ReturnType<typeof vi.fn>).mockImplementation(
            (
              invs: SubagentInvocation[],
              _exec: (inv: SubagentInvocation) => Promise<SubagentResult>,
              _concurrency: number,
            ) => {
              callCount++;
              if (callCount === 1) {
                if (l0AllFail) {
                  return {
                    succeeded: [],
                    failed: invs.map((inv) => ({ agentType: inv.agentType, error: "fail" })),
                  };
                }
                return {
                  succeeded: invs.map((inv) => ({ agentType: inv.agentType, result: "ok" })),
                  failed: [],
                };
              }
              if (l1AllFail) {
                return {
                  succeeded: [],
                  failed: invs.map((inv) => ({ agentType: inv.agentType, error: "fail" })),
                };
              }
              return {
                succeeded: invs.map((inv) => ({ agentType: inv.agentType, result: "ok" })),
                failed: [],
              };
            },
          );

          const executor = async (inv: SubagentInvocation): Promise<SubagentResult> => ({
            status: "success",
            agentType: inv.agentType,
            output: "ok",
          });

          const result = await runReviewFallbackLadder({
            invocations,
            executor,
            ciEvidencePath: hasCiEvidence ? "/dev/null" : undefined,
          });

          // Trace level count must match methodology
          if (result.methodology === "subagent-parallel") {
            expect(result.trace).toHaveLength(1);
            expect(result.trace[0].level).toBe("L0");
            expect(result.trace[0].outcome).toBe("all-success");
          } else if (result.methodology === "subagent-serial") {
            expect(result.trace.length).toBeGreaterThanOrEqual(2);
            expect(result.trace[0].level).toBe("L0");
            expect(result.trace[0].outcome).toBe("all-fail");
            expect(result.trace[1].level).toBe("L1");
          } else if (result.methodology === "unavailable") {
            expect(result.trace.length).toBeGreaterThanOrEqual(4);
            expect(result.trace.map((t) => t.level)).toEqual(["L0", "L1", "L2", "L3"]);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("failure signature is populated when L0 fails", async () => {
    await fc.assert(
      fc.asyncProperty(failureErrorArb, async (errorMsg) => {
        vi.clearAllMocks();
        const invocations = ARBITRARY_AGENT_TYPES.map(makeInvocation);

        (runSubagentsWithConcurrency as ReturnType<typeof vi.fn>).mockResolvedValue({
          succeeded: [],
          failed: invocations.map((inv) => ({ agentType: inv.agentType, error: errorMsg })),
        });

        const executor = async (inv: SubagentInvocation): Promise<SubagentResult> => ({
          status: "failure",
          agentType: inv.agentType,
          error: errorMsg,
        });

        const result = await runReviewFallbackLadder({ invocations, executor });

        expect(result.l0FailureSignature).toBeDefined();
        expect(result.l0FailureSignature!.length).toBeGreaterThan(0);
        expect(result.retryCount).toBe(1);
      }),
      { numRuns: 200 },
    );
  });
});
