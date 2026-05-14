/**
 * Bug Condition Exploration Test: resumeRun ignores branchName parameter
 *
 * This test demonstrates that `resumeRun(branchName, cwd)` ignores the
 * `branchName` parameter when multiple run directories exist. Instead of
 * matching by branch, it returns the first run directory found with a
 * notes.md file — regardless of which branch it belongs to.
 *
 * **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms
 * the bug exists. DO NOT fix the code or the test when it fails.
 *
 * **Validates: Requirements 1.1, 1.2, 2.1, 2.2**
 */
import * as fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Mock node:child_process before importing the module under test
vi.mock("node:child_process", () => ({
    execFileSync: vi.fn(),
}));
// Mock node:crypto before importing the module under test
vi.mock("node:crypto", () => ({
    randomUUID: vi.fn(),
}));
// Mock node:fs before importing the module under test
vi.mock("node:fs", () => ({
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
}));
// Import after mocking
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { RunManager } from "../src/run-manager.js";
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const FAKE_SHA = "abc123def456789012345678901234567890abcd";
const FAKE_NEW_UUID = "new-uuid-0000-0000-0000-000000000000";
const CWD = "/test/repo";
// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------
beforeEach(() => {
    vi.clearAllMocks();
    randomUUID.mockReturnValue(FAKE_NEW_UUID);
    execFileSync.mockReturnValue(Buffer.from(`${FAKE_SHA}\n`));
});
afterEach(() => {
    vi.restoreAllMocks();
});
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * Build a notes.md content string for a given runId and optional branchName.
 * This matches the format produced by formatNotesDocument.
 */
function buildNotesContent(runId, branchName) {
    const branchLine = branchName !== undefined ? `\nBranch: ${branchName}` : "";
    return `# Run: ${runId}${branchLine}\n\n## Iteration Log\n\n`;
}
/**
 * Set up mocks for two run directories with different branch names in
 * their notes.md metadata. The first directory appears first in the
 * directory scan order.
 */
function setupTwoRunDirectories(firstRunId, secondRunId) {
    // existsSync: runs dir exists, both notes.md files exist
    existsSync.mockImplementation((p) => {
        if (p === `${CWD}/.forge/runs/`)
            return true;
        if (p === `${CWD}/.forge/runs/${firstRunId}/notes.md`)
            return true;
        if (p === `${CWD}/.forge/runs/${secondRunId}/notes.md`)
            return true;
        return false;
    });
    // readdirSync: return both directories in order (first appears first)
    readdirSync.mockReturnValue([
        { name: firstRunId, isDirectory: () => true },
        { name: secondRunId, isDirectory: () => true },
    ]);
    // readFileSync: return notes content for each run with branch metadata
    readFileSync.mockImplementation((p) => {
        if (p === `${CWD}/.forge/runs/${firstRunId}/notes.md`) {
            return buildNotesContent(firstRunId, "forge/first-branch");
        }
        if (p === `${CWD}/.forge/runs/${secondRunId}/notes.md`) {
            return buildNotesContent(secondRunId, "forge/second-branch");
        }
        return "";
    });
}
// ---------------------------------------------------------------------------
// Bug Condition Exploration: resumeRun ignores branchName (Property 1)
// ---------------------------------------------------------------------------
describe("Bug Condition: resumeRun ignores branchName parameter", () => {
    /**
     * Scoped PBT: When two run directories exist and we request the second
     * branch, resumeRun should return the second run's ID — not the first.
     *
     * On UNFIXED code, this FAILS because resumeRun returns the first run
     * directory found with a notes.md, ignoring the branchName parameter.
     *
     * **Validates: Requirements 1.1, 1.2, 2.1**
     */
    it("returns the run matching the requested branchName when multiple runs exist", () => {
        fc.assert(fc.property(
        // Generate two distinct run IDs
        fc.uuid(), fc.uuid(), (firstRunId, secondRunId) => {
            // Ensure the two run IDs are distinct
            fc.pre(firstRunId !== secondRunId);
            vi.clearAllMocks();
            execFileSync.mockReturnValue(Buffer.from(`${FAKE_SHA}\n`));
            randomUUID.mockReturnValue(FAKE_NEW_UUID);
            setupTwoRunDirectories(firstRunId, secondRunId);
            // Request the second branch — the system should find the second run
            const requestedBranch = "forge/second-branch";
            const result = RunManager.resumeRun(requestedBranch, CWD);
            // The returned runId should match the second run directory,
            // NOT the first one. On unfixed code, this will fail because
            // resumeRun returns the first run found (firstRunId).
            expect(result.runId).toBe(secondRunId);
            expect(result.runDir).toBe(`${CWD}/.forge/runs/${secondRunId}`);
            expect(result.notesPath).toBe(`${CWD}/.forge/runs/${secondRunId}/notes.md`);
            expect(result.branchName).toBe(requestedBranch);
        }), { numRuns: 20 });
    });
    /**
     * Concrete case: Two run directories exist. We request the second branch.
     * The system should return the second run, not the first.
     *
     * On UNFIXED code, this FAILS — resumeRun returns "run-aaa" (first found)
     * instead of "run-bbb" (the one matching the requested branch).
     *
     * **Validates: Requirements 1.1, 1.2, 2.1**
     */
    it("concrete: requesting second branch returns second run, not first", () => {
        const firstRunId = "run-aaa";
        const secondRunId = "run-bbb";
        setupTwoRunDirectories(firstRunId, secondRunId);
        const result = RunManager.resumeRun("forge/second-branch", CWD);
        // Bug: resumeRun returns firstRunId ("run-aaa") because it takes the
        // first directory with a notes.md, ignoring the branchName parameter.
        // Expected: should return secondRunId ("run-bbb") matching the branch.
        expect(result.runId).toBe(secondRunId);
        expect(result.runDir).toBe(`${CWD}/.forge/runs/${secondRunId}`);
        expect(result.notesPath).toBe(`${CWD}/.forge/runs/${secondRunId}/notes.md`);
    });
    /**
     * When no run directory matches the given branchName, the system should
     * create a new run directory (Expected Behavior 2.2).
     *
     * On UNFIXED code, this FAILS because resumeRun returns the first run
     * directory found (regardless of branch) instead of creating a new one.
     *
     * **Validates: Requirements 2.2**
     */
    it("creates a new run when no existing run matches the requested branchName", () => {
        const existingRunId = "run-existing";
        // Set up one run directory that belongs to a different branch
        existsSync.mockImplementation((p) => {
            if (p === `${CWD}/.forge/runs/`)
                return true;
            if (p === `${CWD}/.forge/runs/${existingRunId}/notes.md`)
                return true;
            return false;
        });
        readdirSync.mockReturnValue([{ name: existingRunId, isDirectory: () => true }]);
        readFileSync.mockReturnValue(buildNotesContent(existingRunId, "forge/other-branch"));
        // Request a completely different branch
        const result = RunManager.resumeRun("forge/unrelated-branch", CWD);
        // Expected: since no run matches "forge/unrelated-branch", a new run
        // should be created with a fresh UUID.
        // Bug: resumeRun returns the existing run (run-existing) because it
        // ignores the branchName and returns the first run with notes.md.
        expect(result.runId).toBe(FAKE_NEW_UUID);
        expect(result.runDir).toBe(`${CWD}/.forge/runs/${FAKE_NEW_UUID}`);
        expect(mkdirSync).toHaveBeenCalled();
        expect(writeFileSync).toHaveBeenCalled();
    });
});
//# sourceMappingURL=resume-branch-mismatch.property.test.js.map