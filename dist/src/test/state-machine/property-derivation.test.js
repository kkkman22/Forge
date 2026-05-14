import { describe, expect, it } from "vitest";
import { deriveStatePropertyTests } from "../../src/state-machine/property-derivation.js";
function defWithInvariants(invariants) {
    return {
        name: "test",
        description: "test machine",
        states: [
            { name: "A", description: "a" },
            { name: "B", description: "b", terminal: true },
        ],
        initial: "A",
        transitions: [{ from: "A", to: "B", event: "Go" }],
        invariants,
    };
}
describe("deriveStatePropertyTests", () => {
    it("generates terminal_state_has_no_outgoing_transitions test", () => {
        const code = deriveStatePropertyTests(defWithInvariants([
            { expression: "terminal_state_has_no_outgoing_transitions", description: "no out edges" },
        ]));
        expect(code).toContain("terminal");
        expect(code).toContain("fc.assert");
    });
    it("generates <state>_before_<state>_only test", () => {
        const code = deriveStatePropertyTests(defWithInvariants([
            { expression: "cancelled_before_check_in_only", description: "cancel before check-in" },
        ]));
        expect(code).toContain("cancelled");
        expect(code).toContain("check_in");
        expect(code).toContain("fc.assert");
    });
    it("generates no_<state>_requires_<condition>_passed test", () => {
        const code = deriveStatePropertyTests(defWithInvariants([
            {
                expression: "no_show_requires_arrival_cutoff_passed",
                description: "noshow needs cutoff",
            },
        ]));
        expect(code).toContain("show");
        expect(code).toContain("arrival_cutoff");
        expect(code).toContain("fc.assert");
    });
    it("generates <state>_requires_<condition> test", () => {
        const code = deriveStatePropertyTests(defWithInvariants([
            { expression: "check_out_requires_folio_settled", description: "folio must be settled" },
        ]));
        expect(code).toContain("folio_settled");
        expect(code).toContain("CheckOut");
        expect(code).toContain("fc.assert");
    });
    it("generates TODO placeholder for unrecognized invariant", () => {
        const code = deriveStatePropertyTests(defWithInvariants([{ expression: "custom_business_rule", description: "some custom rule" }]));
        expect(code).toContain("// TODO:");
        expect(code).toContain("custom_business_rule");
        expect(code).toContain("some custom rule");
    });
    it("wraps in describe block with machine name", () => {
        const code = deriveStatePropertyTests(defWithInvariants([
            { expression: "terminal_state_has_no_outgoing_transitions", description: "test" },
        ]));
        expect(code).toContain('describe("Test State Machine');
    });
    it("handles multiple invariants", () => {
        const code = deriveStatePropertyTests(defWithInvariants([
            { expression: "terminal_state_has_no_outgoing_transitions", description: "t1" },
            { expression: "cancelled_before_check_in_only", description: "t2" },
        ]));
        const itCount = code.match(/\bit\(/g)?.length ?? 0;
        expect(itCount).toBe(2);
    });
    it("handles empty invariants", () => {
        const code = deriveStatePropertyTests(defWithInvariants([]));
        expect(code).toContain("describe");
        // No it() blocks
        expect(code.match(/\bit\(/g)).toBeNull();
    });
});
//# sourceMappingURL=property-derivation.test.js.map