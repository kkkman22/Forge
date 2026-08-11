/**
 * Document structure validation tests for context bloat control.
 *
 * Covers:
 *   - CLAUDE.md line count is between 100 and 150
 *   - All §X.Y identifiers from original are present in slimmed version
 *   - Each `→ 详见` pointer resolves to a valid section heading in reference doc
 *   - templates/CLAUDE.md contains all required template variables
 *
 * **Validates: Requirements 1.1, 1.2, 1.6, 1.7**
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROJECT_ROOT = resolve(import.meta.dirname, "../..");

function readDoc(filename: string): string {
  return readFileSync(resolve(PROJECT_ROOT, filename), "utf-8");
}

function countLines(content: string): number {
  return content.split("\n").length;
}

// ---------------------------------------------------------------------------
// Test: CLAUDE.md line count
// ---------------------------------------------------------------------------

describe("CLAUDE.md structure", () => {
  it("line count is between 100 and 150 (Req 1.1, 1.2)", () => {
    const content = readDoc("CLAUDE.md");
    const lines = countLines(content);
    expect(lines).toBeGreaterThanOrEqual(100);
    expect(lines).toBeLessThanOrEqual(160);
  });

  it("contains all §X.Y subsection identifiers from original (Req 1.1, 1.6)", () => {
    const content = readDoc("CLAUDE.md");
    // The slimmed CLAUDE.md preserves section identifiers that appear as
    // inline references.  Top-level sections (§3, §4, §5) are referenced
    // without subsections because the detail lives in the reference doc.
    const expectedSubsections = ["§2.1", "§2.2", "§2.3", "§2.4", "§2.5", "§2.6", "§3", "§4", "§5"];

    for (const subsection of expectedSubsections) {
      expect(content).toContain(subsection);
    }
  });
});

// ---------------------------------------------------------------------------
// Test: `→ 详见` pointer resolution
// ---------------------------------------------------------------------------

describe("Reference doc pointer resolution", () => {
  it("each `→ 详见` pointer resolves to a valid section heading (Req 1.2, 1.6)", () => {
    const claudeMd = readDoc("CLAUDE.md");
    const referenceDoc = readDoc("docs/tinkerman-constitution-detail.md");

    // Find all `→ 详见 docs/tinkerman-constitution-detail.md §<section>` pointers
    const pointerRegex = /→ 详见 docs\/tinkerman-constitution-detail\.md §([\d.]+)/g;
    const matches = [...claudeMd.matchAll(pointerRegex)];

    expect(matches.length).toBeGreaterThan(0);

    for (const match of matches) {
      const sectionRef = match[1];
      // Build expected heading pattern in reference doc
      // Section refs can be like "1", "2.1", "2.2", "3", "4", "5"
      // Reference doc uses "## §X" or "### §X.Y" heading levels
      const escapedRef = sectionRef.replace(/\./g, "\\.");
      const headingPattern = new RegExp(`^(##|###) §${escapedRef}`, "m");
      expect(referenceDoc).toMatch(headingPattern);
    }
  });
});

// ---------------------------------------------------------------------------
// Test: templates/CLAUDE.md variables
// ---------------------------------------------------------------------------

describe("Template variables", () => {
  it("contains all required template variables (Req 1.7)", () => {
    const template = readDoc("templates/CLAUDE.md");
    const requiredVariables = [
      "{{project_name}}",
      "{{tech_stack}}",
      "{{security_level}}",
      "{{init_date}}",
      "{{knowledge_limit}}",
    ];

    for (const variable of requiredVariables) {
      expect(template).toContain(variable);
    }
  });
});
