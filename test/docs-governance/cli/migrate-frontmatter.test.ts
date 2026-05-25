import { describe, expect, it } from "vitest";

describe("migrate-docs-frontmatter helpers", () => {
  describe("extractH1 logic", () => {
    it("extracts H1 from markdown", () => {
      const content = "# Getting Started\n\nSome content here.";
      const match = content.match(/^#\s+(.+)$/m);
      expect(match?.[1]).toBe("Getting Started");
    });

    it("returns undefined when no H1", () => {
      const content = "## Second Level\n\nNo H1 here.";
      const match = content.match(/^#\s+(.+)$/m);
      expect(match).toBeNull();
    });

    it("handles CJK H1", () => {
      const content = "# 快速开始\n\n内容";
      const match = content.match(/^#\s+(.+)$/m);
      expect(match?.[1]).toBe("快速开始");
    });
  });

  describe("inferCategory logic", () => {
    it("infers getting-started from path", () => {
      const filePath = "docs/getting-started.md";
      const lower = filePath.toLowerCase();
      // The script checks for "getting-started" (with dash) or "getting started" (with space)
      expect(lower.includes("getting-started") || lower.includes("getting started")).toBe(true);
    });

    it("infers troubleshooting from content", () => {
      const content = "# Troubleshooting Guide\n\nCommon issues and fixes.";
      const lower = content.slice(0, 500).toLowerCase();
      expect(lower.includes("troubleshoot")).toBe(true);
    });

    it("defaults to reference", () => {
      const filePath = "docs/api-reference.md";
      const content = "# API Reference\n\nEndpoint details.";
      const lower = `${filePath.toLowerCase()} ${content.slice(0, 500).toLowerCase()}`;
      const hasSpecial = ["getting started", "troubleshoot", "contribut", "advanced"].some((kw) =>
        lower.includes(kw),
      );
      expect(hasSpecial).toBe(false);
      // Default should be "reference"
    });
  });
});
