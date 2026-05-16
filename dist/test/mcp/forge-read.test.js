/**
 * Unit tests for the forge_read MCP tool.
 *
 * Covers:
 *   - Script execution with file paths via FORGE_FILES env var
 *   - stdout-only return (output isolation)
 *   - Error handling (non-zero exit, timeout)
 *   - JavaScript and shell language support
 *
 * **Validates: Requirements 4.1–4.5**
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { execReadScript } from "../../src/mcp/tools/forge-read.js";
// ---------------------------------------------------------------------------
// Mock child_process.execFile
// ---------------------------------------------------------------------------
vi.mock("node:child_process", () => ({
    execFile: vi.fn(),
}));
import { execFile } from "node:child_process";
const mockedExecFile = execFile;
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Capture the env and args passed to execFile. */
function captureExecCall() {
    let capturedCmd = "";
    let capturedArgs = [];
    let capturedEnv = {};
    mockedExecFile.mockImplementation((cmd, args, opts, cb) => {
        capturedCmd = cmd;
        capturedArgs = args;
        capturedEnv = opts.env ?? {};
        cb(null, "script output", "");
        return {};
    });
    return {
        getCmd: () => capturedCmd,
        getArgs: () => capturedArgs,
        getEnv: () => capturedEnv,
    };
}
/** Mock a successful script execution with given stdout. */
function mockScriptSuccess(stdout) {
    mockedExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
        cb(null, stdout, "");
        return {};
    });
}
/** Mock a failed script execution. */
function mockScriptFailure(stdout, stderr, exitCode = 1) {
    mockedExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
        cb({ code: exitCode, killed: false }, stdout, stderr);
        return {};
    });
}
/** Mock a timed-out script execution. */
function mockScriptTimeout() {
    mockedExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
        cb({ killed: true, code: null }, "partial", "");
        return {};
    });
}
// ---------------------------------------------------------------------------
// execReadScript tests
// ---------------------------------------------------------------------------
describe("execReadScript", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });
    describe("FORGE_FILES env var injection", () => {
        it("passes file paths as JSON array in FORGE_FILES env var", async () => {
            const capture = captureExecCall();
            const paths = ["src/foo.ts", "src/bar.ts", "lib/baz.js"];
            await execReadScript("console.log('hello')", "javascript", paths, 30000);
            const env = capture.getEnv();
            expect(env.FORGE_FILES).toBe(JSON.stringify(paths));
        });
        it("passes empty array when no paths provided", async () => {
            const capture = captureExecCall();
            await execReadScript("echo test", "shell", [], 30000);
            const env = capture.getEnv();
            expect(env.FORGE_FILES).toBe("[]");
        });
    });
    describe("JavaScript language execution", () => {
        it("executes script via node -e for javascript language", async () => {
            const capture = captureExecCall();
            const script = "console.log(JSON.parse(process.env.FORGE_FILES).length)";
            await execReadScript(script, "javascript", ["a.ts"], 30000);
            expect(capture.getCmd()).toBe("node");
            expect(capture.getArgs()).toEqual(["-e", script]);
        });
        it("returns stdout from successful javascript execution", async () => {
            mockScriptSuccess("3 files analyzed\n2 exports found\n");
            const result = await execReadScript("console.log('3 files analyzed\\n2 exports found')", "javascript", ["a.ts", "b.ts", "c.ts"], 30000);
            expect(result.stdout).toBe("3 files analyzed\n2 exports found\n");
            expect(result.stderr).toBe("");
            expect(result.exitCode).toBe(0);
            expect(result.timedOut).toBe(false);
        });
    });
    describe("Shell language execution", () => {
        it("executes script via /bin/sh -c for shell language", async () => {
            const capture = captureExecCall();
            const script = "echo $FORGE_FILES | jq length";
            await execReadScript(script, "shell", ["a.ts"], 30000);
            expect(capture.getCmd()).toBe("/bin/sh");
            expect(capture.getArgs()).toEqual(["-c", script]);
        });
        it("returns stdout from successful shell execution", async () => {
            mockScriptSuccess("file count: 2\n");
            const result = await execReadScript("echo file count: 2", "shell", ["a.ts", "b.ts"], 30000);
            expect(result.stdout).toBe("file count: 2\n");
            expect(result.exitCode).toBe(0);
        });
    });
    describe("output isolation", () => {
        it("returns only stdout, not stderr on success", async () => {
            // Even if stderr has content, on success we only care about stdout
            mockedExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
                cb(null, "analysis result", "some debug info");
                return {};
            });
            const result = await execReadScript("script", "javascript", ["a.ts"], 30000);
            expect(result.stdout).toBe("analysis result");
            expect(result.exitCode).toBe(0);
        });
    });
    describe("error handling", () => {
        it("returns non-zero exit code on script failure", async () => {
            mockScriptFailure("", "SyntaxError: unexpected token", 1);
            const result = await execReadScript("invalid{{{", "javascript", ["a.ts"], 30000);
            expect(result.exitCode).toBe(1);
            expect(result.stderr).toBe("SyntaxError: unexpected token");
            expect(result.timedOut).toBe(false);
        });
        it("returns timedOut=true when script exceeds timeout", async () => {
            mockScriptTimeout();
            const result = await execReadScript("while(true){}", "javascript", ["a.ts"], 100);
            expect(result.timedOut).toBe(true);
            expect(result.exitCode).toBe(1);
        });
        it("handles null child process gracefully", async () => {
            mockedExecFile.mockReturnValue(null);
            const result = await execReadScript("echo test", "shell", [], 30000);
            expect(result.exitCode).toBe(1);
            expect(result.stderr).toBe("Failed to spawn subprocess");
        });
    });
});
// ---------------------------------------------------------------------------
// Integration: forge_read tool response format
// ---------------------------------------------------------------------------
describe("forge_read tool response format", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });
    it("successful execution returns stdout-only content", async () => {
        mockScriptSuccess("Module exports: 5\nDependencies: 3\n");
        const result = await execReadScript("analyze-script", "javascript", ["src/a.ts", "src/b.ts"], 30000);
        // The tool handler would wrap this in MCP response format
        // Here we verify the raw result that feeds into the response
        expect(result.stdout).toBe("Module exports: 5\nDependencies: 3\n");
        expect(result.exitCode).toBe(0);
        expect(result.timedOut).toBe(false);
    });
    it("failed execution provides error details", async () => {
        mockScriptFailure("partial output", "Error: file not found", 1);
        const result = await execReadScript("bad-script", "javascript", ["missing.ts"], 30000);
        expect(result.exitCode).toBe(1);
        expect(result.stdout).toBe("partial output");
        expect(result.stderr).toBe("Error: file not found");
    });
    it("timeout provides clear indication", async () => {
        mockScriptTimeout();
        const result = await execReadScript("slow-script", "javascript", ["big.ts"], 30000);
        expect(result.timedOut).toBe(true);
        expect(result.exitCode).toBe(1);
    });
});
// ---------------------------------------------------------------------------
// execReadScript with cwd option
// ---------------------------------------------------------------------------
describe("execReadScript with cwd", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });
    it("passes cwd option to execFile", async () => {
        let capturedOpts = {};
        mockedExecFile.mockImplementation((_cmd, _args, opts, cb) => {
            capturedOpts = opts;
            cb(null, "done", "");
            return {};
        });
        const result = await execReadScript("console.log(1)", "javascript", [], 30000, {
            cwd: "/custom/root",
        });
        expect(capturedOpts.cwd).toBe("/custom/root");
        expect(result.exitCode).toBe(0);
    });
});
//# sourceMappingURL=forge-read.test.js.map