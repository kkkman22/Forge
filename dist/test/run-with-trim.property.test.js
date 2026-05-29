/**
 * Property-based tests for run-with-trim.sh wrapper script.
 *
 * Covers:
 *   - Property 1: exit code preservation
 *   - Property 2: success output truncation
 *   - Property 3: failure output passthrough
 *   - Property 4: header presence
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.8**
 */
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
const PROJECT_ROOT = resolve(import.meta.dirname, "..");
const SCRIPT_PATH = resolve(PROJECT_ROOT, "scripts/run-with-trim.sh");
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * Strips trailing newline characters only (preserves trailing spaces on lines).
 */
function stripTrailingNewlines(s) {
    return s.replace(/\n+$/, "");
}
/**
 * Runs run-with-trim.sh with a command that produces the given exit code and output.
 * Returns { exitCode, stdout }.
 *
 * Uses Node.js to emit the lines so we don't have to worry about shell
 * escaping of special characters (backticks, dollars, quotes, etc.).
 */
function runWithTrim(exitCode, lines) {
    const tmpDir = mkdtempSync(join(tmpdir(), "rwt-"));
    const dataPath = join(tmpDir, "data.txt");
    const cmdPath = join(tmpDir, "cmd.js");
    // Write lines to a data file
    writeFileSync(dataPath, `${lines.join("\n")}\n`, "utf-8");
    // Write a Node script that prints the data file and exits with the given code
    const escapedPath = dataPath.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const cmdBody = `const fs = require('fs');
const data = fs.readFileSync('${escapedPath}', 'utf-8');
process.stdout.write(data);
process.exit(${exitCode});
`;
    writeFileSync(cmdPath, cmdBody, "utf-8");
    try {
        const stdout = execSync(`bash "${SCRIPT_PATH}" node "${cmdPath}"`, {
            encoding: "utf-8",
            cwd: PROJECT_ROOT,
            timeout: 10_000,
        });
        return { exitCode: 0, stdout: stripTrailingNewlines(stdout) };
    }
    catch (error) {
        // execSync throws when exit code is non-zero
        const execError = error;
        const stdout = execError.stdout?.toString?.() ?? "";
        return { exitCode: execError.status ?? 1, stdout: stripTrailingNewlines(stdout) };
    }
}
// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
/** Arbitrary exit code (0–255). */
const exitCodeArb = fc.integer({ min: 0, max: 255 });
/** Arbitrary line of output (alphanumeric, no newlines). */
const lineArb = fc
    .string({ minLength: 1, maxLength: 80 })
    .filter((s) => !s.includes("\n") && s.trim().length > 0);
/** Arbitrary output: array of lines (1–100 lines). */
const linesArb = fc.array(lineArb, { minLength: 1, maxLength: 100 });
// ---------------------------------------------------------------------------
// Property 1: Exit code preservation
// ---------------------------------------------------------------------------
describe("Property 1: Exit code preservation", () => {
    it("preserves the original exit code for any command (Req 3.1, 3.5)", () => {
        fc.assert(fc.property(exitCodeArb, linesArb, (exitCode, lines) => {
            const result = runWithTrim(exitCode, lines);
            expect(result.exitCode).toBe(exitCode);
        }), { numRuns: 20 });
    }, 30_000);
});
// ---------------------------------------------------------------------------
// Property 2: Success output truncation
// ---------------------------------------------------------------------------
describe("Property 2: Success output truncation", () => {
    it("truncates output when >30 lines and exit=0 (Req 3.2, 3.3)", () => {
        fc.assert(fc.property(fc.array(lineArb, { minLength: 31, maxLength: 100 }), (lines) => {
            const result = runWithTrim(0, lines);
            const outputLines = result.stdout.split("\n");
            // Header is always present
            expect(outputLines[0]).toMatch(/^── run-with-trim ──/);
            // Should contain truncation indicator
            expect(result.stdout).toContain("Output truncated");
            // Should contain last 5 lines marker
            expect(result.stdout).toContain("--- last 5 lines ---");
            // Output should be shorter than original
            expect(outputLines.length).toBeLessThan(lines.length + 5);
        }), { numRuns: 30 });
    }, 15_000);
    it("passes through output unchanged when ≤30 lines and exit=0 (Req 3.2, 3.3)", () => {
        fc.assert(fc.property(fc.array(lineArb, { minLength: 1, maxLength: 30 }), (lines) => {
            const result = runWithTrim(0, lines);
            const outputLines = result.stdout.split("\n");
            // Header + all original lines
            expect(outputLines.length).toBe(lines.length + 1);
            // Each original line should appear in output
            for (const line of lines) {
                expect(result.stdout).toContain(line);
            }
        }), { numRuns: 30 });
    }, 15_000);
});
// ---------------------------------------------------------------------------
// Property 3: Failure output passthrough
// ---------------------------------------------------------------------------
describe("Property 3: Failure output passthrough", () => {
    it("passes through full output unchanged on non-zero exit (Req 3.4)", () => {
        fc.assert(fc.property(fc.integer({ min: 1, max: 255 }), fc.array(lineArb, { minLength: 1, maxLength: 100 }), (exitCode, lines) => {
            const result = runWithTrim(exitCode, lines);
            // Header is present
            expect(result.stdout).toMatch(/^── run-with-trim ──/);
            // Every original line should appear unchanged in output
            for (const line of lines) {
                expect(result.stdout).toContain(line);
            }
            // Output should contain header + all original lines
            const outputLines = result.stdout.split("\n");
            expect(outputLines.length).toBe(lines.length + 1);
        }), { numRuns: 30 });
    }, 15_000);
});
// ---------------------------------------------------------------------------
// Property 4: Header presence
// ---------------------------------------------------------------------------
describe("Property 4: Header presence", () => {
    it("always prints a header line matching the expected format (Req 3.8)", () => {
        fc.assert(fc.property(exitCodeArb, linesArb, (exitCode, lines) => {
            const result = runWithTrim(exitCode, lines);
            const firstLine = result.stdout.split("\n")[0];
            expect(firstLine).toMatch(/^── run-with-trim ── .* ── exit:\d+ ──$/);
        }), { numRuns: 30 });
    }, 15_000);
});
//# sourceMappingURL=run-with-trim.property.test.js.map