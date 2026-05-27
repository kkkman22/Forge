import { describe, expect, it } from "vitest";
import { checkBilingualPairs, pairBilingual } from "../../../src/docs-governance/bilingual.js";
import { computeExitResult } from "../../../src/docs-governance/cli/_runtime.js";
import {
  formatDiagnostics,
  formatNdjson,
} from "../../../src/docs-governance/reporter/diagnostic.js";
import type {
  DiagnosticRecord,
  Doc,
  DocPath,
  Frontmatter,
} from "../../../src/docs-governance/types.js";

// ── Helpers ──

const SCRIPT_NAME = "bilingual-checker";

function makeFm(overrides: Partial<Frontmatter> = {}): Frontmatter {
  return {
    title: "Test",
    category: "daily-use",
    audience: ["daily-developer"],
    updated: "2026-05-20",
    owner: "test",
    ...overrides,
  };
}

function makeDoc(path: string, fm?: Partial<Frontmatter>): Doc {
  return {
    path: path as DocPath,
    domain: "A",
    frontmatter: makeFm(fm),
    bodyHash: "abc123",
  };
}

// ── Tests ──

describe("check-docs-bilingual CLI logic", () => {
  describe("pairBilingual", () => {
    it("pairs CN and EN docs with matching slugs", () => {
      const docs: Doc[] = [
        makeDoc("docs/guide.md"),
        makeDoc("docs/guide.en.md", { mirror_of: "guide.md" }),
      ];
      const pairs = pairBilingual(docs);
      expect(pairs).toHaveLength(1);
      expect(pairs[0].state).toBe("paired");
      expect(pairs[0].slug).toBe("guide");
    });

    it("identifies CN-only docs", () => {
      const docs: Doc[] = [makeDoc("docs/guide.md")];
      const pairs = pairBilingual(docs);
      expect(pairs).toHaveLength(1);
      expect(pairs[0].state).toBe("cn-only");
    });

    it("identifies EN-only docs (no mirror_of)", () => {
      const docs: Doc[] = [makeDoc("docs/guide.en.md")];
      const pairs = pairBilingual(docs);
      expect(pairs).toHaveLength(1);
      expect(pairs[0].state).toBe("en-only");
    });

    it("identifies orphan_mirror (EN with mirror_of but no CN)", () => {
      const docs: Doc[] = [makeDoc("docs/guide.en.md", { mirror_of: "guide.md" })];
      const pairs = pairBilingual(docs);
      expect(pairs).toHaveLength(1);
      expect(pairs[0].state).toBe("orphan_mirror");
    });

    it("groups docs in different directories separately", () => {
      const docs: Doc[] = [makeDoc("docs/a/guide.md"), makeDoc("docs/b/guide.md")];
      const pairs = pairBilingual(docs);
      expect(pairs).toHaveLength(2);
      expect(pairs.every((p) => p.state === "cn-only")).toBe(true);
    });
  });

  describe("checkBilingualPairs", () => {
    it("reports no diagnostics for valid paired docs", () => {
      const docs: Doc[] = [
        makeDoc("docs/guide.md"),
        makeDoc("docs/guide.en.md", { mirror_of: "guide.md" }),
      ];
      const pairs = pairBilingual(docs);
      const diags = checkBilingualPairs(pairs);
      expect(diags).toHaveLength(0);
    });

    it("reports no diagnostics for CN-only docs", () => {
      const docs: Doc[] = [makeDoc("docs/guide.md")];
      const pairs = pairBilingual(docs);
      const diags = checkBilingualPairs(pairs);
      expect(diags).toHaveLength(0);
    });

    it("reports orphan_mirror warning", () => {
      const docs: Doc[] = [makeDoc("docs/guide.en.md", { mirror_of: "guide.md" })];
      const pairs = pairBilingual(docs);
      const diags = checkBilingualPairs(pairs);
      expect(diags.length).toBeGreaterThan(0);
      expect(diags.some((d) => d.message.includes("orphan_mirror"))).toBe(true);
    });

    it("reports category mismatch between paired docs", () => {
      const docs: Doc[] = [
        makeDoc("docs/guide.md", { category: "daily-use" }),
        makeDoc("docs/guide.en.md", { category: "advanced", mirror_of: "guide.md" }),
      ];
      const pairs = pairBilingual(docs);
      const diags = checkBilingualPairs(pairs);
      expect(diags.some((d) => d.extra?.code === "category_mismatch")).toBe(true);
    });

    it("reports audience mismatch between paired docs", () => {
      const docs: Doc[] = [
        makeDoc("docs/guide.md", { audience: ["daily-developer"] }),
        makeDoc("docs/guide.en.md", { audience: ["advanced-user"], mirror_of: "guide.md" }),
      ];
      const pairs = pairBilingual(docs);
      const diags = checkBilingualPairs(pairs);
      expect(diags.some((d) => d.extra?.code === "audience_mismatch")).toBe(true);
    });

    it("reports mirror_drift when dates differ significantly", () => {
      const docs: Doc[] = [
        makeDoc("docs/guide.md", { updated: "2026-01-01" }),
        makeDoc("docs/guide.en.md", { updated: "2026-05-20", mirror_of: "guide.md" }),
      ];
      const pairs = pairBilingual(docs);
      const diags = checkBilingualPairs(pairs);
      expect(diags.some((d) => d.extra?.code === "mirror_drift")).toBe(true);
    });
  });

  describe("output formatting (human-readable)", () => {
    it("formats bilingual diagnostics", () => {
      const diags: DiagnosticRecord[] = [
        {
          script: SCRIPT_NAME,
          severity: "error",
          file: "docs/guide.en.md" as DocPath,
          message: "R12.8 category mismatch: EN=advanced, CN=daily-use",
          extra: { code: "category_mismatch" },
        },
      ];
      const output = formatDiagnostics(diags);
      expect(output).toContain("docs/guide.en.md");
      expect(output).toContain("category mismatch");
    });
  });

  describe("output formatting (NDJSON)", () => {
    it("formats bilingual diagnostics as NDJSON", () => {
      const diags: DiagnosticRecord[] = [
        {
          script: SCRIPT_NAME,
          severity: "warning",
          file: "docs/guide.en.md" as DocPath,
          message: "orphan_mirror",
        },
      ];
      const output = formatNdjson(diags);
      const parsed = JSON.parse(output);
      expect(parsed.script).toBe(SCRIPT_NAME);
      expect(parsed.severity).toBe("warning");
    });
  });

  describe("exit code computation", () => {
    it("returns 0 for no diagnostics (clean pairs)", () => {
      const result = computeExitResult(() => {
        const docs: Doc[] = [
          makeDoc("docs/guide.md"),
          makeDoc("docs/guide.en.md", { mirror_of: "guide.md" }),
        ];
        return checkBilingualPairs(pairBilingual(docs));
      });
      expect(result.exitCode).toBe(0);
    });

    it("returns 1 when category mismatch (error-level)", () => {
      const result = computeExitResult(() => {
        const docs: Doc[] = [
          makeDoc("docs/guide.md", { category: "daily-use" }),
          makeDoc("docs/guide.en.md", { category: "advanced", mirror_of: "guide.md" }),
        ];
        return checkBilingualPairs(pairBilingual(docs));
      });
      expect(result.exitCode).toBe(1);
    });

    it("returns 0 for warning-level issues (orphan_mirror)", () => {
      const result = computeExitResult(() => {
        const docs: Doc[] = [makeDoc("docs/guide.en.md", { mirror_of: "guide.md" })];
        return checkBilingualPairs(pairBilingual(docs));
      });
      expect(result.exitCode).toBe(0);
    });
  });
});
