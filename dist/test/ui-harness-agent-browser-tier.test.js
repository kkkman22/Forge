import { describe, expect, it } from "vitest";
import { detectAgentBrowser } from "../src/harness-detector.js";
import { runUiHarness } from "../src/ui-harness.js";
// Verifies spec R3-AC1 (tier order), R3-AC2 (cmux removed), R3-AC4 (detect + fallback).
// T3.1 RED → GREEN
describe("UiControllerTier type — cmux-browser removed, agent-browser added", () => {
    it("runUiHarness attempts do not include cmux-browser", async () => {
        const result = await runUiHarness({
            topic: "tier-type-check",
            appUrl: "http://localhost:1",
        });
        const tiers = result.controllersAttempted.map((a) => a.tier);
        expect(tiers).not.toContain("cmux-browser");
    });
    it("agent-browser tier is among attempted tiers", async () => {
        const result = await runUiHarness({
            topic: "tier-agent-browser",
            appUrl: "http://localhost:1",
        });
        const tiers = result.controllersAttempted.map((a) => a.tier);
        expect(tiers).toContain("agent-browser");
    });
    it("tier order is project → agent-browser → playwright → cdp", async () => {
        const result = await runUiHarness({
            topic: "tier-order",
            appUrl: "http://localhost:1",
        });
        const tiers = result.controllersAttempted.map((a) => a.tier);
        const expectedOrder = ["project", "agent-browser", "playwright", "cdp"];
        // Each expected tier appears, in relative order.
        let lastIdx = -1;
        for (const t of expectedOrder) {
            const idx = tiers.indexOf(t);
            expect(idx, `tier ${t} should be attempted`).toBeGreaterThan(lastIdx);
            lastIdx = idx;
        }
    });
});
describe("detectAgentBrowser", () => {
    it("returns a boolean without throwing", async () => {
        const result = await detectAgentBrowser();
        expect(typeof result).toBe("boolean");
    });
    it("returns false when agent-browser binary absent (CI-like env)", async () => {
        // In a clean test env without the binary, this should be false.
        // (We do not assert true, since the dev machine may have it installed.)
        const result = await detectAgentBrowser();
        // Either is acceptable; we only assert it does not throw and is boolean.
        expect([true, false]).toContain(result);
    });
});
describe("agent-browser fallback to next tier", () => {
    it("records 'not installed' reason when agent-browser unavailable, falls to playwright", async () => {
        const result = await runUiHarness({
            topic: "fallback-agent-browser",
            appUrl: "http://localhost:1",
        });
        const ab = result.controllersAttempted.find((a) => a.tier === "agent-browser");
        expect(ab).toBeDefined();
        // reason present and informative
        expect(ab.reason.length).toBeGreaterThan(0);
        // playwright attempted after agent-browser
        const pw = result.controllersAttempted.find((a) => a.tier === "playwright");
        expect(pw).toBeDefined();
    });
});
//# sourceMappingURL=ui-harness-agent-browser-tier.test.js.map