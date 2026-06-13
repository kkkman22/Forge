import { describe, expect, it } from "vitest";
import {
  assignStableFindingIds,
  continueStableFindingIds,
  parseFindingIdNumber,
} from "../../src/review/stable-ids.js";
import type { ReviewFinding } from "../../src/review/types.js";

function finding(overrides: Partial<ReviewFinding> = {}): ReviewFinding {
  return {
    severity: "P2",
    confidence: 0.8,
    fixRoute: "manual",
    filePath: "src/a.ts",
    lineNumber: 10,
    description: "issue",
    suggestion: "fix it",
    reviewer: "quality-check",
    ...overrides,
  };
}

describe("assignStableFindingIds (ce-inspired R8.1/R8.2)", () => {
  it("assigns R-NNN ids zero-padded to 3 digits", () => {
    const stamped = assignStableFindingIds([finding(), finding(), finding()]);
    expect(stamped.map((s) => s.id)).toEqual(["R-001", "R-002", "R-003"]);
  });

  it("sorts severity DESC (P0 before P1 before P2 before P3)", () => {
    const stamped = assignStableFindingIds([
      finding({ severity: "P3", description: "p3" }),
      finding({ severity: "P0", description: "p0" }),
      finding({ severity: "P2", description: "p2" }),
    ]);
    expect(stamped.map((s) => s.finding.description)).toEqual(["p0", "p2", "p3"]);
    expect(stamped[0].id).toBe("R-001");
  });

  it("within same severity, confidence DESC (higher first)", () => {
    const stamped = assignStableFindingIds([
      finding({ severity: "P2", confidence: 0.5, description: "low" }),
      finding({ severity: "P2", confidence: 0.9, description: "high" }),
    ]);
    expect(stamped.map((s) => s.finding.description)).toEqual(["high", "low"]);
  });

  it("within same severity+confidence, filePath ASC then lineNumber ASC", () => {
    const stamped = assignStableFindingIds([
      finding({ filePath: "src/b.ts", lineNumber: 5, description: "b5" }),
      finding({ filePath: "src/a.ts", lineNumber: 20, description: "a20" }),
      finding({ filePath: "src/a.ts", lineNumber: 5, description: "a5" }),
    ]);
    expect(stamped.map((s) => s.finding.description)).toEqual(["a5", "a20", "b5"]);
  });

  it("does not mutate the input array (R8.3 stability — stamp is a copy)", () => {
    const input = [finding({ severity: "P1" }), finding({ severity: "P3" })];
    const inputBefore = input.map((f) => f.description);
    assignStableFindingIds(input);
    expect(input.map((f) => f.description)).toEqual(inputBefore);
  });
});

describe("parseFindingIdNumber", () => {
  it("extracts the numeric suffix", () => {
    expect(parseFindingIdNumber("R-001")).toBe(1);
    expect(parseFindingIdNumber("R-042")).toBe(42);
  });
  it("returns null for malformed ids", () => {
    expect(parseFindingIdNumber("F-001")).toBeNull();
    expect(parseFindingIdNumber("R-xx")).toBeNull();
    expect(parseFindingIdNumber("")).toBeNull();
  });
});

describe("continueStableFindingIds (R8.4 — re-review continuation)", () => {
  it("continues numbering from previous round max + 1", () => {
    const round1 = assignStableFindingIds([finding(), finding(), finding()]);
    expect(round1.map((s) => s.id)).toEqual(["R-001", "R-002", "R-003"]);
    const round2 = continueStableFindingIds(round1, [finding(), finding()]);
    expect(round2.map((s) => s.id)).toEqual(["R-004", "R-005"]);
  });

  it("starts at R-001 when there is no previous round", () => {
    const round = continueStableFindingIds([], [finding()]);
    expect(round[0].id).toBe("R-001");
  });
});
