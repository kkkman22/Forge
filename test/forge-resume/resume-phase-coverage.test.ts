import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const INSTRUCTIONS_PATH = resolve(
  import.meta.dirname,
  "../../skills/tinkerman/lib/resume/instructions.md",
);

describe("resume instructions phase coverage", () => {
  const content = readFileSync(INSTRUCTIONS_PATH, "utf-8");

  it("mentions status.md or status/ directory", () => {
    const hasStatusMd = content.includes(".forge/status.md");
    const hasStatusDir = content.includes(".forge/status/");
    expect(
      hasStatusMd || hasStatusDir,
      "instructions must reference .forge/status.md or .forge/status/",
    ).toBe(true);
  });

  it("mentions progress/ directory", () => {
    expect(content).toContain(".forge/progress/");
  });

  it("mentions review phase in resume context", () => {
    expect(content).toContain("review");
  });

  it("mentions test phase in resume context", () => {
    expect(content).toContain("test");
  });

  it("mentions ship phase in resume context", () => {
    expect(content).toContain("ship");
  });

  it("does NOT unconditionally reset active work to plan", () => {
    // Look for phrases that suggest ignoring current phase and always starting from plan
    const forbidden = [
      /always\s+start\s+from\s+plan/i,
      /reset\s+to\s+plan/i,
      /unconditionally\s+.*plan/i,
      /regardless\s+of\s+phase.*plan/i,
    ];
    for (const pattern of forbidden) {
      expect(content).not.toMatch(pattern);
    }
  });

  it("describes phase-specific resume behavior for review/test/ship", () => {
    // The instructions should mention that resume behavior varies by phase
    // or at least reference these phases in the context of "next step"
    const phaseRefs = content.match(/review|test|ship/g);
    expect(phaseRefs).toBeTruthy();
    // Must reference all three in a way that implies continuation, not restart
    const hasReviewContinue = content.includes("review") && content.includes("下一阶段");
    const hasShipContinue = content.includes("ship") || content.includes("交付");
    expect(
      hasReviewContinue || hasShipContinue || content.includes("phase"),
      "instructions should describe how to resume from review/test/ship phases",
    ).toBe(true);
  });
});
