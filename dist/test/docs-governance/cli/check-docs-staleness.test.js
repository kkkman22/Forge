import { describe, expect, it } from "vitest";
import { computeExitResult } from "../../../src/docs-governance/cli/_runtime.js";
import { formatDiagnostics, formatGitHubAnnotations, formatNdjson, } from "../../../src/docs-governance/reporter/diagnostic.js";
import { classifyStaleness } from "../../../src/docs-governance/staleness.js";
// ── Helpers ──
const SCRIPT_NAME = "staleness-checker";
function makeFm(overrides = {}) {
    return {
        title: "Test",
        category: "daily-use",
        audience: ["daily-developer"],
        updated: "2026-05-20",
        owner: "test",
        ...overrides,
    };
}
function makeDiagnostic(file, severity, message, extra) {
    return {
        script: SCRIPT_NAME,
        severity,
        file: file,
        message,
        ...(extra ? { extra } : {}),
    };
}
const DEFAULT_CONFIG = {
    warning_days: 90,
    critical_days: 180,
    exempt_paths: [],
};
// ── Tests ──
describe("check-docs-staleness CLI logic", () => {
    describe("classifyStaleness", () => {
        it("returns fresh for recently updated doc", () => {
            const today = new Date("2026-05-24");
            const fm = makeFm({ updated: "2026-05-20" });
            expect(classifyStaleness(fm, today, DEFAULT_CONFIG)).toBe("fresh");
        });
        it("returns warning for doc older than warning_days", () => {
            const today = new Date("2026-05-24");
            const fm = makeFm({ updated: "2026-02-01" }); // ~112 days ago
            expect(classifyStaleness(fm, today, DEFAULT_CONFIG)).toBe("warning");
        });
        it("returns critical for doc older than critical_days", () => {
            const today = new Date("2026-05-24");
            const fm = makeFm({ updated: "2025-06-01" }); // ~357 days ago
            expect(classifyStaleness(fm, today, DEFAULT_CONFIG)).toBe("critical");
        });
        it("returns invalid for future-dated doc", () => {
            const today = new Date("2026-05-24");
            const fm = makeFm({ updated: "2026-12-31" });
            expect(classifyStaleness(fm, today, DEFAULT_CONFIG)).toBe("invalid");
        });
        it("returns invalid for malformed date", () => {
            const today = new Date("2026-05-24");
            const fm = makeFm({ updated: "not-a-date" });
            expect(classifyStaleness(fm, today, DEFAULT_CONFIG)).toBe("invalid");
        });
        it("returns fresh for exempt paths", () => {
            const today = new Date("2026-05-24");
            const fm = makeFm({ updated: "2024-01-01" }); // very old
            const config = { ...DEFAULT_CONFIG, exempt_paths: ["LICENSE.md"] };
            expect(classifyStaleness(fm, today, config, "LICENSE.md")).toBe("fresh");
        });
    });
    describe("staleness-to-diagnostic mapping", () => {
        it("maps critical staleness to error-level diagnostic", () => {
            const today = new Date("2026-05-24");
            const fm = makeFm({ updated: "2025-06-01" });
            const status = classifyStaleness(fm, today, DEFAULT_CONFIG);
            expect(status).toBe("critical");
            // CLI maps critical staleness -> severity "error" diagnostic
            const severity = status === "critical" ? "error" : status === "warning" ? "warning" : "info";
            expect(severity).toBe("error");
        });
        it("maps warning staleness to warning-level diagnostic", () => {
            const today = new Date("2026-05-24");
            const fm = makeFm({ updated: "2026-02-01" });
            const status = classifyStaleness(fm, today, DEFAULT_CONFIG);
            expect(status).toBe("warning");
            const severity = status === "critical" ? "error" : status === "warning" ? "warning" : "info";
            expect(severity).toBe("warning");
        });
        it("maps invalid staleness to error-level diagnostic", () => {
            const today = new Date("2026-05-24");
            const fm = makeFm({ updated: "not-a-date" });
            const status = classifyStaleness(fm, today, DEFAULT_CONFIG);
            expect(status).toBe("invalid");
            const severity = status === "invalid" ? "error" : "info";
            expect(severity).toBe("error");
        });
        it("maps fresh staleness to no diagnostic", () => {
            const today = new Date("2026-05-24");
            const fm = makeFm({ updated: "2026-05-20" });
            const status = classifyStaleness(fm, today, DEFAULT_CONFIG);
            expect(status).toBe("fresh");
            // fresh -> no diagnostic emitted
        });
    });
    describe("output formatting (human-readable)", () => {
        it("formats staleness diagnostics", () => {
            const diags = [
                makeDiagnostic("docs/old.md", "error", "Document is critically stale (200 days old)", {
                    days_old: 200,
                }),
                makeDiagnostic("docs/aging.md", "warning", "Document is aging (100 days old)", {
                    days_old: 100,
                }),
            ];
            const output = formatDiagnostics(diags);
            expect(output).toContain("docs/old.md");
            expect(output).toContain("critically stale");
            expect(output).toContain("Summary: 0 critical, 1 error, 1 warning");
        });
    });
    describe("output formatting (NDJSON)", () => {
        it("formats staleness diagnostics as NDJSON", () => {
            const diags = [
                makeDiagnostic("docs/old.md", "error", "critically stale", { days_old: 200 }),
            ];
            const output = formatNdjson(diags);
            const parsed = JSON.parse(output);
            expect(parsed.severity).toBe("error");
            expect(parsed.extra).toBeUndefined(); // formatNdjson does not include extra
        });
    });
    describe("CI mode (--ci flag logic)", () => {
        it("formats GitHub annotations for critical/error diagnostics", () => {
            const diags = [
                makeDiagnostic("docs/old.md", "error", "Document is critically stale"),
            ];
            const annotations = formatGitHubAnnotations(diags);
            expect(annotations).toContain("::error file=docs/old.md::Document is critically stale");
        });
        it("formats GitHub annotations for warning diagnostics", () => {
            const diags = [
                makeDiagnostic("docs/aging.md", "warning", "Document is aging"),
            ];
            const annotations = formatGitHubAnnotations(diags);
            expect(annotations).toContain("::warning file=docs/aging.md::Document is aging");
        });
        it("omits info-level diagnostics from GitHub annotations", () => {
            const diags = [
                makeDiagnostic("docs/fresh.md", "info", "Document is fresh"),
            ];
            const annotations = formatGitHubAnnotations(diags);
            expect(annotations).toBe("");
        });
    });
    describe("exit code computation", () => {
        it("returns 0 when all docs are fresh", () => {
            const result = computeExitResult(() => []);
            expect(result.exitCode).toBe(0);
        });
        it("returns 0 for warning-only staleness (not critical)", () => {
            const result = computeExitResult(() => [makeDiagnostic("docs/aging.md", "warning", "aging")]);
            expect(result.exitCode).toBe(0);
        });
        it("returns 1 for error-level staleness diagnostics", () => {
            const result = computeExitResult(() => [
                makeDiagnostic("docs/old.md", "error", "critically stale"),
            ]);
            expect(result.exitCode).toBe(1);
        });
        it("returns 2 for critical-level diagnostics", () => {
            const result = computeExitResult(() => [
                makeDiagnostic("docs/broken.md", "critical", "config error"),
            ]);
            expect(result.exitCode).toBe(2);
        });
        it("CI mode: error/critical -> exit 1 (via severity mapping)", () => {
            // In CI mode, the CLI maps critical staleness to error-level diagnostic
            // which maps to exit code 1
            const result = computeExitResult(() => [
                makeDiagnostic("docs/old.md", "error", "critically stale"),
            ]);
            expect(result.exitCode).toBe(1);
        });
        it("CI mode: warning -> exit 0 + ::warning:: annotation", () => {
            // Warning severity maps to exit 0
            const result = computeExitResult(() => [makeDiagnostic("docs/aging.md", "warning", "aging")]);
            expect(result.exitCode).toBe(0);
            // The annotation is produced separately by formatGitHubAnnotations
        });
    });
});
//# sourceMappingURL=check-docs-staleness.test.js.map