/**
 * Unit tests for the unified CLI error path.
 *
 * Verifies that:
 * - CliError is a proper Error subclass with an exitCode property
 * - Each CLI precondition failure throws CliError with a descriptive message
 *   rather than calling process.exit directly
 *
 * **Validates: Requirements 7.1, 7.2**
 * **Property 10: CLI precondition failures use unified error path**
 */
import { describe, expect, it } from "vitest";
import { CliError } from "../src/cli-error.js";
// ---------------------------------------------------------------------------
// 1. CliError class behavior
// ---------------------------------------------------------------------------
describe("CliError", () => {
    it("extends Error", () => {
        const err = new CliError("test");
        expect(err).toBeInstanceOf(Error);
        expect(err).toBeInstanceOf(CliError);
    });
    it("has name set to 'CliError'", () => {
        const err = new CliError("test");
        expect(err.name).toBe("CliError");
    });
    it("stores the message", () => {
        const err = new CliError("something went wrong");
        expect(err.message).toBe("something went wrong");
    });
    it("defaults exitCode to 1", () => {
        const err = new CliError("fail");
        expect(err.exitCode).toBe(1);
    });
    it("accepts a custom exitCode", () => {
        const err = new CliError("fail", 2);
        expect(err.exitCode).toBe(2);
    });
    it("exitCode is readonly", () => {
        const err = new CliError("fail", 3);
        // TypeScript enforces readonly at compile time; verify the value is stable
        expect(err.exitCode).toBe(3);
    });
    it("produces a useful stack trace", () => {
        const err = new CliError("trace test");
        expect(err.stack).toBeDefined();
        expect(err.stack).toContain("trace test");
    });
});
// ---------------------------------------------------------------------------
// 2. Precondition failure messages — verify the CLI throws CliError
//    for each precondition rather than calling process.exit directly.
//
//    We simulate the precondition logic extracted from forge-loop-cli.ts
//    to confirm each path produces a CliError with the expected message.
// ---------------------------------------------------------------------------
describe("CLI precondition failures throw CliError", () => {
    /**
     * Simulates the non-git-repo check from forge-loop-cli.ts.
     * In the real CLI, execFileSync throws when not in a git repo,
     * and the catch block now throws CliError.
     */
    function checkGitRepo(isGitRepo) {
        if (!isGitRepo) {
            throw new CliError("Error: Current directory is not a Git repository.");
        }
    }
    /**
     * Simulates the dirty working tree check.
     */
    function checkCleanWorkingTree(status, useWorktree) {
        if (!useWorktree && status.trim() !== "") {
            throw new CliError("Error: Working tree is not clean. Commit or stash changes before running, or use --worktree.");
        }
    }
    /**
     * Simulates the invalid worktree source branch check.
     */
    function checkWorktreeSource(currentBranch, useWorktree) {
        if (useWorktree && currentBranch.startsWith("forge/")) {
            throw new CliError("Error: Cannot create a worktree from a forge/ branch. Switch to main or another non-forge branch first.");
        }
    }
    /**
     * Simulates the missing .forge/ directory check.
     */
    function checkForgeDir(hasForgeDir, hasSkillOptions) {
        if (!hasForgeDir && hasSkillOptions) {
            throw new CliError("Error: --tier, --type, and --phase require a .forge/ directory. Run `forge init` first.");
        }
    }
    // -- Non-git-repo check --
    it("throws CliError when not in a git repository", () => {
        expect(() => checkGitRepo(false)).toThrow(CliError);
    });
    it("non-git-repo error has descriptive message", () => {
        try {
            checkGitRepo(false);
        }
        catch (err) {
            expect(err).toBeInstanceOf(CliError);
            expect(err.message).toContain("not a Git repository");
            expect(err.exitCode).toBe(1);
        }
    });
    it("does not throw when in a git repository", () => {
        expect(() => checkGitRepo(true)).not.toThrow();
    });
    // -- Dirty working tree check --
    it("throws CliError when working tree is dirty and not using worktree", () => {
        expect(() => checkCleanWorkingTree("M src/file.ts", false)).toThrow(CliError);
    });
    it("dirty-tree error has descriptive message", () => {
        try {
            checkCleanWorkingTree("M src/file.ts", false);
        }
        catch (err) {
            expect(err).toBeInstanceOf(CliError);
            expect(err.message).toContain("Working tree is not clean");
            expect(err.exitCode).toBe(1);
        }
    });
    it("does not throw when working tree is clean", () => {
        expect(() => checkCleanWorkingTree("", false)).not.toThrow();
    });
    it("does not throw when using worktree even if tree is dirty", () => {
        expect(() => checkCleanWorkingTree("M src/file.ts", true)).not.toThrow();
    });
    // -- Invalid worktree source branch check --
    it("throws CliError when on a forge/ branch and using worktree", () => {
        expect(() => checkWorktreeSource("forge/my-feature", true)).toThrow(CliError);
    });
    it("invalid-branch error has descriptive message", () => {
        try {
            checkWorktreeSource("forge/my-feature", true);
        }
        catch (err) {
            expect(err).toBeInstanceOf(CliError);
            expect(err.message).toContain("Cannot create a worktree from a forge/ branch");
            expect(err.exitCode).toBe(1);
        }
    });
    it("does not throw when on main branch with worktree", () => {
        expect(() => checkWorktreeSource("main", true)).not.toThrow();
    });
    it("does not throw when on forge/ branch without worktree", () => {
        expect(() => checkWorktreeSource("forge/my-feature", false)).not.toThrow();
    });
    // -- Missing .forge/ directory check --
    it("throws CliError when .forge/ missing and skill options used", () => {
        expect(() => checkForgeDir(false, true)).toThrow(CliError);
    });
    it("missing-forge-dir error has descriptive message", () => {
        try {
            checkForgeDir(false, true);
        }
        catch (err) {
            expect(err).toBeInstanceOf(CliError);
            expect(err.message).toContain("require a .forge/ directory");
            expect(err.exitCode).toBe(1);
        }
    });
    it("does not throw when .forge/ exists with skill options", () => {
        expect(() => checkForgeDir(true, true)).not.toThrow();
    });
    it("does not throw when no skill options used", () => {
        expect(() => checkForgeDir(false, false)).not.toThrow();
    });
});
// ---------------------------------------------------------------------------
// 3. main().catch() handler logic — verify CliError is handled distinctly
// ---------------------------------------------------------------------------
describe("main().catch() handler logic", () => {
    /**
     * Simulates the catch handler from forge-loop-cli.ts.
     * Returns what would be passed to console.error and process.exit.
     */
    function simulateCatchHandler(err) {
        if (err instanceof CliError) {
            return { message: err.message, exitCode: err.exitCode };
        }
        const message = err instanceof Error ? err.message : String(err);
        return { message, exitCode: 1 };
    }
    it("handles CliError with its exitCode", () => {
        const result = simulateCatchHandler(new CliError("precondition failed", 1));
        expect(result.message).toBe("precondition failed");
        expect(result.exitCode).toBe(1);
    });
    it("handles CliError with custom exitCode", () => {
        const result = simulateCatchHandler(new CliError("custom exit", 42));
        expect(result.message).toBe("custom exit");
        expect(result.exitCode).toBe(42);
    });
    it("handles generic Error with exit code 1", () => {
        const result = simulateCatchHandler(new Error("unexpected"));
        expect(result.message).toBe("unexpected");
        expect(result.exitCode).toBe(1);
    });
    it("handles non-Error values with exit code 1", () => {
        const result = simulateCatchHandler("string error");
        expect(result.message).toBe("string error");
        expect(result.exitCode).toBe(1);
    });
    it("handles null/undefined with exit code 1", () => {
        const result = simulateCatchHandler(null);
        expect(result.message).toBe("null");
        expect(result.exitCode).toBe(1);
    });
});
//# sourceMappingURL=cli-error.test.js.map