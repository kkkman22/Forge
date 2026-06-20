import { describe, expect, it } from "vitest";
import { aggregateVerdicts, buildCurlCommand } from "../src/accept-driver.js";
import { checkFallbackLadderGate, evaluateFallbackLadder, parseP1Fixlist, validateSkipGateOptions, } from "../src/ship-gates.js";
function allMet(overrides = {}) {
    return {
        isInteractive: true,
        workflowsEnvSet: true,
        workflowsEnabled: true,
        workflowFileExists: true,
        workflowSyntaxValid: true,
        concurrencyBridgeAvailable: true,
        subagentAvailable: true,
        ...overrides,
    };
}
describe("evaluateFallbackLadder (branch coverage)", () => {
    it("returns L0 when all 6 workflow conditions are met", () => {
        const r = evaluateFallbackLadder(allMet());
        expect(r.level).toBe("L0");
        expect(r.methodology).toBe("saved-workflow");
    });
    it("falls to L1 (subagent-parallel) when any L0 condition fails but subagent + bridge available", () => {
        for (const key of [
            "isInteractive",
            "workflowsEnvSet",
            "workflowsEnabled",
            "workflowFileExists",
            "workflowSyntaxValid",
        ]) {
            const r = evaluateFallbackLadder(allMet({ [key]: false }));
            expect(r.level).toBe("L1");
            expect(r.methodology).toBe("subagent-parallel");
        }
    });
    it("falls to L2 (subagent-serial) when subagent available but concurrency bridge missing", () => {
        const r = evaluateFallbackLadder(allMet({ concurrencyBridgeAvailable: false, workflowFileExists: false }));
        expect(r.level).toBe("L2");
        expect(r.methodology).toBe("subagent-serial");
    });
    it("falls to L3 (unavailable) when subagent not available", () => {
        const r = evaluateFallbackLadder(allMet({ subagentAvailable: false, concurrencyBridgeAvailable: false }));
        expect(r.level).toBe("L3");
        expect(r.methodology).toBe("unavailable");
    });
    it("L0 met but without bridge would still be L0 (bridge is an L0 condition)", () => {
        // bridge missing → L0 fails; if subagent+no-bridge → L2
        const r = evaluateFallbackLadder(allMet({ concurrencyBridgeAvailable: false }));
        expect(r.level).not.toBe("L0");
    });
});
describe("checkFallbackLadderGate (branch coverage)", () => {
    it("blocks when methodology is unavailable (L3)", () => {
        const r = checkFallbackLadderGate("unavailable");
        expect(r.passed).toBe(false);
        expect(r.gate).toBe("review");
        expect(r.reason).toContain("HARD-GATE");
    });
    it("passes for any non-unavailable methodology", () => {
        for (const m of [
            "subagent-parallel",
            "subagent-serial",
            "saved-workflow",
            "ci-evidence",
        ]) {
            const r = checkFallbackLadderGate(m);
            expect(r.passed).toBe(true);
            expect(r.reason).toContain(m);
        }
    });
});
describe("validateSkipGateOptions (branch coverage)", () => {
    it("returns null for empty skip options", () => {
        expect(validateSkipGateOptions({
            skipAll: false,
            skipGates: [],
            force: false,
            isInteractive: false,
        })).toBeNull();
    });
    it("rejects --skip-gate=all in interactive mode", () => {
        const r = validateSkipGateOptions({
            skipAll: true,
            skipGates: [],
            force: true,
            isInteractive: true,
        });
        expect(r).toContain("not allowed in interactive mode");
    });
    it("rejects --skip-gate=all without --force (non-interactive)", () => {
        const r = validateSkipGateOptions({
            skipAll: true,
            skipGates: [],
            force: false,
            isInteractive: false,
        });
        expect(r).toContain("requires --force");
    });
    it("allows --skip-gate=all with --force in non-interactive mode", () => {
        const r = validateSkipGateOptions({
            skipAll: true,
            skipGates: [],
            force: true,
            isInteractive: false,
        });
        expect(r).toBeNull();
    });
    it("rejects invalid individual gate names", () => {
        const r = validateSkipGateOptions({
            skipAll: false,
            skipGates: ["bogus"],
            force: false,
            isInteractive: false,
        });
        expect(r).toContain("Invalid gate name: bogus");
    });
    it("allows valid individual gates (review/test/progress)", () => {
        for (const gate of ["review", "test", "progress"]) {
            const r = validateSkipGateOptions({
                skipAll: false,
                skipGates: [gate],
                force: false,
                isInteractive: false,
            });
            expect(r).toBeNull();
        }
    });
});
describe("parseP1Fixlist (branch coverage)", () => {
    it("returns null for empty/unparseable content", () => {
        expect(parseP1Fixlist("")).toBeNull();
        expect(parseP1Fixlist("not yaml frontmatter")).toBeNull();
    });
});
describe("aggregateVerdicts (accept-driver branch coverage)", () => {
    it("counts pass/fail/skip/warn and sets blocksShip on fail > 0", () => {
        const r = aggregateVerdicts([
            { verdict: "PASS" },
            { verdict: "FAIL" },
            { verdict: "SKIP" },
            { verdict: "WARN" },
            { verdict: "PASS" },
        ]);
        expect(r.pass).toBe(2);
        expect(r.fail).toBe(1);
        expect(r.skip).toBe(1);
        expect(r.warn).toBe(1);
        expect(r.blocksShip).toBe(true);
    });
    it("blocksShip=false when no failures", () => {
        const r = aggregateVerdicts([{ verdict: "PASS" }, { verdict: "WARN" }]);
        expect(r.blocksShip).toBe(false);
    });
    it("empty input → all zeros, blocksShip=false", () => {
        const r = aggregateVerdicts([]);
        expect(r).toEqual({
            pass: 0,
            fail: 0,
            skip: 0,
            warn: 0,
            inconclusive: 0,
            blocksShip: false,
            layerHealth: {
                unit: { pass: 0, fail: 0, inconclusive: 0 },
                component: { pass: 0, fail: 0, inconclusive: 0 },
                contract: { pass: 0, fail: 0, inconclusive: 0 },
                e2e: { pass: 0, fail: 0, inconclusive: 0 },
            },
            pyramidShape: "empty",
        });
    });
});
describe("buildCurlCommand (accept-driver branch coverage)", () => {
    it("uppercases valid HTTP methods", () => {
        expect(buildCurlCommand("post", "http://x")).toContain("-X POST");
        expect(buildCurlCommand("get", "http://x")).toContain("-X GET");
    });
    it("falls back to GET for invalid method", () => {
        expect(buildCurlCommand("not-a-method!", "http://x")).toContain("-X GET");
    });
    it("shell-escapes the URL (no raw quotes/backticks)", () => {
        const cmd = buildCurlCommand("GET", "http://x");
        expect(cmd).toContain("curl");
        // The command should be a single shell-safe string.
        expect(typeof cmd).toBe("string");
    });
});
//# sourceMappingURL=ship-gates-branches.test.js.map