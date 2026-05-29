import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const SCRIPT = resolve(__dirname, "../../../scripts/check-docs-updated.ts");
const ROOT = resolve(__dirname, "../../..");
function run(args, env) {
    try {
        const output = execFileSync("npx", ["tsx", SCRIPT, ...args], {
            cwd: ROOT,
            encoding: "utf-8",
            env: { ...process.env, ...env },
            timeout: 15_000,
        });
        return { exitCode: 0, stdout: output, stderr: "" };
    }
    catch (err) {
        const e = err;
        return {
            exitCode: e.status ?? 1,
            stdout: e.stdout ?? "",
            stderr: e.stderr ?? "",
        };
    }
}
// We test the CLI logic by testing the core functions that the script uses.
// Since the script calls git, we test the pure logic here.
import { computeExitResult } from "../../../src/docs-governance/cli/_runtime.js";
import { formatDiagnostics, formatNdjson, } from "../../../src/docs-governance/reporter/diagnostic.js";
import { findFrontmatterRange, isFrontmatterOnlyChange, } from "../../../src/docs-governance/updated-auditor.js";
const SCRIPT_NAME = "check-docs-updated";
function makeDiag(overrides = {}) {
    return {
        script: SCRIPT_NAME,
        severity: "error",
        file: "docs/test.md",
        message: "test diagnostic",
        ...overrides,
    };
}
describe("check-docs-updated CLI logic", () => {
    describe("--help flag", () => {
        it("exits 0 with --help", () => {
            const result = run(["--help"]);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("check-docs-updated");
            expect(result.stdout).toContain("--json");
            expect(result.stdout).toContain("--fix");
        });
        it("exits 0 with -h", () => {
            const result = run(["-h"]);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("check-docs-updated");
        });
    });
    describe("argument parsing", () => {
        it("recognizes --json flag", () => {
            // --json with no git repo produces either empty or error output in NDJSON
            const result = run(["--json"], { GIT_DIR: "/nonexistent" });
            // Output should be empty or valid NDJSON lines
            const lines = result.stdout.trim().split("\n").filter(Boolean);
            for (const line of lines) {
                expect(() => JSON.parse(line)).not.toThrow();
            }
        });
        it("recognizes --fix flag in help output", () => {
            const result = run(["--help"]);
            expect(result.stdout).toContain("--fix");
        });
    });
    describe("computeExitResult integration", () => {
        it("returns exit code 0 for no diagnostics", () => {
            const result = computeExitResult(() => []);
            expect(result.exitCode).toBe(0);
        });
        it("returns exit code 1 for error diagnostics", () => {
            const result = computeExitResult(() => [makeDiag({ severity: "error" })]);
            expect(result.exitCode).toBe(1);
        });
        it("returns exit code 3 for thrown errors", () => {
            const result = computeExitResult(() => {
                throw new Error("git failed");
            });
            expect(result.exitCode).toBe(3);
            expect(result.error).toBeDefined();
        });
    });
    describe("formatDiagnostics for updated audit output", () => {
        it("formats error with file, line, and message", () => {
            const diags = [
                makeDiag({
                    file: "docs/guide.md",
                    severity: "error",
                    message: "Body changed but 'updated' not bumped",
                    line: 3,
                    code: "UPDATED_NOT_BUMPED",
                }),
            ];
            const output = formatDiagnostics(diags);
            expect(output).toContain("docs/guide.md");
            expect(output).toContain("error");
            expect(output).toContain("Body changed but 'updated' not bumped");
            expect(output).toContain("Summary:");
        });
        it("formats NDJSON output", () => {
            const diags = [makeDiag()];
            const output = formatNdjson(diags);
            const parsed = JSON.parse(output);
            expect(parsed.script).toBe(SCRIPT_NAME);
            expect(parsed.severity).toBe("error");
        });
    });
    describe("updated-auditor logic used by CLI", () => {
        it("detects frontmatter-only changes as not needing update", () => {
            const content = "---\ntitle: Test\nupdated: 2026-05-01\n---\n\nBody content";
            const diff = "@@ -1,3 +1,3 @@\n-title: Test\n+title: New Title";
            expect(isFrontmatterOnlyChange(content, diff)).toBe(true);
        });
        it("detects body changes as needing update", () => {
            const content = "---\ntitle: Test\nupdated: 2026-05-01\n---\n\nBody content";
            const diff = "@@ -5,1 +5,1 @@\n-Body content\n+Body changed";
            expect(isFrontmatterOnlyChange(content, diff)).toBe(false);
        });
        it("finds frontmatter range for updated field extraction", () => {
            const lines = ["---", "title: Test", "updated: 2026-05-01", "---", "", "Body"];
            const range = findFrontmatterRange(lines);
            expect(range).toEqual({ start: 0, end: 3 });
        });
    });
});
//# sourceMappingURL=check-docs-updated.test.js.map