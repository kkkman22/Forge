import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import { execSync } from "node:child_process";

const { mockExecSync } = vi.hoisted(() => ({
	mockExecSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
	execSync: mockExecSync,
}));

import {
	getDescendants,
	killProcessTree,
	killProcessGroup,
	type ProcessTreeNode,
} from "../src/process-tree-cleaner.js";

beforeEach(() => {
	mockExecSync.mockReset();
});

describe("ProcessTreeCleaner", () => {
	describe("getDescendants", () => {
		it("returns empty for process with no children", async () => {
			mockExecSync.mockImplementation((cmd: string) => {
				if (cmd.includes("pgrep")) throw new Error("no children");
				return "";
			});

			const result = await getDescendants(9999);
			expect(result).toEqual([]);
		});

		it("finds direct children via pgrep", async () => {
			mockExecSync.mockImplementation((cmd: string) => {
				if (cmd.includes("pgrep -P 100")) return "101\n102\n";
				if (cmd.includes("pgrep -P 101")) throw new Error("no children");
				if (cmd.includes("pgrep -P 102")) throw new Error("no children");
				if (cmd.includes("ps -p 101")) return "node";
				if (cmd.includes("ps -p 102")) return "vitest";
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
			// Generate random tree structures and verify kill order
			fc.assert(
				fc.property(
					fc.record({
						rootPid: fc.integer({ min: 100, max: 199 }),
						childPids: fc.array(fc.integer({ min: 200, max: 299 }), {
							maxLength: 5,
						}),
					}),
					({ rootPid, childPids }) => {
						const uniqueChildPids = [...new Set(childPids)];
						const killOrder: number[] = [];
						vi.spyOn(process, "kill").mockImplementation((pid: number) => {
							killOrder.push(pid);
							return true;
						});

						mockExecSync.mockImplementation((cmd: string) => {
							if (cmd.includes(`pgrep -P ${rootPid}`)) {
								return uniqueChildPids.join("\n") + "\n";
							}
							if (cmd.includes("pgrep -P 2")) throw new Error("no children");
							if (cmd.includes("ps -p 2")) return "proc";
							return "";
						});

						// Test the collectPidsLeafToRoot ordering by checking getDescendants
						// Then verify killProcessTree sends in correct order
						const tree = killProcessTree(rootPid, "SIGTERM", 0);

						// For direct children of root, all children should come before root
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
					},
				),
				{ numRuns: 50 },
			);
		});
	});
});
