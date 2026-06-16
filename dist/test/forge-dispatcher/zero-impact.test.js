import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CMUX_GATED_SUBS, checkCmuxGate } from "../../src/forge-dispatcher/cmux-gate.js";
const LIB_ROOT = resolve(import.meta.dirname, "../../skills/forge/lib");
const NON_CMUX_SUBS = [
    "abort",
    "accept",
    "build",
    "build-light",
    "control-cli",
    "control-ui",
    "debug",
    "decide",
    "decide-teams",
    "fix",
    "fix-conflicts",
    "grill",
    "learn",
    "loop",
    "mutate",
    "pack",
    "plan",
    "recap",
    "refactor",
    "replay",
    "resume",
    "review",
    "router",
    "ship",
    "spec",
    "status",
    "storm",
    "test",
    "verify",
    "zoom-out",
];
describe("Zero-Impact: non-cmux subs unaffected by migration", () => {
    it("all non-cmux subs return n_a from gate", () => {
        for (const sub of NON_CMUX_SUBS) {
            const result = checkCmuxGate(sub);
            expect(result.ok, `${sub} should pass gate`).toBe(true);
            if (result.ok) {
                expect(result.gate_result, `${sub} should be n_a`).toBe("n_a");
                expect(result.cmux_available, `${sub} cmux_available should be null`).toBeNull();
            }
        }
    });
    it("CMUX_GATED_SUBS contains exactly the 3 cmux subs", () => {
        expect(CMUX_GATED_SUBS.size).toBe(3);
        for (const sub of NON_CMUX_SUBS) {
            expect(CMUX_GATED_SUBS.has(sub), `${sub} should NOT be in CMUX_GATED_SUBS`).toBe(false);
        }
    });
    it("non-cmux sub instructions.md sha256 set matches expected count", () => {
        const manifest = JSON.parse(readFileSync(resolve(LIB_ROOT, "manifest.json"), "utf-8"));
        let nonCmuxCount = 0;
        for (const sub of Object.keys(manifest.subs)) {
            if (!CMUX_GATED_SUBS.has(sub)) {
                nonCmuxCount++;
                const instrPath = resolve(LIB_ROOT, sub, "instructions.md");
                const content = readFileSync(instrPath);
                const sha = createHash("sha256").update(content).digest("hex");
                expect(sha, `${sub} sha256 should match manifest`).toBe(manifest.subs[sub].instructions.sha256);
            }
        }
        // 34 non-cmux subs (37 total - 3 cmux)
        expect(nonCmuxCount).toBe(34);
    });
    it("gate adds zero overhead: non-cmux subs never probe cmux", () => {
        let probeCount = 0;
        const statSpy = () => {
            probeCount++;
            throw new Error("ENOENT");
        };
        for (const sub of NON_CMUX_SUBS) {
            checkCmuxGate(sub, { statSync: statSpy });
        }
        expect(probeCount).toBe(0);
    });
});
//# sourceMappingURL=zero-impact.test.js.map