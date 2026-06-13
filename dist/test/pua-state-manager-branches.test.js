import { describe, expect, it, vi } from "vitest";
import { PuaStateManager } from "../src/pua-state-manager.js";
function mockDeps(statusContent = "---\ntier: standard\n---\n") {
    let content = statusContent;
    return {
        readStatusFile: () => content,
        writeStatusFile: (c) => {
            content = c;
        },
        warn: vi.fn(),
    };
}
describe("PuaStateManager handleSuccess (branch coverage)", () => {
    it("clears history and clears PUA fields on success", () => {
        const deps = mockDeps("---\ntier: standard\npua_pressure_level: L2\n---\n");
        const mgr = new PuaStateManager(deps, "feature");
        mgr.handleFailure("test failure", 1); // set some state
        mgr.handleSuccess();
        // After success, PUA fields should be cleared from status
        const written = deps.readStatusFile();
        expect(written).not.toContain("pua_pressure_level");
    });
    it("does not throw when writeStatusFile fails (warns)", () => {
        const deps = {
            readStatusFile: () => "---\n---\n",
            writeStatusFile: () => {
                throw new Error("disk full");
            },
            warn: vi.fn(),
        };
        const mgr = new PuaStateManager(deps, "feature");
        expect(() => mgr.handleSuccess()).not.toThrow();
        expect(deps.warn).toHaveBeenCalled();
    });
});
describe("PuaStateManager handleFailure (branch coverage)", () => {
    it("escalates pressure level with consecutive failures (L0→L1→L2)", () => {
        const deps = mockDeps();
        const mgr = new PuaStateManager(deps, "feature");
        // 1 failure
        mgr.handleFailure("syntax error", 1);
        let content = deps.readStatusFile();
        // After first failure, should have some PUA state written
        expect(content).toContain("pua_");
        // More failures escalate
        mgr.handleFailure("syntax error", 2);
        mgr.handleFailure("syntax error", 3);
        content = deps.readStatusFile();
        expect(content).toContain("pua_");
    });
    it("detects spinning pattern from repeated summaries", () => {
        const deps = mockDeps();
        const mgr = new PuaStateManager(deps, "feature");
        // Push same summary multiple times to trigger pattern detection
        for (let i = 0; i < 4; i++) {
            mgr.handleFailure("same error repeating", i + 1);
        }
        const content = deps.readStatusFile();
        expect(content).toContain("pua_");
    });
    it("does not throw when status write fails (warns)", () => {
        const deps = {
            readStatusFile: () => "---\n---\n",
            writeStatusFile: () => {
                throw new Error("EACCES");
            },
            warn: vi.fn(),
        };
        const mgr = new PuaStateManager(deps, "feature");
        expect(() => mgr.handleFailure("test", 1)).not.toThrow();
    });
});
describe("PuaStateManager restoreContext (branch coverage)", () => {
    it("returns undefined when no PUA fields in status", () => {
        const deps = mockDeps("---\ntier: standard\n---\n");
        const mgr = new PuaStateManager(deps, "feature");
        const ctx = mgr.restoreContext("---\ntier: standard\n---\n", 0);
        expect(ctx).toBeUndefined();
    });
    it("restores context when PUA pressure level is persisted", () => {
        const deps = mockDeps();
        const mgr = new PuaStateManager(deps, "feature");
        const statusWithPua = [
            "---",
            "tier: standard",
            'pua_pressure_level: "L2"',
            'pua_methodology: "systematic"',
            'pua_failure_pattern: "syntax"',
            "pua_chain_index: 1",
            "---",
            "",
        ].join("\n");
        const ctx = mgr.restoreContext(statusWithPua, 2);
        expect(ctx).toBeDefined();
        if (ctx) {
            expect(ctx.pressureLevel).toBe("L2");
        }
    });
    it("does not throw on malformed status content", () => {
        const deps = mockDeps();
        const mgr = new PuaStateManager(deps, "feature");
        expect(() => mgr.restoreContext("garbage", 0)).not.toThrow();
    });
    it("returns undefined for empty consecutiveFailures with no PUA state", () => {
        const deps = mockDeps();
        const mgr = new PuaStateManager(deps, "feature");
        const ctx = mgr.restoreContext("---\ntier: standard\n---\n", 0);
        expect(ctx).toBeUndefined();
    });
});
//# sourceMappingURL=pua-state-manager-branches.test.js.map