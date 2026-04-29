/**
 * Property-based tests for Build research phase migration.
 *
 * Feature: agent-team-migration
 * Property 6: Research findings merge completeness
 *
 * @module test/research-merge.property
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildResearchSubagents, mergeResearchFindings, } from "../src/build.js";
// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
const researchTopicArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0);
const researchResultArb = fc.record({
    agentType: fc.string({ minLength: 1, maxLength: 20 }),
    status: fc.constantFrom("success", "failure", "timeout"),
    output: fc.option(fc.string({ minLength: 1, maxLength: 500 })),
    error: fc.option(fc.string({ minLength: 1, maxLength: 200 })),
});
// ---------------------------------------------------------------------------
// Property 6: Research findings merge completeness
// ---------------------------------------------------------------------------
describe("Feature: agent-team-migration, Property 6: research findings merge completeness", () => {
    it("merged document contains all findings from every successful subagent with none lost", () => {
        fc.assert(fc.property(fc.array(researchResultArb, { minLength: 1, maxLength: 8 }), (results) => {
            const merged = mergeResearchFindings(results);
            const succeeded = results.filter((r) => r.status === "success" && r.output);
            // All successful outputs should appear in the merged document
            for (const s of succeeded) {
                expect(merged).toContain(s.output);
            }
        }), { numRuns: 100 });
    });
    it("buildResearchSubagents creates one invocation per topic", () => {
        fc.assert(fc.property(fc.array(researchTopicArb, { minLength: 1, maxLength: 5 }), (topics) => {
            const invocations = buildResearchSubagents(topics);
            expect(invocations).toHaveLength(topics.length);
            for (const inv of invocations) {
                expect(inv.prompt.length).toBeGreaterThan(0);
                expect(["default", "acceptEdits"]).toContain(inv.permissionMode);
                expect(inv.maxTurns).toBeGreaterThan(0);
            }
        }), { numRuns: 100 });
    });
    it("handles all-failure case with empty merged document", () => {
        fc.assert(fc.property(fc.array(fc.record({
            agentType: fc.string({ minLength: 1, maxLength: 20 }),
            status: fc.constantFrom("failure", "timeout"),
            error: fc.string({ minLength: 1, maxLength: 100 }),
        }), { minLength: 1, maxLength: 5 }), (failedResults) => {
            const merged = mergeResearchFindings(failedResults);
            // Should indicate partial or complete failure
            expect(merged).toContain("部分研究");
        }), { numRuns: 100 });
    });
});
//# sourceMappingURL=research-merge.property.test.js.map