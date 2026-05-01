/**
 * Property-based tests for Subagent invocation protocol and parallel runner.
 *
 * Feature: agent-team-migration
 * Property 2: Parallel execution fault tolerance
 * Property 5: Invocation protocol completeness
 *
 * @module test/subagent-runner.property
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildSubagentInvocations, runSubagentsInParallel } from "../src/subagent-runner.js";
// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
const VALID_AGENT_TYPES = [
    "spec-check",
    "quality-check",
    "security-check",
    "product",
    "architect",
    "security",
    "designer",
    "critic",
    "Explore",
];
const agentTypeArb = fc.constantFrom(...VALID_AGENT_TYPES);
const _permissionModeArb = fc.constantFrom("default", "acceptEdits");
const subagentResultArb = fc.oneof(fc.record({
    agentType: agentTypeArb,
    status: fc.constant("success"),
    output: fc.string({ minLength: 1, maxLength: 500 }),
}), fc.record({
    agentType: agentTypeArb,
    status: fc.constant("failure"),
    error: fc.string({ minLength: 1, maxLength: 200 }),
}), fc.record({
    agentType: agentTypeArb,
    status: fc.constant("timeout"),
    error: fc.string({ minLength: 1, maxLength: 200 }),
}));
// ---------------------------------------------------------------------------
// Property 2: Parallel execution fault tolerance
// ---------------------------------------------------------------------------
describe("Feature: agent-team-migration, Property 2: parallel execution fault tolerance", () => {
    it("preserves all successful results and reports all failures for any mix of outcomes", async () => {
        await fc.assert(fc.asyncProperty(fc.array(subagentResultArb, { minLength: 1, maxLength: 10 }), async (results) => {
            const invocations = results.map((r, i) => ({
                agentType: `${r.agentType}-${i}`,
                prompt: `test prompt for ${r.agentType}-${i}`,
                permissionMode: "default",
                maxTurns: 5,
            }));
            let callIdx = 0;
            const executor = async () => {
                const result = results[callIdx % results.length];
                callIdx++;
                return {
                    ...result,
                    agentType: `${result.agentType}-${(callIdx - 1) % results.length}`,
                };
            };
            const outcome = await runSubagentsInParallel(invocations, executor);
            const expectedSucceeded = results.filter((r) => r.status === "success");
            const _expectedFailed = results.filter((r) => r.status !== "success");
            expect(outcome.succeeded.length + outcome.failed.length).toBe(results.length);
            expect(outcome.succeeded.length).toBe(expectedSucceeded.length);
        }), { numRuns: 100 });
    });
    it("handles all-success case without losing results", async () => {
        await fc.assert(fc.asyncProperty(fc.array(fc.record({
            agentType: agentTypeArb,
            status: fc.constant("success"),
            output: fc.string({ minLength: 1, maxLength: 100 }),
        }), { minLength: 2, maxLength: 5 }), async (successResults) => {
            const invocations = successResults.map((r) => ({
                agentType: r.agentType,
                prompt: `test for ${r.agentType}`,
                permissionMode: "default",
                maxTurns: 5,
            }));
            const executor = async () => successResults[0];
            const outcome = await runSubagentsInParallel(invocations, executor);
            expect(outcome.failed).toHaveLength(0);
            expect(outcome.succeeded).toHaveLength(invocations.length);
        }), { numRuns: 100 });
    });
    it("handles all-failure case without discarding error information", async () => {
        await fc.assert(fc.asyncProperty(fc.array(fc.record({
            agentType: agentTypeArb,
            status: fc.constantFrom("failure", "timeout"),
            error: fc.string({ minLength: 1, maxLength: 100 }),
        }), { minLength: 1, maxLength: 5 }), async (failedResults) => {
            const invocations = failedResults.map((r, i) => ({
                agentType: r.agentType,
                prompt: `test ${i}`,
                permissionMode: "default",
                maxTurns: 5,
            }));
            let callIndex = 0;
            const executor = async () => {
                return failedResults[callIndex++ % failedResults.length];
            };
            const outcome = await runSubagentsInParallel(invocations, executor);
            expect(outcome.succeeded).toHaveLength(0);
            expect(outcome.failed.length).toBe(invocations.length);
            for (const f of outcome.failed) {
                expect(f.error.length).toBeGreaterThan(0);
            }
        }), { numRuns: 100 });
    });
});
// ---------------------------------------------------------------------------
// Property 5: Invocation protocol completeness
// ---------------------------------------------------------------------------
describe("Feature: agent-team-migration, Property 5: invocation protocol completeness", () => {
    it("every built invocation has non-empty prompt, valid permissionMode, positive maxTurns, and valid agentType", () => {
        fc.assert(fc.property(fc.record({
            agentType: agentTypeArb,
            taskDescription: fc.string({ minLength: 1, maxLength: 100 }),
        }), (context) => {
            const invocations = buildSubagentInvocations([context.agentType], context.taskDescription);
            for (const inv of invocations) {
                expect(inv.prompt.length).toBeGreaterThan(0);
                expect(["default", "acceptEdits"]).toContain(inv.permissionMode);
                expect(inv.maxTurns).toBeGreaterThan(0);
                expect(VALID_AGENT_TYPES).toContain(inv.agentType);
            }
        }), { numRuns: 100 });
    });
});
//# sourceMappingURL=subagent-runner.property.test.js.map