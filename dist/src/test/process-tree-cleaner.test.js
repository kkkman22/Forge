import * as fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
const { mockExecFileSync } = vi.hoisted(() => ({
    mockExecFileSync: vi.fn(),
}));
vi.mock("node:child_process", () => ({
    execFileSync: mockExecFileSync,
}));
import { getDescendants, killProcessGroup, killProcessTree } from "../src/process-tree-cleaner.js";
beforeEach(() => {
    mockExecFileSync.mockReset();
});
describe("ProcessTreeCleaner", () => {
    describe("getDescendants", () => {
        it("returns empty for process with no children", async () => {
            mockExecFileSync.mockImplementation((cmd, _args) => {
                if (cmd === "pgrep")
                    throw new Error("no children");
                return "";
            });
            const result = await getDescendants(9999);
            expect(result).toEqual([]);
        });
        it("finds direct children via pgrep", async () => {
            mockExecFileSync.mockImplementation((cmd, args) => {
                if (cmd === "pgrep" && args[1] === "100")
                    return "101\n102\n";
                if (cmd === "pgrep" && args[1] === "101")
                    throw new Error("no children");
                if (cmd === "pgrep" && args[1] === "102")
                    throw new Error("no children");
                if (cmd === "ps" && args[1] === "101")
                    return "node";
                if (cmd === "ps" && args[1] === "102")
                    return "vitest";
                return "";
            });
            const result = await getDescendants(100);
            expect(result).toHaveLength(2);
            expect(result[0].pid).toBe(101);
            expect(result[0].command).toBe("node");
            expect(result[1].pid).toBe(102);
            expect(result[1].command).toBe("vitest");
        });
    });
    describe("killProcessGroup", () => {
        it("returns true when kill(-pgid) succeeds", () => {
            const killSpy = vi.spyOn(process, "kill").mockReturnValue(true);
            expect(killProcessGroup(1234)).toBe(true);
            expect(killSpy).toHaveBeenCalledWith(-1234, "SIGTERM");
            killSpy.mockRestore();
        });
        it("returns false when kill(-pgid) fails", () => {
            const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {
                throw new Error("ESRCH");
            });
            expect(killProcessGroup(1234)).toBe(false);
            killSpy.mockRestore();
        });
    });
    describe("Property 9: leaf-to-root kill order", () => {
        it("children receive signal before their parents", async () => {
            fc.assert(fc.property(fc.record({
                rootPid: fc.integer({ min: 100, max: 199 }),
                childPids: fc.array(fc.integer({ min: 200, max: 299 }), {
                    maxLength: 5,
                }),
            }), ({ rootPid, childPids }) => {
                const uniqueChildPids = [...new Set(childPids)];
                const killOrder = [];
                vi.spyOn(process, "kill").mockImplementation((pid) => {
                    killOrder.push(pid);
                    return true;
                });
                mockExecFileSync.mockImplementation((cmd, args) => {
                    if (cmd === "pgrep" && args[1] === String(rootPid)) {
                        return `${uniqueChildPids.join("\n")}\n`;
                    }
                    if (cmd === "pgrep")
                        throw new Error("no children");
                    if (cmd === "ps")
                        return "proc";
                    return "";
                });
                const _tree = killProcessTree(rootPid, "SIGTERM", 0);
                if (uniqueChildPids.length > 0) {
                    const rootIdx = killOrder.indexOf(rootPid);
                    for (const childPid of uniqueChildPids) {
                        const childIdx = killOrder.indexOf(childPid);
                        if (rootIdx >= 0 && childIdx >= 0) {
                            expect(childIdx).toBeLessThan(rootIdx);
                        }
                    }
                }
                vi.restoreAllMocks();
            }), { numRuns: 50 });
        });
    });
});
//# sourceMappingURL=process-tree-cleaner.test.js.map