/**
 * Unit tests for StatusFile interaction helpers.
 *
 * Verifies that the extracted helper functions in `sdk-status-helpers.ts`
 * correctly handle StatusFile read/write operations, field extraction,
 * and compound operations (iteration status, loop field initialization,
 * and shutdown cleanup).
 *
 * **Validates: Requirements 6.1, 6.2, 6.5**
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearLoopFieldsOnShutdown, getPhaseFromStatus, getTierFromStatus, getWorkNatureFromStatus, initializeLoopFields, safeReadStatusFile, safeUpdateIterationStatus, safeWriteStatusFile, } from "../src/sdk-status-helpers.js";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Create a simple StatusFileIO stub with configurable read/write. */
function createIO(overrides) {
    return {
        read: vi.fn(() => ""),
        write: vi.fn(),
        ...overrides,
    };
}
/** Build minimal YAML frontmatter content with given fields. */
function buildStatus(fields) {
    const lines = Object.entries(fields)
        .map(([k, v]) => (typeof v === "number" ? `${k}: ${v}` : `${k}: "${v}"`))
        .join("\n");
    return `---\n${lines}\n---\n`;
}
// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
});
// ---------------------------------------------------------------------------
// 1. safeReadStatusFile
// ---------------------------------------------------------------------------
describe("safeReadStatusFile", () => {
    it("returns empty string when IO is undefined", () => {
        expect(safeReadStatusFile(undefined)).toBe("");
    });
    it("returns empty string when IO.read throws", () => {
        const io = createIO({
            read: vi.fn(() => {
                throw new Error("disk failure");
            }),
        });
        // Should not throw, should return ""
        expect(safeReadStatusFile(io)).toBe("");
    });
    it("returns the content when IO.read succeeds", () => {
        const content = buildStatus({ phase: "build", loop_iteration: 3 });
        const io = createIO({ read: vi.fn(() => content) });
        expect(safeReadStatusFile(io)).toBe(content);
    });
    it("logs a debug warning when IO.read throws", () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => { });
        const io = createIO({
            read: vi.fn(() => {
                throw new Error("read error");
            }),
        });
        safeReadStatusFile(io);
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("[debug] safeReadStatusFile failed"));
    });
});
// ---------------------------------------------------------------------------
// 2. safeWriteStatusFile
// ---------------------------------------------------------------------------
describe("safeWriteStatusFile", () => {
    it("does nothing when IO is undefined", () => {
        // Should not throw
        expect(() => safeWriteStatusFile(undefined, "content")).not.toThrow();
    });
    it("calls IO.write with the content", () => {
        const io = createIO();
        const content = "---\nphase: build\n---\n";
        safeWriteStatusFile(io, content);
        expect(io.write).toHaveBeenCalledTimes(1);
        expect(io.write).toHaveBeenCalledWith(content);
    });
});
// ---------------------------------------------------------------------------
// 3. getPhaseFromStatus
// ---------------------------------------------------------------------------
describe("getPhaseFromStatus", () => {
    it("extracts phase from valid YAML frontmatter (quoted)", () => {
        const content = buildStatus({ phase: "review", loop_iteration: 2 });
        expect(getPhaseFromStatus(content)).toBe("review");
    });
    it("extracts phase from unquoted value", () => {
        const content = "---\nphase: build\nloop_iteration: 1\n---\n";
        expect(getPhaseFromStatus(content)).toBe("build");
    });
    it("returns null when phase is not found", () => {
        const content = "---\nloop_iteration: 1\n---\n";
        expect(getPhaseFromStatus(content)).toBeNull();
    });
    it("returns null for empty string", () => {
        expect(getPhaseFromStatus("")).toBeNull();
    });
    it("handles phase with extra whitespace", () => {
        const content = "---\nphase:   test  \n---\n";
        expect(getPhaseFromStatus(content)).toBe("test");
    });
    it("handles various phase values", () => {
        for (const phase of ["plan", "build", "review", "test", "ship", "learn"]) {
            const content = buildStatus({ phase });
            expect(getPhaseFromStatus(content)).toBe(phase);
        }
    });
});
// ---------------------------------------------------------------------------
// 4. getTierFromStatus
// ---------------------------------------------------------------------------
describe("getTierFromStatus", () => {
    it("extracts tier from valid content (quoted)", () => {
        const content = buildStatus({ tier: "standard", phase: "build" });
        expect(getTierFromStatus(content)).toBe("standard");
    });
    it("extracts tier from unquoted value", () => {
        const content = "---\ntier: full\nphase: build\n---\n";
        expect(getTierFromStatus(content)).toBe("full");
    });
    it("returns undefined when tier is not found", () => {
        const content = buildStatus({ phase: "build" });
        expect(getTierFromStatus(content)).toBeUndefined();
    });
    it("returns undefined for empty string", () => {
        expect(getTierFromStatus("")).toBeUndefined();
    });
    it("handles various tier values", () => {
        for (const tier of ["light", "standard", "full"]) {
            const content = buildStatus({ tier });
            expect(getTierFromStatus(content)).toBe(tier);
        }
    });
});
// ---------------------------------------------------------------------------
// 5. safeUpdateIterationStatus
// ---------------------------------------------------------------------------
describe("safeUpdateIterationStatus", () => {
    it("updates iteration status in StatusFile", () => {
        const existingContent = buildStatus({ phase: "plan", loop_iteration: 0 });
        const io = createIO({ read: vi.fn(() => existingContent) });
        safeUpdateIterationStatus(io, "build", 3);
        expect(io.write).toHaveBeenCalledTimes(1);
        const written = io.write.mock.calls[0][0];
        expect(written).toContain('phase: "build"');
        expect(written).toContain("loop_iteration: 3");
    });
    it("handles undefined IO gracefully", () => {
        // Should not throw
        expect(() => safeUpdateIterationStatus(undefined, "build", 1)).not.toThrow();
    });
    it("handles IO.read failure gracefully", () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => { });
        const io = createIO({
            read: vi.fn(() => {
                throw new Error("read fail");
            }),
        });
        // Should not throw — the outer try/catch in safeUpdateIterationStatus handles it
        expect(() => safeUpdateIterationStatus(io, "build", 1)).not.toThrow();
        // The inner safeReadStatusFile logs a warning, and write is still called
        // with the result of updateIterationStatus on empty string
        expect(warnSpy).toHaveBeenCalled();
    });
});
// ---------------------------------------------------------------------------
// 6. initializeLoopFields
// ---------------------------------------------------------------------------
describe("initializeLoopFields", () => {
    it("writes mode, loop_run_id, loop_iteration, and skill_sequence", () => {
        const io = createIO();
        initializeLoopFields(io, "run-abc-123", "standard");
        expect(io.write).toHaveBeenCalledTimes(1);
        const written = io.write.mock.calls[0][0];
        expect(written).toContain('mode: "autonomous"');
        expect(written).toContain('loop_run_id: "run-abc-123"');
        expect(written).toContain("loop_iteration: 0");
        expect(written).toContain("skill_sequence:");
        // Standard tier should include plan,build,review,test,ship
        expect(written).toContain("plan");
        expect(written).toContain("build");
        expect(written).toContain("review");
        expect(written).toContain("test");
        expect(written).toContain("ship");
    });
    it("clears residual state before writing new fields", () => {
        // Simulate existing loop state from a previous abnormal exit
        const existingContent = buildStatus({
            phase: "build",
            loop_run_id: "old-run-id",
            loop_iteration: 5,
            mode: "autonomous",
        });
        const io = createIO({ read: vi.fn(() => existingContent) });
        initializeLoopFields(io, "new-run-id", "standard");
        expect(io.write).toHaveBeenCalledTimes(1);
        const written = io.write.mock.calls[0][0];
        // Should contain the new run ID, not the old one
        expect(written).toContain('loop_run_id: "new-run-id"');
        expect(written).not.toContain("old-run-id");
        expect(written).toContain("loop_iteration: 0");
    });
    it("does nothing when IO is undefined", () => {
        // Should not throw
        expect(() => initializeLoopFields(undefined, "run-id", "standard")).not.toThrow();
    });
    it("uses correct skill sequence for light tier", () => {
        const io = createIO();
        initializeLoopFields(io, "run-light", "light");
        const written = io.write.mock.calls[0][0];
        // Light tier: build, review
        expect(written).toContain("build");
        expect(written).toContain("review");
        // Should not contain plan, test, ship for light tier
        expect(written).not.toContain("plan");
    });
    it("uses correct skill sequence for full tier", () => {
        const io = createIO();
        initializeLoopFields(io, "run-full", "full");
        const written = io.write.mock.calls[0][0];
        // Full tier: plan, build, review, test, ship, learn
        expect(written).toContain("learn");
    });
});
// ---------------------------------------------------------------------------
// 7. clearLoopFieldsOnShutdown
// ---------------------------------------------------------------------------
describe("clearLoopFieldsOnShutdown", () => {
    it("clears all loop fields on normal completion", () => {
        const existingContent = buildStatus({
            phase: "ship",
            mode: "autonomous",
            loop_run_id: "run-123",
            loop_iteration: 10,
            skill_sequence: "plan,build,review,test,ship",
        });
        const io = createIO({ read: vi.fn(() => existingContent) });
        clearLoopFieldsOnShutdown(io, true);
        expect(io.write).toHaveBeenCalledTimes(1);
        const written = io.write.mock.calls[0][0];
        // All loop fields should be cleared
        expect(written).not.toContain("mode:");
        expect(written).not.toContain("loop_run_id:");
        expect(written).not.toContain("loop_iteration:");
        expect(written).not.toContain("skill_sequence:");
        // Phase should be preserved (it's not a loop field)
        expect(written).toContain("phase:");
    });
    it("preserves skill_sequence on abnormal exit", () => {
        const existingContent = buildStatus({
            phase: "build",
            mode: "autonomous",
            loop_run_id: "run-456",
            loop_iteration: 3,
            skill_sequence: "plan,build,review,test,ship",
        });
        const io = createIO({ read: vi.fn(() => existingContent) });
        clearLoopFieldsOnShutdown(io, false);
        // On abnormal exit, write is called — possibly twice (clear + restore)
        expect(io.write).toHaveBeenCalled();
        const lastWriteCall = io.write.mock.calls;
        const written = lastWriteCall[lastWriteCall.length - 1][0];
        // skill_sequence should be preserved
        expect(written).toContain("skill_sequence:");
        // Other loop fields should be cleared
        expect(written).not.toContain("loop_run_id:");
        expect(written).not.toContain("loop_iteration:");
        expect(written).not.toContain("mode:");
    });
    it("handles undefined IO gracefully", () => {
        expect(() => clearLoopFieldsOnShutdown(undefined, true)).not.toThrow();
        expect(() => clearLoopFieldsOnShutdown(undefined, false)).not.toThrow();
    });
    it("handles empty status file on normal completion", () => {
        const io = createIO({ read: vi.fn(() => "") });
        // Should not throw even with empty content
        expect(() => clearLoopFieldsOnShutdown(io, true)).not.toThrow();
    });
});
// ---------------------------------------------------------------------------
// 8. getWorkNatureFromStatus
// ---------------------------------------------------------------------------
describe("getWorkNatureFromStatus", () => {
    it("extracts work_nature from quoted value", () => {
        const content = buildStatus({ work_nature: "refactor", tier: "standard" });
        expect(getWorkNatureFromStatus(content)).toBe("refactor");
    });
    it("extracts work_nature from unquoted value", () => {
        const content = "---\nwork_nature: bugfix\ntier: light\n---\n";
        expect(getWorkNatureFromStatus(content)).toBe("bugfix");
    });
    it("returns undefined when work_nature is absent", () => {
        const content = buildStatus({ tier: "standard" });
        expect(getWorkNatureFromStatus(content)).toBeUndefined();
    });
    it("returns undefined for empty string", () => {
        expect(getWorkNatureFromStatus("")).toBeUndefined();
    });
    it("handles all valid values", () => {
        for (const wn of ["feature", "refactor", "bugfix"]) {
            const content = buildStatus({ work_nature: wn });
            expect(getWorkNatureFromStatus(content)).toBe(wn);
        }
    });
});
// ---------------------------------------------------------------------------
// 9. initializeLoopFields with workNature
// ---------------------------------------------------------------------------
describe("initializeLoopFields with workNature", () => {
    it("uses standard sequence when no workNature provided (backward compat)", () => {
        const io = createIO();
        initializeLoopFields(io, "run-1", "standard");
        const written = io.write.mock.calls[0][0];
        expect(written).toContain("plan,build,review,test,ship");
        expect(written).not.toContain("work_nature");
    });
    it("uses refactor_standard sequence for refactor + standard", () => {
        const io = createIO();
        initializeLoopFields(io, "run-2", "standard", "refactor");
        const written = io.write.mock.calls[0][0];
        expect(written).toContain("refactor-scan");
        expect(written).toContain("refactor-apply");
        expect(written).toContain('work_nature: "refactor"');
    });
    it("uses fix_light sequence for bugfix + light", () => {
        const io = createIO();
        initializeLoopFields(io, "run-3", "light", "bugfix");
        const written = io.write.mock.calls[0][0];
        expect(written).toContain("fix-apply");
        expect(written).toContain("review");
        expect(written).toContain('work_nature: "bugfix"');
    });
    it("uses fix_standard sequence for bugfix + standard", () => {
        const io = createIO();
        initializeLoopFields(io, "run-4", "standard", "bugfix");
        const written = io.write.mock.calls[0][0];
        expect(written).toContain("fix-analyze");
        expect(written).toContain("fix-apply");
        expect(written).toContain('work_nature: "bugfix"');
    });
    it("uses standard sequence for feature + standard (identity mapping)", () => {
        const io = createIO();
        initializeLoopFields(io, "run-5", "standard", "feature");
        const written = io.write.mock.calls[0][0];
        expect(written).toContain("plan,build,review,test,ship");
        expect(written).toContain('work_nature: "feature"');
    });
    it("uses refactor_light sequence for refactor + light", () => {
        const io = createIO();
        initializeLoopFields(io, "run-6", "light", "refactor");
        const written = io.write.mock.calls[0][0];
        expect(written).toContain("refactor-apply");
        expect(written).toContain("review");
        expect(written).not.toContain("refactor-scan");
    });
});
//# sourceMappingURL=sdk-status-helpers.test.js.map