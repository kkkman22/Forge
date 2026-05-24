import { describe, expect, it, vi } from "vitest";
import { dispatchForgeSubcommand } from "../../src/forge-dispatcher.js";
describe("R3.2: inline mode reads instructions.md in main context", () => {
    it("inline sub does NOT call Agent tool", async () => {
        const agentSpy = vi.fn().mockResolvedValue({ output: "done" });
        const readSpy = vi.fn();
        await dispatchForgeSubcommand("status", {
            mode: "test",
            _mocks: { agent: agentSpy, read: readSpy },
        });
        expect(agentSpy).not.toHaveBeenCalled();
    });
    it("inline sub calls Read for instructions.md", async () => {
        const agentSpy = vi.fn();
        const readSpy = vi.fn();
        await dispatchForgeSubcommand("status", {
            mode: "test",
            _mocks: { agent: agentSpy, read: readSpy },
        });
        expect(readSpy).toHaveBeenCalled();
        const readArg = readSpy.mock.calls[0]?.[0] ?? "";
        expect(readArg).toContain("instructions.md");
    });
    it("missing dispatch_mode defaults to inline", async () => {
        const agentSpy = vi.fn().mockResolvedValue({ output: "done" });
        await dispatchForgeSubcommand("status", {
            mode: "test",
            _mocks: { agent: agentSpy, read: vi.fn() },
            _overrideFrontmatter: { dispatch_mode: undefined },
        });
        expect(agentSpy).not.toHaveBeenCalled();
    });
});
//# sourceMappingURL=dispatch-inline.test.js.map