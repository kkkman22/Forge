import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../src/subagent-runner.js", () => ({
    runSubagentsWithConcurrency: vi.fn(),
}));
import { runReviewFallbackLadder } from "../../src/review.js";
import { FINAL_REPORT_SENTINEL } from "../../src/review-final-block.js";
import { runSubagentsWithConcurrency } from "../../src/subagent-runner.js";
const mockedRunner = runSubagentsWithConcurrency;
function inv(agentType) {
    return { agentType, prompt: "...", permissionMode: "default", maxTurns: 10 };
}
function preamble(_agentType) {
    // What the broken sub-agent emitted in the real-world incident:
    // "Now let me check one of the test files to understand test coverage:"
    return "Now let me check one of the test files to understand test coverage:";
}
function validReport(layer, reviewer) {
    const headings = {
        1: "## Layer 1 — Spec Alignment",
        2: "## Layer 2 — Code Quality",
        3: "## Layer 3 — Security & Risk",
    };
    return `${headings[layer]}

**Reviewer**: ${reviewer}

| # | Severity | Issue | Suggestion |
|---|----------|-------|------------|
| 1 | P3 | nit | refactor |

${FINAL_REPORT_SENTINEL}`;
}
describe("runReviewFallbackLadder × final-report contract", () => {
    beforeEach(() => {
        vi.spyOn(console, "warn").mockImplementation(() => { });
        vi.clearAllMocks();
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });
    it("treats SDK-success-but-no-final-block as L0 failure and falls through to L1", async () => {
        const invocations = [inv("spec-check"), inv("quality-check"), inv("security-check")];
        let call = 0;
        mockedRunner.mockImplementation((invs, _exec, _concurrency) => {
            call++;
            if (call === 1) {
                // Simulate the real-world incident: SDK reports success
                // but the output is just a preamble like "Now let me check..."
                return {
                    succeeded: invs.map((i) => ({
                        agentType: i.agentType,
                        result: preamble(i.agentType),
                    })),
                    failed: [],
                };
            }
            // L1 produces well-formed reports
            return {
                succeeded: invs.map((i, idx) => ({
                    agentType: i.agentType,
                    result: validReport(idx + 1, i.agentType),
                })),
                failed: [],
            };
        });
        const executor = async (i) => ({
            agentType: i.agentType,
            status: "success",
            output: preamble(i.agentType),
        });
        const result = await runReviewFallbackLadder({ invocations, executor });
        // Should have rolled to subagent-serial (L1) because L0 outputs were rejected
        expect(result.methodology).toBe("subagent-serial");
        expect(result.retryCount).toBe(1);
        // L1 succeeded with three valid reports
        expect(result.succeeded).toHaveLength(3);
        expect(result.l0FailureSignature).toContain("incomplete-report");
    });
    it("partial preamble + partial valid is partial-success at L0 (no escalation)", async () => {
        const invocations = [inv("spec-check"), inv("quality-check"), inv("security-check")];
        mockedRunner.mockImplementation((invs, _exec, _concurrency) => {
            return {
                // spec-check returns preamble (invalid), other two are valid
                succeeded: [
                    { agentType: invs[0].agentType, result: preamble(invs[0].agentType) },
                    { agentType: invs[1].agentType, result: validReport(2, invs[1].agentType) },
                    { agentType: invs[2].agentType, result: validReport(3, invs[2].agentType) },
                ],
                failed: [],
            };
        });
        const executor = async (i) => ({
            agentType: i.agentType,
            status: "success",
            output: validReport(2, i.agentType),
        });
        const result = await runReviewFallbackLadder({ invocations, executor });
        // L0 partial-success: keep parallel methodology, do not escalate
        expect(result.methodology).toBe("subagent-parallel");
        expect(result.succeeded).toHaveLength(2);
        expect(result.failed).toHaveLength(1);
        expect(result.failed[0].agentType).toBe("spec-check");
        expect(result.failed[0].error).toContain("incomplete-report");
    });
    it("treats success with valid final-report block as L0 all-success", async () => {
        const invocations = [inv("spec-check"), inv("quality-check"), inv("security-check")];
        mockedRunner.mockImplementation((invs, _exec, _concurrency) => ({
            succeeded: invs.map((i, idx) => ({
                agentType: i.agentType,
                result: validReport(idx + 1, i.agentType),
            })),
            failed: [],
        }));
        const executor = async (i) => ({
            agentType: i.agentType,
            status: "success",
            output: validReport(1, i.agentType),
        });
        const result = await runReviewFallbackLadder({ invocations, executor });
        expect(result.methodology).toBe("subagent-parallel");
        expect(result.succeeded).toHaveLength(3);
        expect(result.failed).toHaveLength(0);
    });
});
//# sourceMappingURL=fallback-ladder-final-block.test.js.map