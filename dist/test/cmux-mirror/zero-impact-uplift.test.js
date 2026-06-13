import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("node:child_process", () => ({
    execFile: vi.fn(),
}));
vi.mock("../../scripts/cmux-mirror/lib/availability.mjs", () => ({
    markUnavailable: vi.fn(),
}));
import { execFile } from "node:child_process";
import { runCli } from "../../scripts/cmux-mirror/lib/cli.mjs";
const mockExecFile = vi.mocked(execFile);
function captureArgs() {
    let captured = [];
    return {
        impl: (...a) => {
            captured = a[1] ?? [];
            a[a.length - 1]();
        },
        get: () => captured,
    };
}
describe("Zero-Impact regression (R6)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.CMUX_WINDOW_ID;
    });
    it("R6.4a: runCli with ENOENT returns null without throwing", async () => {
        const enoentErr = new Error("ENOENT");
        enoentErr.code = "ENOENT";
        mockExecFile.mockImplementation((() => {
            const err = enoentErr;
            return (...a) => {
                a[a.length - 1](err);
            };
        })());
        const result = await runCli(["status"]);
        expect(result).toBeNull();
    });
    it("R6.4b: templates/cmux.json command structure preserved (real cmux schema)", () => {
        const cmuxJsonPath = resolve(__dirname, "../../templates/cmux.json");
        const content = readFileSync(cmuxJsonPath, "utf-8");
        const parsed = JSON.parse(content);
        // Real cmux schema: commands[].workspace.layout, not a top-level `layouts` map.
        expect(parsed).not.toHaveProperty("layouts");
        const commands = (parsed.commands ?? []);
        const byName = new Map(commands.map((c) => [c.name, c]));
        for (const name of ["Forge Workflow", "Forge Loop Monitor", "Forge Dev"]) {
            const cmd = byName.get(name);
            expect(cmd, `missing command ${name}`).toBeDefined();
            expect(typeof cmd?.workspace).toBe("object");
            expect(cmd?.workspace).toHaveProperty("layout");
        }
    });
    it("R6.2: runCli args are byte-identical when CMUX_WINDOW_ID absent", async () => {
        delete process.env.CMUX_WINDOW_ID;
        const cap = captureArgs();
        mockExecFile.mockImplementation(cap.impl);
        await runCli(["status"]);
        expect(cap.get()).toEqual(["status"]);
    });
    it("R6.2: runCli args are byte-identical when CMUX_WINDOW_ID is empty string", async () => {
        process.env.CMUX_WINDOW_ID = "";
        const cap = captureArgs();
        mockExecFile.mockImplementation(cap.impl);
        await runCli(["status"]);
        expect(cap.get()).toEqual(["status"]);
    });
});
//# sourceMappingURL=zero-impact-uplift.test.js.map