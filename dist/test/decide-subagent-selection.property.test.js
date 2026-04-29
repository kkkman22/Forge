/**
 * Property-based tests for Decide engine migration.
 *
 * Feature: agent-team-migration
 * Property 3: Decide Round 1 member selection
 * Property 4: Critic blocking issues trigger needs_revision
 *
 * @module test/decide-subagent-selection.property
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildDecideRound1Subagents, buildDecideCriticInvocation, resolveDecideStatus, involvesUIChanges, } from "../src/decide.js";
// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
const filePathArb = fc.string({ minLength: 1, maxLength: 50 }).map((s) => `src/${s}.ts`);
const decideContextArb = fc.record({
    taskDescription: fc.string({ minLength: 1, maxLength: 200 }),
    involvedFiles: fc.array(filePathArb, { maxLength: 10 }),
});
// ---------------------------------------------------------------------------
// Property 3: Decide Round 1 member selection
// ---------------------------------------------------------------------------
describe("Feature: agent-team-migration, Property 3: decide member selection", () => {
    it("always includes product, architect, security; designer iff involvesUIChanges", () => {
        fc.assert(fc.property(decideContextArb, (context) => {
            const invocations = buildDecideRound1Subagents(context);
            const agentTypes = invocations.map((inv) => inv.agentType);
            // product, architect, security are always present
            expect(agentTypes).toContain("product");
            expect(agentTypes).toContain("architect");
            expect(agentTypes).toContain("security");
            // designer is present iff involvesUIChanges
            const hasUI = involvesUIChanges(context);
            if (hasUI) {
                expect(agentTypes).toContain("designer");
            }
            else {
                expect(agentTypes).not.toContain("designer");
            }
            // Count: 3 default + 1 optional designer
            const expectedCount = hasUI ? 4 : 3;
            expect(invocations).toHaveLength(expectedCount);
        }), { numRuns: 100 });
    });
    it("every invocation has valid protocol fields and 500-token limit hint", () => {
        fc.assert(fc.property(decideContextArb, (context) => {
            const invocations = buildDecideRound1Subagents(context);
            for (const inv of invocations) {
                expect(inv.prompt.length).toBeGreaterThan(0);
                expect(["default", "acceptEdits"]).toContain(inv.permissionMode);
                expect(inv.maxTurns).toBeGreaterThan(0);
                // 500-token output limit should be mentioned in prompt
                expect(inv.prompt).toContain("500");
            }
        }), { numRuns: 100 });
    });
});
// ---------------------------------------------------------------------------
// Property 4: Critic blocking → needs_revision
// ---------------------------------------------------------------------------
describe("Feature: agent-team-migration, Property 4: critic blocking → status", () => {
    const criticOutputArb = fc.oneof(fc.record({
        hasBlockingIssues: fc.constant(true),
        issues: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 1, maxLength: 5 }),
    }), fc.record({
        hasBlockingIssues: fc.constant(false),
        issues: fc.constant([]),
    }));
    it("returns needs_revision when blocking issues present, confirmed otherwise", () => {
        fc.assert(fc.property(criticOutputArb, (output) => {
            const status = resolveDecideStatus(output);
            if (output.hasBlockingIssues) {
                expect(status).toBe("needs_revision");
            }
            else {
                expect(status).toBe("confirmed");
            }
        }), { numRuns: 100 });
    });
    it("buildDecideCriticInvocation includes all Round 1 outputs", () => {
        fc.assert(fc.property(decideContextArb, fc.array(fc.string({ minLength: 1, maxLength: 200 }), { minLength: 1, maxLength: 4 }), (context, round1Outputs) => {
            const criticInv = buildDecideCriticInvocation(round1Outputs, context);
            expect(criticInv.agentType).toBe("critic");
            expect(criticInv.prompt.length).toBeGreaterThan(0);
            // All Round 1 outputs should be referenced in the critic prompt
            for (const output of round1Outputs) {
                expect(criticInv.prompt).toContain(output);
            }
        }), { numRuns: 100 });
    });
});
//# sourceMappingURL=decide-subagent-selection.property.test.js.map