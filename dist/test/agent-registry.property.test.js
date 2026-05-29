/**
 * Property-based tests for the agent registry module.
 *
 * Covers:
 *   - Property 1: registration idempotency (re-register overwrites without error)
 *   - Property 2: unregistered name throws with available agent list
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createAgentRegistry } from "../src/agent-registry.js";
// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------
const agentNameArb = fc
    .string({ minLength: 1, maxLength: 20 })
    .filter((s) => /^[a-zA-Z0-9_-]+$/.test(s));
const factoryArb = fc.constant(() => ({
    name: "mock-agent",
    async run() {
        return {
            output: {
                success: true,
                summary: "mock",
                key_changes_made: [],
                key_learnings: [],
            },
            usage: {
                inputTokens: 0,
                outputTokens: 0,
                cacheReadTokens: 0,
                cacheCreationTokens: 0,
            },
        };
    },
}));
// ---------------------------------------------------------------------------
// Property 1: registration idempotency
// ---------------------------------------------------------------------------
describe("Feature: multi-platform-support, Property 1: registration idempotency", () => {
    it("re-registering overwrites without error", () => {
        fc.assert(fc.property(agentNameArb, factoryArb, factoryArb, (name, f1, f2) => {
            const registry = createAgentRegistry();
            registry.register(name, f1);
            expect(registry.has(name)).toBe(true);
            expect(registry.listAgents()).toContain(name);
            // Re-register should not throw.
            registry.register(name, f2);
            expect(registry.has(name)).toBe(true);
            expect(registry.listAgents()).toContain(name);
            // Resolve returns the new factory's agent.
            const agent = registry.resolve(name, { cwd: "/tmp" });
            expect(agent.name).toBe("mock-agent");
        }), { numRuns: 200 });
    });
});
// ---------------------------------------------------------------------------
// Property 2: unregistered name throws with available agent list
// ---------------------------------------------------------------------------
describe("Feature: multi-platform-support, Property 2: unregistered name throws", () => {
    it("throws a descriptive error listing available agents", () => {
        fc.assert(fc.property(fc.array(fc.tuple(agentNameArb, factoryArb), { minLength: 0, maxLength: 10 }), agentNameArb, (entries, unknownName) => {
            const registry = createAgentRegistry();
            for (const [name, factory] of entries) {
                registry.register(name, factory);
            }
            // If the unknown name happens to be registered, skip.
            if (registry.has(unknownName))
                return;
            expect(() => registry.resolve(unknownName, { cwd: "/tmp" })).toThrow(/is not registered/);
            expect(() => registry.resolve(unknownName, { cwd: "/tmp" })).toThrow(new RegExp(`Available agents: ${registry.listAgents().join(", ")}`));
        }), { numRuns: 200 });
    });
});
//# sourceMappingURL=agent-registry.property.test.js.map