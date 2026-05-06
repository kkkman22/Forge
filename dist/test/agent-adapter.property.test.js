/**
 * Property-based tests for the agent-adapter module.
 *
 * Covers:
 *   - Property 20: Agent 工厂函数正确性
 *
 * **Validates: Requirements 9.3, 9.4**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { getUnsupportedAgentError, isValidAgentName, SUPPORTED_AGENTS, } from "../src/agent-adapter.js";
// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
/** Arbitrary valid agent name from the supported set. */
const validAgentNameArb = fc.constantFrom("claude", "codex", "opencode", "rovodev");
/** Arbitrary invalid agent name — any string not in the supported set. */
const invalidAgentNameArb = fc
    .string()
    .filter((s) => !["claude", "codex", "opencode", "rovodev"].includes(s));
// ---------------------------------------------------------------------------
// Feature: gnhf-inspired-enhancements, Property 20: Agent 工厂函数正确性
// ---------------------------------------------------------------------------
describe("Feature: gnhf-inspired-enhancements, Property 20: Agent 工厂函数正确性", () => {
    /**
     * **Validates: Requirements 9.3**
     */
    it("isValidAgentName returns true for all supported agent names", () => {
        fc.assert(fc.property(validAgentNameArb, (name) => {
            expect(isValidAgentName(name)).toBe(true);
        }), { numRuns: 50 });
    });
    /**
     * **Validates: Requirements 9.3**
     */
    it("isValidAgentName returns false for invalid agent names", () => {
        fc.assert(fc.property(invalidAgentNameArb, (name) => {
            expect(isValidAgentName(name)).toBe(false);
        }), { numRuns: 50 });
    });
    /**
     * **Validates: Requirements 9.4**
     */
    it("getUnsupportedAgentError returns a message containing all supported agent types", () => {
        fc.assert(fc.property(invalidAgentNameArb, (name) => {
            const error = getUnsupportedAgentError(name);
            for (const agent of SUPPORTED_AGENTS) {
                expect(error).toContain(agent);
            }
        }), { numRuns: 50 });
    });
    /**
     * **Validates: Requirements 9.4**
     */
    it("getUnsupportedAgentError includes the invalid name in the message", () => {
        fc.assert(fc.property(invalidAgentNameArb, (name) => {
            const error = getUnsupportedAgentError(name);
            expect(error).toContain(name);
        }), { numRuns: 50 });
    });
    /**
     * **Validates: Requirements 9.3**
     */
    it("SUPPORTED_AGENTS contains exactly the four expected agent names", () => {
        expect(SUPPORTED_AGENTS).toEqual(["claude", "codex", "opencode", "rovodev"]);
    });
});
//# sourceMappingURL=agent-adapter.property.test.js.map