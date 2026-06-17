/**
 * Tests for FailureClass parsing — conservative default + three-state parsing.
 *
 * Pins dynamic-replan-loop R1: parseFailureClass must never throw and must
 * default to "fixable_bug" when the field is missing or unrecognized
 * (conservative — avoids false-positive replan triggers, D4).
 *
 * **Pins: dynamic-replan-loop R1-AC4 (conservative default).**
 */

import { describe, expect, it } from "vitest";
import { type FailureClass, parseFailureClass } from "../src/debug.js";

describe("parseFailureClass — conservative default [R1-AC4]", () => {
  it("returns fixable_bug when input is undefined", () => {
    expect(parseFailureClass(undefined)).toBe<FailureClass>("fixable_bug");
  });

  it("returns fixable_bug when input is empty string", () => {
    expect(parseFailureClass("")).toBe<FailureClass>("fixable_bug");
  });

  it("returns fixable_bug when input is unrecognized value", () => {
    expect(parseFailureClass("not-a-class")).toBe<FailureClass>("fixable_bug");
    expect(parseFailureClass("BUG")).toBe<FailureClass>("fixable_bug");
    expect(parseFailureClass("assumption")).toBe<FailureClass>("fixable_bug");
  });

  it("returns fixable_bug when input is whitespace", () => {
    expect(parseFailureClass("   ")).toBe<FailureClass>("fixable_bug");
  });
});

describe("parseFailureClass — three-state parsing [R1-AC1]", () => {
  it("parses fixable_bug exactly", () => {
    expect(parseFailureClass("fixable_bug")).toBe<FailureClass>("fixable_bug");
  });

  it("parses assumption_invalidated exactly", () => {
    expect(parseFailureClass("assumption_invalidated")).toBe<FailureClass>(
      "assumption_invalidated",
    );
  });

  it("parses environmental exactly", () => {
    expect(parseFailureClass("environmental")).toBe<FailureClass>("environmental");
  });

  it("trims surrounding whitespace before matching", () => {
    expect(parseFailureClass("  assumption_invalidated  ")).toBe<FailureClass>(
      "assumption_invalidated",
    );
  });
});
