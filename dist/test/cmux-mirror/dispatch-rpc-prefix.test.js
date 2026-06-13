import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// availability must report "available" so syncOnce reaches dispatch
vi.mock("../../scripts/cmux-mirror/lib/availability.mjs", () => ({
    cmuxAvailable: vi.fn(() => true),
    markUnavailable: vi.fn(),
    isStickyUnavailable: vi.fn(() => false),
}));
// Keep the REAL buildRpcArgs; only stub runCli so we can inspect the args it receives.
vi.mock("../../scripts/cmux-mirror/lib/cli.mjs", async (importOriginal) => {
    const actual = (await importOriginal());
    return {
        ...actual,
        runCli: vi.fn(() => Promise.resolve({ exitCode: 0, stdout: "", stderr: "" })),
    };
});
import { buildRpcArgs, runCli } from "../../scripts/cmux-mirror/lib/cli.mjs";
import { syncOnce } from "../../scripts/cmux-mirror/sync-once.mjs";
const mockedRunCli = vi.mocked(runCli);
describe("buildRpcArgs: cmux 0.64.x rpc envelope", () => {
    it("wraps method + params in `rpc <method> <json>`", () => {
        const args = buildRpcArgs({ method: "set_status", params: { text: "Forge: build" } });
        expect(args[0]).toBe("rpc");
        expect(args[1]).toBe("set_status");
        expect(args[2]).toBe(JSON.stringify({ text: "Forge: build" }));
    });
    it("omits the params slot when params are absent", () => {
        const args = buildRpcArgs({ method: "set_progress" });
        expect(args).toEqual(["rpc", "set_progress"]);
    });
    it("accepts dotted method names (notification.create / browser.open)", () => {
        expect(buildRpcArgs({ method: "notification.create" })).toEqual(["rpc", "notification.create"]);
        expect(buildRpcArgs({ method: "browser.open" })[1]).toBe("browser.open");
    });
    it("rejects a method containing shell-meta / whitespace / path chars (Q3)", () => {
        expect(() => buildRpcArgs({ method: "set_status; rm -rf /" })).toThrow();
        expect(() => buildRpcArgs({ method: "set status" })).toThrow();
        expect(() => buildRpcArgs({ method: "../rpc/leak" })).toThrow();
        expect(() => buildRpcArgs({ method: "" })).toThrow();
    });
});
describe("sync-once dispatch: every command is routed through `cmux rpc`", () => {
    let dir;
    let forgeDir;
    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), "cmux-rpc-test-"));
        forgeDir = join(dir, ".forge");
        mkdirSync(forgeDir, { recursive: true });
        vi.clearAllMocks();
    });
    afterEach(() => {
        try {
            rmSync(dir, { recursive: true, force: true });
        }
        catch {
            /* ignore */
        }
    });
    function writeStatus(phase) {
        writeFileSync(join(forgeDir, "status.md"), `---\ncurrent_task: "t1"\ntier: "standard"\nproject_phase: "${phase}"\nphase: "approved"\n---\n\n# Status`);
    }
    it("passes `rpc` + `set_status` as the first args to runCli on a phase change", async () => {
        // Prior snapshot with a different phase forces a set_status diff.
        writeFileSync(join(forgeDir, ".cmux-snapshot.json"), JSON.stringify({
            phase: "idle",
            tier: null,
            task: null,
            progress: { total: 0, done: 0, in_progress: 0, pending: 0 },
            review: null,
        }));
        writeStatus("build");
        await syncOnce({ forgeDir, snapshotDir: forgeDir });
        const calls = mockedRunCli.mock.calls;
        const rpcCall = calls.find((c) => c[0]?.[0] === "rpc");
        expect(rpcCall).toBeDefined();
        expect(rpcCall?.[0]?.[1]).toBe("set_status");
        // No call should ever pass a bare method name as argv[0] (the old broken form).
        const bareMethodCall = calls.find((c) => c[0]?.[0] === "set_status" || c[0]?.[0] === "set_progress");
        expect(bareMethodCall).toBeUndefined();
    });
});
//# sourceMappingURL=dispatch-rpc-prefix.test.js.map