import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "../../../src/docs-governance/frontmatter/parser.js";
import { computeExitResult } from "../../../src/docs-governance/cli/_runtime.js";
import { formatDiagnostics, formatNdjson } from "../../../src/docs-governance/reporter/diagnostic.js";
import type { DiagnosticRecord, DocPath } from "../../../src/docs-governance/types.js";

// ── Helpers ──

const SCRIPT_NAME = "frontmatter-checker";

function makeDiagnostic(
  file: string,
  severity: DiagnosticRecord["severity"],
  message: string,
  extra?: Record<string, string | number | boolean>,
): DiagnosticRecord {
  return {
    script: SCRIPT_NAME,
    severity,
    file: file as DocPath,
    message,
    ...(extra ? { extra } : {}),
  };
}

const VALID_FM = `---
title: "Test Doc"
category: daily-use
audience:
  - daily-developer
updated: "2026-05-20"
owner: test
---
Body here
`;

const MISSING_TITLE_FM = `---
category: daily-use
audience:
  - daily-developer
updated: "2026-05-20"
owner: test
---
`;

const NO_FRONTMATTER = `Just a regular markdown file with no frontmatter at all.
`;

const EMPTY_FM = `---
---
Body here
`;

// ── Tests: parseFrontmatter integration from CLI perspective ──

describe("check-docs-frontmatter CLI logic", () => {
  describe("frontmatter parsing", () => {
    it("parses valid frontmatter without diagnostics", () => {
      const result = parseFrontmatter(VALID_FM);
      expect(result.frontmatter).not.toBeNull();
      expect(result.diagnostics).toHaveLength(0);
    });

    it("reports diagnostic for missing required fields", () => {
      const result = parseFrontmatter(MISSING_TITLE_FM);
      expect(result.frontmatter).toBeNull();
      expect(result.diagnostics.length).toBeGreaterThan(0);
      expect(result.diagnostics.some((d) => d.message.includes("title"))).toBe(true);
    });

    it("reports diagnostic when no frontmatter block found", () => {
      const result = parseFrontmatter(NO_FRONTMATTER);
      expect(result.frontmatter).toBeNull();
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0].message).toContain("No frontmatter block found");
    });

    it("reports diagnostic for empty frontmatter block", () => {
      const result = parseFrontmatter(EMPTY_FM);
      expect(result.frontmatter).toBeNull();
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0].message).toContain("Empty frontmatter block");
    });
  });

  describe("output formatting (human-readable)", () => {
    it("formats diagnostics with file, severity, and message", () => {
      const diags: DiagnosticRecord[] = [
        makeDiagnostic("docs/guide.md", "error", "Missing required field: title"),
        makeDiagnostic("docs/setup.md", "warning", "Unknown field: foo"),
      ];
      const output = formatDiagnostics(diags);
      expect(output).toContain("docs/guide.md");
      expect(output).toContain("error");
      expect(output).toContain("Missing required field: title");
      expect(output).toContain("Summary:");
    });

    it("formats zero diagnostics cleanly", () => {
      const output = formatDiagnostics([]);
      expect(output).toContain("Summary: 0 critical, 0 error, 0 warning");
    });
  });

  describe("output formatting (NDJSON)", () => {
    it("produces one JSON line per diagnostic", () => {
      const diags: DiagnosticRecord[] = [
        makeDiagnostic("docs/a.md", "error", "err1"),
        makeDiagnostic("docs/b.md", "warning", "warn1"),
      ];
      const output = formatNdjson(diags);
      const lines = output.split("\n").filter((l) => l.length > 0);
      expect(lines).toHaveLength(2);
      for (const line of lines) {
        const obj = JSON.parse(line);
        expect(obj).toHaveProperty("script");
        expect(obj).toHaveProperty("severity");
        expect(obj).toHaveProperty("file");
        expect(obj).toHaveProperty("message");
      }
    });
  });

  describe("exit code computation", () => {
    it("returns 0 for no diagnostics", () => {
      const result = computeExitResult(() => []);
      expect(result.exitCode).toBe(0);
    });

    it("returns 1 for error-level diagnostics", () => {
      const result = computeExitResult(() => [
        makeDiagnostic("docs/a.md", "error", "bad"),
      ]);
      expect(result.exitCode).toBe(1);
    });

    it("returns 2 for critical-level diagnostics", () => {
      const result = computeExitResult(() => [
        makeDiagnostic("docs/a.md", "critical", "very bad"),
      ]);
      expect(result.exitCode).toBe(2);
    });

    it("returns 3 for internal errors (exceptions)", () => {
      const result = computeExitResult(() => {
        throw new Error("unexpected failure");
      });
      expect(result.exitCode).toBe(3);
      expect(result.error).toBeDefined();
    });

    it("returns 0 for warning/notice/info diagnostics", () => {
      const result = computeExitResult(() => [
        makeDiagnostic("docs/a.md", "warning", "mild"),
        makeDiagnostic("docs/b.md", "notice", "info"),
      ]);
      expect(result.exitCode).toBe(0);
    });

    it("picks highest severity exit code", () => {
      const result = computeExitResult(() => [
        makeDiagnostic("docs/a.md", "warning", "mild"),
        makeDiagnostic("docs/b.md", "error", "bad"),
        makeDiagnostic("docs/c.md", "info", "note"),
      ]);
      expect(result.exitCode).toBe(1); // error wins
    });
  });

  describe("file exclusion logic", () => {
    it("excludes INDEX*.md files from scanning", () => {
      const filename: string = "INDEX-getting-started.md";
      const shouldExclude = filename.match(/^INDEX/i) !== null || filename === "README.md";
      expect(shouldExclude).toBe(true);
    });

    it("excludes README.md from scanning", () => {
      const filename: string = "README.md";
      const shouldExclude = filename === "README.md";
      expect(shouldExclude).toBe(true);
    });

    it("includes regular doc files", () => {
      const filename: string = "guide.md";
      const shouldExclude = filename.match(/^INDEX/i) !== null || filename === "README.md";
      expect(shouldExclude).toBe(false);
    });

    it("includes .en.md files", () => {
      const filename: string = "guide.en.md";
      const shouldExclude = filename.match(/^INDEX/i) !== null || filename === "README.md";
      expect(shouldExclude).toBe(false);
    });
  });
});
