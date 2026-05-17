import { describe, it, expect } from "vitest";
import { dispatchForgeSubcommand } from "../../src/forge-dispatcher.js";
describe("R2.10: dispatcher_mode feature flag", () => {
    it("collapsed mode (default) dispatches via lib path", async () => {
        const r = await dispatchForgeSubcommand("build", {
            mode: "test",
            dispatcherMode: "collapsed",
        });
        expect(r.code).not.toBe("E_UNKNOWN_SUB");
        expect(r.dispatchPath).toContain("skills/forge/lib/build/instructions.md");
    });
    it("legacy mode outputs compatibility notice", async () => {
        const r = await dispatchForgeSubcommand("build", {
            mode: "test",
            dispatcherMode: "legacy",
        });
        expect(r.code).not.toBe("E_UNKNOWN_SUB");
        expect(r.notice).toContain("legacy mode");
    });
    it("R2.1 allowlist enforced in both modes", async () => {
        const rCollapsed = await dispatchForgeSubcommand("bogus-sub", {
            mode: "test",
            dispatcherMode: "collapsed",
        });
        const rLegacy = await dispatchForgeSubcommand("bogus-sub", {
            mode: "test",
            dispatcherMode: "legacy",
        });
        expect(rCollapsed.code).toBe("E_UNKNOWN_SUB");
        expect(rLegacy.code).toBe("E_UNKNOWN_SUB");
    });
});
//# sourceMappingURL=dispatcher-mode-flag.test.js.map