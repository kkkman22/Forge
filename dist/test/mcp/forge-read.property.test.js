/**
 * Property-based tests for the forge_read MCP tool — output isolation.
 *
 * Covers:
 *   - Property 5: For any forge_read invocation, the tool response SHALL NOT
 *     contain the raw content of any file listed in `paths` — only the
 *     script's stdout SHALL appear in the response.
 *
 * **Validates: Requirement 4.3**
 */
import * as fc from "fast-check";
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
// Generators
// ---------------------------------------------------------------------------
/**
 * Generate identifiable file content — a string with a unique marker prefix
 * that makes it easy to detect if it leaked into the response.
 */
const fileContentArb = fc
    .tuple(fc.integer({ min: 1000, max: 9999 }), fc.stringMatching(/^[a-zA-Z0-9]{10,50}$/))
    .map(([id, body]) => `FILE_MARKER_${id}_${body}`);
/**
 * Generate a script stdout that is a short summary (never contains file markers).
 */
const scriptOutputArb = fc
    .tuple(fc.integer({ min: 1, max: 100 }), fc.integer({ min: 0, max: 1000 }))
    .map(([count, metric]) => `Analysis: ${count} files, ${metric} lines total`);
/**
 * Generate a list of file paths (realistic-looking paths).
 */
const filePathsArb = fc.array(fc
    .tuple(fc.constantFrom("src", "lib", "test", "utils"), fc.stringMatching(/^[a-z]{1,20}$/), fc.constantFrom(".ts", ".js", ".py"))
    .map(([dir, name, ext]) => `${dir}/${name}${ext}`), { minLength: 1, maxLength: 10 });
// ---------------------------------------------------------------------------
// Property 5: Output isolation
// ---------------------------------------------------------------------------
describe("Feature: context-optimization, Property 5: Output isolation", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });
    /**
     * **Validates: Requirement 4.3**
     *
     * For any forge_read invocation with random file contents and a script
     * that outputs only summary info, the response (stdout) never contains
     * the raw file content.
     *
     * Test strategy:
     * - Generate random file contents with identifiable markers
     * - Mock the subprocess to return only the script's summary output
     * - Verify the returned stdout does not contain any file content markers
     */
    it("response contains only script stdout, never raw file content", async () => {
        await fc.assert(fc.asyncProperty(filePathsArb, fc.array(fileContentArb, { minLength: 1, maxLength: 5 }), scriptOutputArb, async (paths, fileContents, scriptOutput) => {
            // Mock: subprocess returns only the script's stdout
            mockedExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
                cb(null, scriptOutput, "");
                return {};
            });
            const result = await execReadScript("analysis-script", "javascript", paths, 30000);
            // The response must be exactly the script output
            expect(result.stdout).toBe(scriptOutput);
            // The response must NOT contain any raw file content
            for (const content of fileContents) {
                expect(result.stdout).not.toContain(content);
            }
            // The response must NOT contain file content markers
            expect(result.stdout).not.toMatch(/FILE_MARKER_\d+/);
        }), { numRuns: 100 });
    });
    /**
     * **Validates: Requirement 4.3**
     *
     * Even when the script processes files and produces output, the FORGE_FILES
     * env var (which contains paths, not content) is the only file-related data
     * passed to the subprocess. File contents are never part of the tool's
     * input/output pipeline.
     */
    it("FORGE_FILES contains only paths, never file contents", async () => {
        await fc.assert(fc.asyncProperty(filePathsArb, fc.array(fileContentArb, { minLength: 1, maxLength: 5 }), async (paths, fileContents) => {
            let capturedEnv = {};
            mockedExecFile.mockImplementation((_cmd, _args, opts, cb) => {
                capturedEnv = opts.env ?? {};
                cb(null, "ok", "");
                return {};
            });
            await execReadScript("script", "javascript", paths, 30000);
            // FORGE_FILES must contain only the paths as JSON
            const forgeFiles = capturedEnv.FORGE_FILES;
            expect(forgeFiles).toBeDefined();
            const parsedPaths = JSON.parse(forgeFiles);
            expect(parsedPaths).toEqual(paths);
            // FORGE_FILES must NOT contain any file content
            for (const content of fileContents) {
                expect(forgeFiles).not.toContain(content);
            }
        }), { numRuns: 100 });
    });
    /**
     * **Validates: Requirement 4.3**
     *
     * On error, the response contains only stderr/stdout from the script
     * execution, never file contents.
     */
    it("error responses contain only script error output, never file content", async () => {
        await fc.assert(fc.asyncProperty(filePathsArb, fc.array(fileContentArb, { minLength: 1, maxLength: 5 }), fc.integer({ min: 1, max: 255 }), async (paths, fileContents, exitCode) => {
            const errorMsg = `Error: script failed with code ${exitCode}`;
            mockedExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
                cb({ code: exitCode, killed: false }, "", errorMsg);
                return {};
            });
            const result = await execReadScript("bad-script", "javascript", paths, 30000);
            // Error output must not contain file contents
            for (const content of fileContents) {
                expect(result.stdout).not.toContain(content);
                expect(result.stderr).not.toContain(content);
            }
            // Error output must contain the actual error message
            expect(result.stderr).toBe(errorMsg);
        }), { numRuns: 100 });
    });
});
//# sourceMappingURL=forge-read.property.test.js.map