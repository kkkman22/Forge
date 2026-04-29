/**
 * Unit tests for the EffectExecutor class.
 *
 * Verifies that each `OrchestratorEffect` type is executed correctly:
 * commit → git add + git commit, rollback → git reset + git clean,
 * backoff → interruptible sleep, abort/stop → flag setting,
 * schedule_iteration → no-op, and sequential effect processing.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**
 */
import * as fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildAddAllCommand, buildCleanCommand, buildCleanDryRunCommand, buildCommitCommand, buildResetCommand, buildStashCommand, buildStashRefCommand, } from "../src/git-transaction.js";
// Mock node:child_process before importing the module under test
vi.mock("node:child_process", () => ({
    execFileSync: vi.fn(),
}));
// Import after mocking
import { execFileSync } from "node:child_process";
import { EffectExecutor, FrozenZoneViolation, UnexpectedEffectError, } from "../src/effect-executor.js";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createDeps(overrides) {
    return {
        cwd: "/test/repo",
        onNotesUpdate: vi.fn(),
        onLog: vi.fn(),
        ...overrides,
    };
}
function createExecutor(overrides) {
    return new EffectExecutor(createDeps(overrides));
}
// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------
beforeEach(() => {
    vi.clearAllMocks();
});
afterEach(() => {
    vi.useRealTimers();
});
// ---------------------------------------------------------------------------
// Commit effect (Requirement 3.1)
// ---------------------------------------------------------------------------
describe("commit effect", () => {
    it("calls execFileSync with buildAddAllCommand then buildCommitCommand args", async () => {
        const executor = createExecutor();
        const message = "forge(1): Added login form";
        await executor.executeEffect({ type: "commit", message });
        const expectedAdd = buildAddAllCommand();
        const expectedCommit = buildCommitCommand(message);
        const mock = execFileSync;
        // 3 calls: git add -A, git diff --cached --name-only (frozen zone check), git commit
        expect(mock).toHaveBeenCalledTimes(3);
        // First call: git add -A
        expect(mock.mock.calls[0][0]).toBe(expectedAdd.executable);
        expect(mock.mock.calls[0][1]).toEqual(expectedAdd.args);
        // Second call: git diff --cached --name-only (inner-layer frozen zone check)
        expect(mock.mock.calls[1][0]).toBe("git");
        expect(mock.mock.calls[1][1]).toEqual(["diff", "--cached", "--name-only"]);
        // Third call: git commit -m <message>
        expect(mock.mock.calls[2][0]).toBe(expectedCommit.executable);
        expect(mock.mock.calls[2][1]).toEqual(expectedCommit.args);
    });
    it("passes cwd from deps to execFileSync", async () => {
        const cwd = "/my/project";
        const executor = createExecutor({ cwd });
        await executor.executeEffect({ type: "commit", message: "test commit" });
        const mock = execFileSync;
        expect(mock.mock.calls[0][2]).toEqual({ cwd });
        expect(mock.mock.calls[1][2]).toEqual({ cwd });
    });
    it("does not pass shell: true to execFileSync", async () => {
        const executor = createExecutor();
        await executor.executeEffect({ type: "commit", message: "test" });
        const mock = execFileSync;
        for (const call of mock.mock.calls) {
            const options = call[2];
            expect(options).not.toHaveProperty("shell");
        }
    });
});
// ---------------------------------------------------------------------------
// Rollback effect (Requirement 3.2)
// ---------------------------------------------------------------------------
describe("rollback effect", () => {
    it("calls execFileSync with stash, then buildResetCommand, then buildCleanCommand args", async () => {
        const executor = createExecutor();
        await executor.executeEffect({ type: "rollback" });
        const expectedStash = buildStashCommand("forge-rollback-safety-net");
        const expectedStashRef = buildStashRefCommand();
        const expectedReset = buildResetCommand();
        const expectedClean = buildCleanCommand();
        const mock = execFileSync;
        expect(mock).toHaveBeenCalledTimes(4);
        // First call: git stash --include-untracked -m "forge-rollback-safety-net"
        expect(mock.mock.calls[0][0]).toBe(expectedStash.executable);
        expect(mock.mock.calls[0][1]).toEqual(expectedStash.args);
        // Second call: git rev-parse stash@{0}
        expect(mock.mock.calls[1][0]).toBe(expectedStashRef.executable);
        expect(mock.mock.calls[1][1]).toEqual(expectedStashRef.args);
        // Third call: git reset --hard HEAD
        expect(mock.mock.calls[2][0]).toBe(expectedReset.executable);
        expect(mock.mock.calls[2][1]).toEqual(expectedReset.args);
        // Fourth call: git clean -fd
        expect(mock.mock.calls[3][0]).toBe(expectedClean.executable);
        expect(mock.mock.calls[3][1]).toEqual(expectedClean.args);
    });
    it("passes cwd from deps to execFileSync", async () => {
        const cwd = "/another/repo";
        const executor = createExecutor({ cwd });
        await executor.executeEffect({ type: "rollback" });
        const mock = execFileSync;
        // All three calls (stash, reset, clean) should use the same cwd
        expect(mock.mock.calls[0][2]).toEqual({ cwd });
        expect(mock.mock.calls[1][2]).toEqual({ cwd });
        expect(mock.mock.calls[2][2]).toEqual({ cwd });
    });
    it("does not pass shell: true to execFileSync", async () => {
        const executor = createExecutor();
        await executor.executeEffect({ type: "rollback" });
        const mock = execFileSync;
        for (const call of mock.mock.calls) {
            const options = call[2];
            expect(options).not.toHaveProperty("shell");
        }
    });
});
// ---------------------------------------------------------------------------
// Rollback stash safety net (Requirement 2 — REQ-2)
// ---------------------------------------------------------------------------
describe("rollback stash safety net", () => {
    it("executes stash command BEFORE reset command", async () => {
        const executor = createExecutor();
        const callOrder = [];
        const mock = execFileSync;
        mock.mockImplementation((_exec, args) => {
            callOrder.push(args[0]);
        });
        await executor.executeEffect({ type: "rollback" });
        // stash must come before rev-parse, reset and clean
        expect(callOrder).toEqual(["stash", "rev-parse", "reset", "clean"]);
    });
    it("still executes reset and clean when stash throws", async () => {
        const executor = createExecutor();
        const mock = execFileSync;
        // First call (stash) throws, subsequent calls succeed
        mock.mockImplementationOnce(() => {
            throw new Error("nothing to stash");
        });
        await executor.executeEffect({ type: "rollback" });
        const expectedReset = buildResetCommand();
        const expectedClean = buildCleanCommand();
        // stash failed, so only reset + clean calls remain
        expect(mock).toHaveBeenCalledTimes(3);
        // Second call: git reset --hard HEAD
        expect(mock.mock.calls[1][0]).toBe(expectedReset.executable);
        expect(mock.mock.calls[1][1]).toEqual(expectedReset.args);
        // Third call: git clean -fd
        expect(mock.mock.calls[2][0]).toBe(expectedClean.executable);
        expect(mock.mock.calls[2][1]).toEqual(expectedClean.args);
    });
    it("logs success message when stash succeeds", async () => {
        const onLog = vi.fn();
        const executor = createExecutor({ onLog });
        const mock = execFileSync;
        // Make rev-parse return a fake SHA
        mock.mockImplementation((_exec, args) => {
            if (args[0] === "rev-parse") {
                return Buffer.from("abc123def456\n");
            }
            return Buffer.from("");
        });
        await executor.executeEffect({ type: "rollback" });
        expect(onLog).toHaveBeenCalledWith("Safety stash created before rollback (stash ref: abc123def456)");
    });
    it("logs failure message when stash fails", async () => {
        const onLog = vi.fn();
        const executor = createExecutor({ onLog });
        const mock = execFileSync;
        mock.mockImplementationOnce(() => {
            throw new Error("nothing to stash");
        });
        await executor.executeEffect({ type: "rollback" });
        expect(onLog).toHaveBeenCalledWith("No changes to stash before rollback (clean working tree)");
    });
});
// ---------------------------------------------------------------------------
// Stash ref capture (Requirements 3.1, 3.2, 3.3, 3.4)
// ---------------------------------------------------------------------------
describe("stash ref capture", () => {
    it("calls git rev-parse stash@{0} after successful stash", async () => {
        const executor = createExecutor();
        const mock = execFileSync;
        // Stash succeeds, rev-parse returns a SHA
        mock.mockImplementation((_exec, args) => {
            if (args[0] === "rev-parse") {
                return Buffer.from("a1b2c3d4e5f6\n");
            }
            return Buffer.from("");
        });
        await executor.executeEffect({ type: "rollback" });
        const expectedStashRef = buildStashRefCommand();
        // Second call should be rev-parse stash@{0}
        expect(mock.mock.calls[1][0]).toBe(expectedStashRef.executable);
        expect(mock.mock.calls[1][1]).toEqual(expectedStashRef.args);
    });
    it("logs the stash ref SHA via onLog", async () => {
        const onLog = vi.fn();
        const executor = createExecutor({ onLog });
        const mock = execFileSync;
        mock.mockImplementation((_exec, args) => {
            if (args[0] === "rev-parse") {
                return Buffer.from("deadbeef1234\n");
            }
            return Buffer.from("");
        });
        await executor.executeEffect({ type: "rollback" });
        expect(onLog).toHaveBeenCalledWith("Safety stash created before rollback (stash ref: deadbeef1234)");
    });
    it("records the stash ref via onNotesUpdate", async () => {
        const onNotesUpdate = vi.fn();
        const executor = createExecutor({ onNotesUpdate });
        const mock = execFileSync;
        mock.mockImplementation((_exec, args) => {
            if (args[0] === "rev-parse") {
                return Buffer.from("cafe0123abcd\n");
            }
            return Buffer.from("");
        });
        await executor.executeEffect({ type: "rollback" });
        expect(onNotesUpdate).toHaveBeenCalledWith("Rollback stash ref: cafe0123abcd");
    });
    it("logs stash ref as 'unknown' when rev-parse fails", async () => {
        const onLog = vi.fn();
        const onNotesUpdate = vi.fn();
        const executor = createExecutor({ onLog, onNotesUpdate });
        const mock = execFileSync;
        // Stash succeeds, but rev-parse throws
        mock.mockImplementation((_exec, args) => {
            if (args[0] === "rev-parse") {
                throw new Error("fatal: ref stash@{0} is not a valid ref");
            }
            return Buffer.from("");
        });
        await executor.executeEffect({ type: "rollback" });
        expect(onLog).toHaveBeenCalledWith("Safety stash created before rollback (stash ref: unknown)");
        expect(onNotesUpdate).toHaveBeenCalledWith("Rollback stash ref: unknown");
    });
});
// ---------------------------------------------------------------------------
// Dry-run rollback mode (Requirements 3.5, 3.6)
// ---------------------------------------------------------------------------
describe("dry-run rollback mode", () => {
    it("calls git clean -fdn when dryRun is true", async () => {
        const executor = createExecutor({ dryRun: true });
        const mock = execFileSync;
        mock.mockReturnValue(Buffer.from("Would remove untracked.txt\nWould remove temp/\n"));
        await executor.executeEffect({ type: "rollback" });
        const expectedDryRun = buildCleanDryRunCommand();
        expect(mock).toHaveBeenCalledTimes(1);
        expect(mock.mock.calls[0][0]).toBe(expectedDryRun.executable);
        expect(mock.mock.calls[0][1]).toEqual(expectedDryRun.args);
    });
    it("logs each file path from dry-run output", async () => {
        const onLog = vi.fn();
        const executor = createExecutor({ dryRun: true, onLog });
        const mock = execFileSync;
        mock.mockReturnValue(Buffer.from("Would remove untracked.txt\nWould remove temp/\nWould remove build/output.js\n"));
        await executor.executeEffect({ type: "rollback" });
        // First call is the header message
        expect(onLog).toHaveBeenCalledWith("Dry-run rollback — listing files that would be cleaned:");
        // Each file is logged with "would remove:" prefix (with "Would remove " stripped)
        expect(onLog).toHaveBeenCalledWith("  would remove: untracked.txt");
        expect(onLog).toHaveBeenCalledWith("  would remove: temp/");
        expect(onLog).toHaveBeenCalledWith("  would remove: build/output.js");
    });
    it("logs empty message when no untracked files exist", async () => {
        const onLog = vi.fn();
        const executor = createExecutor({ dryRun: true, onLog });
        const mock = execFileSync;
        mock.mockReturnValue(Buffer.from(""));
        await executor.executeEffect({ type: "rollback" });
        expect(onLog).toHaveBeenCalledWith("Dry-run rollback — listing files that would be cleaned:");
        expect(onLog).toHaveBeenCalledWith("  (no untracked files to clean)");
    });
    it("does NOT call git reset --hard HEAD in dry-run mode", async () => {
        const executor = createExecutor({ dryRun: true });
        const mock = execFileSync;
        mock.mockReturnValue(Buffer.from("Would remove foo.txt\n"));
        await executor.executeEffect({ type: "rollback" });
        // Only one call: git clean -fdn
        for (const call of mock.mock.calls) {
            const args = call[1];
            expect(args).not.toContain("reset");
        }
    });
    it("does NOT call git clean -fd in dry-run mode", async () => {
        const executor = createExecutor({ dryRun: true });
        const mock = execFileSync;
        mock.mockReturnValue(Buffer.from("Would remove foo.txt\n"));
        await executor.executeEffect({ type: "rollback" });
        // The only clean call should be the dry-run variant (-fdn), not the destructive one (-fd)
        for (const call of mock.mock.calls) {
            const args = call[1];
            if (args[0] === "clean") {
                expect(args).toContain("-fdn");
                expect(args).not.toEqual(["clean", "-fd"]);
            }
        }
    });
    it("does NOT call git stash in dry-run mode", async () => {
        const executor = createExecutor({ dryRun: true });
        const mock = execFileSync;
        mock.mockReturnValue(Buffer.from(""));
        await executor.executeEffect({ type: "rollback" });
        for (const call of mock.mock.calls) {
            const args = call[1];
            expect(args[0]).not.toBe("stash");
        }
    });
});
// ---------------------------------------------------------------------------
// Backoff effect (Requirement 3.3)
// ---------------------------------------------------------------------------
describe("backoff effect", () => {
    it("resolves after specified duration", async () => {
        vi.useFakeTimers();
        const executor = createExecutor();
        const durationMs = 5000;
        let resolved = false;
        const promise = executor.executeEffect({ type: "start_backoff", durationMs }).then(() => {
            resolved = true;
        });
        // Not resolved yet
        expect(resolved).toBe(false);
        // Advance time by the duration
        await vi.advanceTimersByTimeAsync(durationMs);
        await promise;
        expect(resolved).toBe(true);
    });
    it("is interruptible via AbortSignal", async () => {
        vi.useFakeTimers();
        const executor = createExecutor();
        const controller = new AbortController();
        const durationMs = 60_000;
        let resolved = false;
        const promise = executor
            .executeEffect({ type: "start_backoff", durationMs }, controller.signal)
            .then(() => {
            resolved = true;
        });
        // Not resolved yet
        expect(resolved).toBe(false);
        // Abort early (before the full duration)
        controller.abort();
        await vi.advanceTimersByTimeAsync(0);
        await promise;
        expect(resolved).toBe(true);
    });
    it("resolves immediately if signal is already aborted", async () => {
        const executor = createExecutor();
        const controller = new AbortController();
        controller.abort();
        // Should resolve immediately without needing fake timers
        await executor.executeEffect({ type: "start_backoff", durationMs: 60_000 }, controller.signal);
    });
});
// ---------------------------------------------------------------------------
// Abort effect (Requirement 3.4)
// ---------------------------------------------------------------------------
describe("abort effect", () => {
    it("sets the aborted flag to true", async () => {
        const executor = createExecutor();
        expect(executor.aborted).toBe(false);
        await executor.executeEffect({ type: "abort", reason: "max iterations reached" });
        expect(executor.aborted).toBe(true);
    });
    it("logs the abort reason via onLog", async () => {
        const onLog = vi.fn();
        const executor = createExecutor({ onLog });
        await executor.executeEffect({ type: "abort", reason: "max iterations reached" });
        expect(onLog).toHaveBeenCalledWith("Aborted: max iterations reached");
    });
});
// ---------------------------------------------------------------------------
// Stop effect (Requirement 3.5)
// ---------------------------------------------------------------------------
describe("stop effect", () => {
    it("sets the stopped flag to true", async () => {
        const executor = createExecutor();
        expect(executor.stopped).toBe(false);
        await executor.executeEffect({ type: "stop" });
        expect(executor.stopped).toBe(true);
    });
    it("logs via onLog", async () => {
        const onLog = vi.fn();
        const executor = createExecutor({ onLog });
        await executor.executeEffect({ type: "stop" });
        expect(onLog).toHaveBeenCalledWith("Stopped");
    });
});
// ---------------------------------------------------------------------------
// schedule_iteration effect (Requirement 3.6 — no-op at executor level)
// ---------------------------------------------------------------------------
describe("schedule_iteration effect", () => {
    it("is a no-op — does not call execFileSync or set any flags", async () => {
        const onLog = vi.fn();
        const executor = createExecutor({ onLog });
        await executor.executeEffect({ type: "schedule_iteration", iterationNumber: 1 });
        expect(execFileSync).not.toHaveBeenCalled();
        expect(executor.aborted).toBe(false);
        expect(executor.stopped).toBe(false);
        expect(onLog).not.toHaveBeenCalled();
    });
});
// ---------------------------------------------------------------------------
// executeEffects — sequential processing (Requirement 3.6)
// ---------------------------------------------------------------------------
describe("executeEffects", () => {
    it("processes effects in order", async () => {
        const onLog = vi.fn();
        const executor = createExecutor({ onLog });
        const callOrder = [];
        const mock = execFileSync;
        mock.mockImplementation((_exec, args) => {
            // Track which git command was called
            callOrder.push(args[0]);
        });
        const effects = [
            { type: "rollback" },
            { type: "commit", message: "test" },
        ];
        await executor.executeEffects(effects);
        // Rollback: stash then rev-parse then reset then clean, followed by Commit: add then diff then commit
        expect(callOrder).toEqual(["stash", "rev-parse", "reset", "clean", "add", "diff", "commit"]);
    });
    it("executes all effects in the array", async () => {
        const onLog = vi.fn();
        const executor = createExecutor({ onLog });
        const effects = [{ type: "commit", message: "first" }, { type: "stop" }];
        await executor.executeEffects(effects);
        // commit calls execFileSync 3 times (add + frozen zone diff + commit)
        expect(execFileSync).toHaveBeenCalledTimes(3);
        // stop sets the flag
        expect(executor.stopped).toBe(true);
    });
});
// ---------------------------------------------------------------------------
// Git commands without shell: true (Requirement 3.7)
// ---------------------------------------------------------------------------
describe("git commands executed without shell", () => {
    it("commit effect never passes shell option", async () => {
        const executor = createExecutor();
        await executor.executeEffect({ type: "commit", message: "$(malicious)" });
        const mock = execFileSync;
        for (const call of mock.mock.calls) {
            const options = call[2];
            // Options should only contain cwd, never shell
            expect(options).toEqual({ cwd: "/test/repo" });
        }
    });
    it("rollback effect never passes shell option", async () => {
        const executor = createExecutor();
        await executor.executeEffect({ type: "rollback" });
        const mock = execFileSync;
        for (const call of mock.mock.calls) {
            const options = call[2];
            expect(options).toEqual({ cwd: "/test/repo" });
        }
    });
});
// ---------------------------------------------------------------------------
// Feature: audit-followup-improvements, Property 2: Dry-run rollback non-destructiveness
// ---------------------------------------------------------------------------
describe("Feature: audit-followup-improvements, Property 2: Dry-run rollback non-destructiveness", () => {
    /**
     * For any set of untracked files reported by `git clean -fdn`, when the
     * `dryRun` flag is `true`, `executeRollback()` SHALL invoke `onLog` for
     * every file in the set (plus one header message) AND SHALL NOT invoke
     * `git reset --hard HEAD` or `git clean -fd` (the destructive commands).
     * The only `execFileSync` call SHALL be `git clean -fdn`.
     *
     * **Validates: Requirements 3.5, 3.6**
     */
    it("onLog is called once per file plus header, and no destructive git commands are issued", () => {
        fc.assert(fc.property(fc.array(fc.string().filter((s) => s.length > 0 && !s.includes("\n"))), (filePaths) => {
            // Reset mocks for each iteration
            vi.clearAllMocks();
            const onLog = vi.fn();
            const onNotesUpdate = vi.fn();
            const executor = new EffectExecutor({
                cwd: "/test/repo",
                onLog,
                onNotesUpdate,
                dryRun: true,
            });
            // Simulate git clean -fdn output: each file prefixed with "Would remove "
            const gitCleanOutput = filePaths.map((f) => `Would remove ${f}`).join("\n");
            const mock = execFileSync;
            mock.mockReturnValue(Buffer.from(gitCleanOutput));
            // Execute the rollback in dry-run mode (synchronous internally)
            executor.executeEffect({ type: "rollback" });
            // --- Assertion 1: onLog call count ---
            // Header message + one call per file (or header + "(no untracked files)" if empty)
            if (filePaths.length > 0) {
                // 1 header + N file lines
                expect(onLog).toHaveBeenCalledTimes(1 + filePaths.length);
            }
            else {
                // 1 header + 1 "(no untracked files to clean)" message
                expect(onLog).toHaveBeenCalledTimes(2);
            }
            // --- Assertion 2: execFileSync called exactly once (git clean -fdn) ---
            expect(mock).toHaveBeenCalledTimes(1);
            const expectedDryRun = buildCleanDryRunCommand();
            expect(mock.mock.calls[0][0]).toBe(expectedDryRun.executable);
            expect(mock.mock.calls[0][1]).toEqual(expectedDryRun.args);
            // --- Assertion 3: No destructive commands ---
            for (const call of mock.mock.calls) {
                const args = call[1];
                // Must not contain "reset" (git reset --hard HEAD)
                expect(args[0]).not.toBe("reset");
                // Must not be destructive clean (git clean -fd without n)
                if (args[0] === "clean") {
                    expect(args).toContain("-fdn");
                }
                // Must not contain "stash" (no stash in dry-run)
                expect(args[0]).not.toBe("stash");
            }
        }), { numRuns: 100 });
    });
});
// ---------------------------------------------------------------------------
// FrozenZoneViolation error type (Requirements 8.1, 8.2)
// ---------------------------------------------------------------------------
describe("FrozenZoneViolation error type", () => {
    it("has code property set to FROZEN_ZONE_VIOLATION", () => {
        const err = new FrozenZoneViolation(["file1.md"]);
        expect(err.code).toBe("FROZEN_ZONE_VIOLATION");
    });
    it("stores the violating files in the files property", () => {
        const files = [".forge/specs/my-spec/requirements.md", ".forge/specs/my-spec/design.md"];
        const err = new FrozenZoneViolation(files);
        expect(err.files).toEqual(files);
    });
    it("is an instance of Error", () => {
        const err = new FrozenZoneViolation(["file.md"]);
        expect(err).toBeInstanceOf(Error);
    });
    it("has name set to FrozenZoneViolation", () => {
        const err = new FrozenZoneViolation(["file.md"]);
        expect(err.name).toBe("FrozenZoneViolation");
    });
    it("includes file names in the error message", () => {
        const files = ["a.md", "b.md"];
        const err = new FrozenZoneViolation(files);
        expect(err.message).toContain("a.md");
        expect(err.message).toContain("b.md");
    });
    it("is distinguishable from UnexpectedEffectError via instanceof", () => {
        const frozen = new FrozenZoneViolation(["file.md"]);
        const unexpected = new UnexpectedEffectError("boom");
        expect(frozen).toBeInstanceOf(FrozenZoneViolation);
        expect(frozen).not.toBeInstanceOf(UnexpectedEffectError);
        expect(unexpected).not.toBeInstanceOf(FrozenZoneViolation);
    });
});
// ---------------------------------------------------------------------------
// UnexpectedEffectError error type (Requirements 8.1, 8.3)
// ---------------------------------------------------------------------------
describe("UnexpectedEffectError error type", () => {
    it("has code property set to UNEXPECTED_EFFECT_ERROR", () => {
        const err = new UnexpectedEffectError("git crashed");
        expect(err.code).toBe("UNEXPECTED_EFFECT_ERROR");
    });
    it("is an instance of Error", () => {
        const err = new UnexpectedEffectError("something broke");
        expect(err).toBeInstanceOf(Error);
    });
    it("has name set to UnexpectedEffectError", () => {
        const err = new UnexpectedEffectError("oops");
        expect(err.name).toBe("UnexpectedEffectError");
    });
    it("preserves the error message", () => {
        const err = new UnexpectedEffectError("git command failed with exit code 128");
        expect(err.message).toBe("git command failed with exit code 128");
    });
});
// ---------------------------------------------------------------------------
// Abort signal skips remaining effects in executeEffects (Requirement 14.1–14.3)
// ---------------------------------------------------------------------------
describe("abort signal skips remaining effects", () => {
    it("skips all effects when signal is already aborted before executeEffects", async () => {
        const onLog = vi.fn();
        const executor = createExecutor({ onLog });
        const controller = new AbortController();
        controller.abort();
        const effects = [
            { type: "commit", message: "should not run" },
            { type: "rollback" },
            { type: "stop" },
        ];
        await executor.executeEffects(effects, controller.signal);
        // No git commands should have been called
        expect(execFileSync).not.toHaveBeenCalled();
        // stop flag should not be set (effect was skipped)
        expect(executor.stopped).toBe(false);
        // Should log the interruption message
        expect(onLog).toHaveBeenCalledWith("Effect execution interrupted: abort signal received");
    });
    it("skips remaining effects after abort signal fires mid-execution", async () => {
        const onLog = vi.fn();
        const executor = createExecutor({ onLog });
        const controller = new AbortController();
        const effects = [
            { type: "abort", reason: "test abort" },
            { type: "commit", message: "should not run" },
        ];
        // Abort after the first effect is processed
        // The abort effect itself sets executor.aborted but doesn't trigger the signal.
        // We abort the controller after the first effect by hooking into onLog.
        let effectCount = 0;
        onLog.mockImplementation(() => {
            effectCount++;
            if (effectCount === 1) {
                controller.abort();
            }
        });
        await executor.executeEffects(effects, controller.signal);
        // The abort effect should have been processed
        expect(executor.aborted).toBe(true);
        // The commit should have been skipped — only the abort effect's log + interruption log
        expect(onLog).toHaveBeenCalledWith("Aborted: test abort");
        expect(onLog).toHaveBeenCalledWith("Effect execution interrupted: abort signal received");
        // No git commands from the commit
        expect(execFileSync).not.toHaveBeenCalled();
    });
});
// ---------------------------------------------------------------------------
// Abort signal skips commit and rollback operations (Requirement 14.2)
// ---------------------------------------------------------------------------
describe("abort signal skips commit and rollback operations", () => {
    it("commit is skipped when abort signal is already fired", async () => {
        const onLog = vi.fn();
        const executor = createExecutor({ onLog });
        const controller = new AbortController();
        controller.abort();
        await executor.executeEffect({ type: "commit", message: "should be skipped" }, controller.signal);
        expect(execFileSync).not.toHaveBeenCalled();
        expect(onLog).toHaveBeenCalledWith("Commit skipped: abort signal received");
    });
    it("rollback is skipped when abort signal is already fired", async () => {
        const onLog = vi.fn();
        const executor = createExecutor({ onLog });
        const controller = new AbortController();
        controller.abort();
        await executor.executeEffect({ type: "rollback" }, controller.signal);
        expect(execFileSync).not.toHaveBeenCalled();
        expect(onLog).toHaveBeenCalledWith("Rollback skipped: abort signal received");
    });
});
//# sourceMappingURL=effect-executor.test.js.map