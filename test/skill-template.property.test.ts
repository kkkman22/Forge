import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { validateSkillTemplate } from "../src/skill-template.js";

const REQUIRED_SECTIONS = ["Prerequisites", "Deliverable"];

function validTemplate(): string {
  return [
    "---",
    "name: forge-example",
    'description: "Build something useful. Use when you need to build."',
    "disable-model-invocation: true",
    "---",
    "",
    "# /tinkerman example — Example",
    "",
    "## 1. Overview",
    "Some overview.",
    "",
    "## 2. Prerequisites",
    "Some prereqs.",
    "",
    "## 3. Workflow",
    "Some workflow.",
    "",
    "## 4. Deliverable",
    "**Category**: execution",
    "- **Changed Files**: src/x.ts",
  ].join("\n");
}

describe("validateSkillTemplate — property", () => {
  it("never throws for any content", () => {
    fc.assert(
      fc.property(fc.string(), (content) => {
        expect(() => validateSkillTemplate("test.md", content, REQUIRED_SECTIONS)).not.toThrow();
      }),
    );
  });

  it("missingSections is always subset of requiredSections", () => {
    fc.assert(
      fc.property(fc.string(), (content) => {
        const result = validateSkillTemplate("test.md", content, REQUIRED_SECTIONS);
        for (const missing of result.missingSections) {
          expect(REQUIRED_SECTIONS).toContain(missing);
        }
      }),
    );
  });

  it("stable output for same input", () => {
    fc.assert(
      fc.property(fc.string(), (content) => {
        const a = validateSkillTemplate("test.md", content, REQUIRED_SECTIONS);
        const b = validateSkillTemplate("test.md", content, REQUIRED_SECTIONS);
        expect(a).toEqual(b);
      }),
    );
  });
});

describe("validateSkillTemplate — unit", () => {
  it("returns valid for template with all required sections", () => {
    const result = validateSkillTemplate("test.md", validTemplate(), REQUIRED_SECTIONS);
    expect(result.valid).toBe(true);
    expect(result.missingSections).toEqual([]);
  });

  it("returns invalid when Prerequisites missing", () => {
    const doc = validTemplate().replace("## 2. Prerequisites", "## 2. Something Else");
    const result = validateSkillTemplate("test.md", doc, REQUIRED_SECTIONS);
    expect(result.valid).toBe(false);
    expect(result.missingSections).toContain("Prerequisites");
  });

  it("returns invalid when Deliverable missing", () => {
    const doc = validTemplate().replace("## 4. Deliverable", "## 4. Something Else");
    const result = validateSkillTemplate("test.md", doc, REQUIRED_SECTIONS);
    expect(result.valid).toBe(false);
    expect(result.missingSections).toContain("Deliverable");
  });

  it("returns invalid for empty content", () => {
    const result = validateSkillTemplate("test.md", "", REQUIRED_SECTIONS);
    expect(result.valid).toBe(false);
  });
});
