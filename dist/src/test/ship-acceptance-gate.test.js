import { describe, expect, it } from "vitest";
import { runAcceptanceGate } from "../src/ship.js";
describe("runAcceptanceGate", () => {
    const baseCtx = { projectRoot: "/project", cwd: "/project" };
    it("does not trigger when both flags false", async () => {
        const result = await runAcceptanceGate("topic", { acceptance_eval: false, acceptance_blocks_ship: false }, { withAcceptance: false, promoteDerived: false }, "", baseCtx);
        expect(result.triggered).toBe(false);
        expect(result.blocksShip).toBe(false);
    });
    it("triggers but returns empty when spec has no scenarios", async () => {
        const result = await runAcceptanceGate("topic", { acceptance_eval: true, acceptance_blocks_ship: false }, { withAcceptance: false, promoteDerived: false }, "## Overview\nSome content without scenarios", baseCtx);
        expect(result.triggered).toBe(true);
        expect(result.summary.pass).toBe(0);
        expect(result.blocksShip).toBe(false);
    });
    it("triggers and counts scenarios from spec", async () => {
        const specContent = [
            "## Scenarios",
            "### Scenario: first scenario",
            "Given a precondition",
            "When an action",
            "Then expected result",
            "",
            "### Scenario: second scenario",
            "Given another precondition",
            "When another action",
            "Then another expected result",
        ].join("\n");
        const result = await runAcceptanceGate("topic", { acceptance_eval: true, acceptance_blocks_ship: false }, { withAcceptance: false, promoteDerived: false }, specContent, baseCtx);
        expect(result.triggered).toBe(true);
        expect(result.summary.pass).toBe(2);
    });
    it("does not trigger via CLI when no spec content", async () => {
        const result = await runAcceptanceGate("topic", { acceptance_eval: false, acceptance_blocks_ship: false }, { withAcceptance: true, promoteDerived: false }, "", baseCtx);
        expect(result.triggered).toBe(true);
        expect(result.summary.pass).toBe(0);
    });
});
//# sourceMappingURL=ship-acceptance-gate.test.js.map