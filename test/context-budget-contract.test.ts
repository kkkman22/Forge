/**
 * Contract tests for context budget sections in SKILL documents.
 *
 * Validates:
 *   - forge-build/SKILL.md contains "Context Budget Management" section with correct trimmer references
 *   - forge-review/SKILL.md contains "Context Budget Management" section with Review_Summarizer
 *   - forge-decide/SKILL.md contains "Context Budget Management" section with Subagent_Summary_Protocol
 *   - Existing non-context-budget content is preserved in all SKILL documents
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");

const readSkill = (name: string) =>
  readFileSync(resolve(ROOT, "skills", name, "SKILL.md"), "utf-8");

const readSkillWithRefs = (name: string, ...refFiles: string[]) => {
  const main = readSkill(name);
  const refs = refFiles
    .map((f) => {
      const p = resolve(ROOT, "skills", name, "references", f);
      return existsSync(p) ? readFileSync(p, "utf-8") : "";
    })
    .join("\n");
  return main + "\n" + refs;
};

describe("Contract: forge-build/SKILL.md context budget section", () => {
  const content = readSkillWithRefs("forge-build", "context-budget.md");

  it("contains Context Budget Management heading", () => {
    expect(content).toContain("## Context Budget Management");
  });

  it("references Explore Agent hard limit (300 tokens)", () => {
    expect(content).toContain("Explore Agent");
    expect(content).toContain("300");
  });

  it("references test output hard limits (50/300 tokens)", () => {
    expect(content).toContain("50");
  });

  it("references Git diff/status hard limit (200 tokens)", () => {
    expect(content).toContain(">50 lines");
    expect(content).toContain("200");
  });

  it("references mandatory truncation language", () => {
    expect(content).toContain("MUST truncate");
  });

  it("preserves TDD rules (RED/GREEN/REFACTOR)", () => {
    expect(content).toContain("RED");
    expect(content).toContain("GREEN");
    expect(content).toContain("REFACTOR");
  });

  it("preserves Restatement Checkpoint section", () => {
    expect(content).toContain("Restatement Checkpoint");
  });

  it("preserves Closure-First probes", () => {
    expect(content).toContain("Closure-First");
  });
});

describe("Contract: forge-review/SKILL.md context budget section", () => {
  const content = readSkill("forge-review");

  it("contains Context Budget Management heading", () => {
    expect(content).toContain("## Context Budget Management");
  });

  it("references Review_Summarizer", () => {
    expect(content).toContain("Review_Summarizer");
  });

  it("references Write-and-discard retention", () => {
    expect(content).toContain("Write-and-discard");
  });

  it("preserves severity grading (P0/P1/P2/P3)", () => {
    expect(content).toContain("P0");
    expect(content).toContain("P1");
    expect(content).toContain("P2");
    expect(content).toContain("P3");
  });

  it("preserves three-layer review structure", () => {
    expect(content).toContain("spec-check");
    expect(content).toContain("quality-check");
    expect(content).toContain("security-check");
  });
});

describe("Contract: forge-decide/SKILL.md context budget section", () => {
  const content = readSkill("forge-decide");

  it("contains Context Budget Management heading", () => {
    expect(content).toContain("## Context Budget Management");
  });

  it("references Subagent_Summary_Protocol", () => {
    expect(content).toContain("Subagent_Summary_Protocol");
  });

  it("references Write-and-discard retention", () => {
    expect(content).toContain("Write-and-discard");
  });

  it("preserves four-viewpoint structure", () => {
    expect(content).toContain("product");
    expect(content).toContain("architect");
    expect(content).toContain("security");
  });

  it("preserves OWASP/STRIDE references", () => {
    expect(content).toContain("OWASP");
    expect(content).toContain("STRIDE");
  });
});
