import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const SCRIPT = resolve(__dirname, "../../../scripts/check-docs-links.ts");
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
import { computeExitResult } from "../../../src/docs-governance/cli/_runtime.js";
import { dedupAnchorsInDoc, extractLinks, gfmAnchor, } from "../../../src/docs-governance/link-checker.js";
import { formatDiagnostics, formatNdjson, } from "../../../src/docs-governance/reporter/diagnostic.js";
const SCRIPT_NAME = "check-docs-links";
function makeDiag(overrides = {}) {
    return {
        script: SCRIPT_NAME,
        severity: "error",
        file: "docs/guide.md",
        message: "test diagnostic",
        ...overrides,
    };
}
describe("check-docs-links CLI logic", () => {
    describe("--help flag", () => {
        it("exits 0 with --help", () => {
            const result = run(["--help"]);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("check-docs-links");
            expect(result.stdout).toContain("--json");
        });
        it("exits 0 with -h", () => {
            const result = run(["-h"]);
            expect(result.exitCode).toBe(0);
        });
    });
    describe("argument parsing", () => {
        it("--json flag produces parseable NDJSON", () => {
            const result = run(["--json"]);
            const lines = result.stdout.trim().split("\n").filter(Boolean);
            for (const line of lines) {
                expect(() => JSON.parse(line)).not.toThrow();
            }
        });
    });
    describe("computeExitResult integration", () => {
        it("returns exit code 0 for no diagnostics", () => {
            const result = computeExitResult(() => []);
            expect(result.exitCode).toBe(0);
        });
        it("returns exit code 1 for broken link errors", () => {
            const result = computeExitResult(() => [
                makeDiag({
                    severity: "error",
                    message: "Broken link: ./missing.md",
                    code: "BROKEN_LINK",
                    line: 10,
                }),
            ]);
            expect(result.exitCode).toBe(1);
        });
    });
    describe("formatDiagnostics for link check output", () => {
        it("formats broken link with file, line, target", () => {
            const diags = [
                makeDiag({
                    file: "docs/guide.md",
                    severity: "error",
                    message: "Broken link ./missing.md: file not found",
                    line: 42,
                    code: "BROKEN_LINK",
                }),
            ];
            const output = formatDiagnostics(diags);
            expect(output).toContain("docs/guide.md:42");
            expect(output).toContain("Broken link ./missing.md");
            expect(output).toContain("Summary:");
        });
        it("formats NDJSON with line and code fields", () => {
            const diags = [makeDiag({ line: 10, code: "BROKEN_ANCHOR" })];
            const output = formatNdjson(diags);
            const parsed = JSON.parse(output);
            expect(parsed.script).toBe(SCRIPT_NAME);
            expect(parsed.line).toBe(10);
            expect(parsed.code).toBe("BROKEN_ANCHOR");
        });
    });
    describe("link-checker logic used by CLI", () => {
        it("extractLinks skips external URLs", () => {
            const text = "[web](https://example.com) [mail](mailto:a@b)";
            const links = extractLinks(text);
            expect(links).toHaveLength(0);
        });
        it("extractLinks skips links in code blocks", () => {
            const text = "```\n[bad](./link.md)\n```\n[good](./real.md)";
            const links = extractLinks(text);
            expect(links).toHaveLength(1);
            expect(links[0].target).toBe("./real.md");
        });
        it("gfmAnchor generates correct anchors for headings", () => {
            expect(gfmAnchor("Getting Started")).toBe("getting-started");
            expect(gfmAnchor("API Reference")).toBe("api-reference");
        });
        it("dedupAnchorsInDoc handles duplicate headings", () => {
            const headings = [
                { text: "Intro", anchor: "" },
                { text: "Intro", anchor: "" },
            ];
            dedupAnchorsInDoc(headings);
            expect(headings[0].anchor).toBe("intro");
            expect(headings[1].anchor).toBe("intro-1");
        });
    });
});
//# sourceMappingURL=check-docs-links.test.js.map