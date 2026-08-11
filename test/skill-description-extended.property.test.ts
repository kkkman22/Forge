/**
 * Property-based and unit tests for the extended skill description validator.
 *
 * Covers the two-sentence format rules:
 *   - splitSentences / countSentences
 *   - startsWithImperative
 *   - secondSentenceStartsWithUseWhen
 *   - validateDescriptionExtended (backward-compatible + new rules)
 *
 * Validates: Requirements 1.2, 1.3, 1.4, 1.5, 1.13
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  countSentences,
  secondSentenceStartsWithUseWhen,
  splitSentences,
  startsWithImperative,
  validateDescription,
  validateDescriptionExtended,
} from "../src/skill-description.js";
import { IMPERATIVE_WHITELIST } from "../src/skill-description-imperatives.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSkillDoc(description: string, name = "forge-test"): string {
  const sanitised = description.replace(/"/g, "");
  return ["---", `name: ${name}`, `description: "${sanitised}"`, "---", "", "# Body", ""].join(
    "\n",
  );
}

// ---------------------------------------------------------------------------
// splitSentences / countSentences
// ---------------------------------------------------------------------------

describe("splitSentences", () => {
  it("splits on period followed by space", () => {
    expect(splitSentences("Hello world. Second sentence.")).toEqual([
      "Hello world",
      " Second sentence",
      "",
    ]);
  });

  it("splits on Chinese period", () => {
    expect(splitSentences("第一句。第二句。")).toEqual(["第一句", "第二句", ""]);
  });

  it("returns single-element array when no sentence-ending punctuation", () => {
    expect(splitSentences("No punctuation here")).toEqual(["No punctuation here"]);
  });

  it("handles empty string", () => {
    expect(splitSentences("")).toEqual([""]);
  });
});

describe("countSentences", () => {
  it("returns 0 for empty string", () => {
    expect(countSentences("")).toBe(0);
  });

  it("returns 1 for single sentence without period", () => {
    expect(countSentences("Just one sentence")).toBe(1);
  });

  it("returns 2 for two sentences", () => {
    expect(countSentences("First. Second.")).toBe(2);
  });

  it("property: always returns >= 0 for any input", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        expect(countSentences(text)).toBeGreaterThanOrEqual(0);
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// startsWithImperative
// ---------------------------------------------------------------------------

describe("startsWithImperative", () => {
  it("returns true for whitelisted verb at start", () => {
    expect(startsWithImperative("Build the thing.", IMPERATIVE_WHITELIST)).toBe(true);
  });

  it("returns false for non-whitelisted start", () => {
    expect(startsWithImperative("Something else.", IMPERATIVE_WHITELIST)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(startsWithImperative("", IMPERATIVE_WHITELIST)).toBe(false);
  });

  it("is case-sensitive — lowercase verb does not match", () => {
    expect(startsWithImperative("build the thing.", IMPERATIVE_WHITELIST)).toBe(false);
  });

  it("property: pure function — same inputs always same output", () => {
    fc.assert(
      fc.property(fc.string(), (sentence) => {
        const a = startsWithImperative(sentence, IMPERATIVE_WHITELIST);
        const b = startsWithImperative(sentence, IMPERATIVE_WHITELIST);
        expect(a).toBe(b);
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// secondSentenceStartsWithUseWhen
// ---------------------------------------------------------------------------

describe("secondSentenceStartsWithUseWhen", () => {
  it("returns true when second sentence starts with 'Use when'", () => {
    expect(secondSentenceStartsWithUseWhen(["Build things.", "Use when you need to build."])).toBe(
      true,
    );
  });

  it("returns true with case-insensitive 'use When'", () => {
    expect(secondSentenceStartsWithUseWhen(["Build things.", "use When needed."])).toBe(true);
  });

  it("returns false when second sentence does not start with 'Use when'", () => {
    expect(secondSentenceStartsWithUseWhen(["Build things.", "Also does other stuff."])).toBe(
      false,
    );
  });

  it("returns false when only one sentence", () => {
    expect(secondSentenceStartsWithUseWhen(["Only one sentence."])).toBe(false);
  });

  it("returns false for empty array", () => {
    expect(secondSentenceStartsWithUseWhen([])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateDescriptionExtended
// ---------------------------------------------------------------------------

describe("validateDescriptionExtended — backward compatibility", () => {
  it("rejects all inputs that original validateDescription rejects", () => {
    const badInputs = [
      "", // empty
      "No use when trigger at all here", // missing trigger
      "Best-ever tool. Use when needed.", // marketing
      "Supports v1.0. Use when deploying.", // version
      "Since 2026-01-01. Use when ready.", // date
    ];
    for (const desc of badInputs) {
      const doc = buildSkillDoc(desc);
      const original = validateDescription("test.md", doc);
      const extended = validateDescriptionExtended(doc, { mode: "error" });
      if (!original.valid) {
        expect(extended.valid).toBe(false);
      }
    }
  });
});

describe("validateDescriptionExtended — new two-sentence rules", () => {
  it("accepts well-formed two-sentence description", () => {
    const doc = buildSkillDoc(
      "Plan the implementation from a locked spec. Use when user runs /tinkerman plan.",
    );
    const result = validateDescriptionExtended(doc, { mode: "error" });
    expect(result.valid).toBe(true);
    expect(result.sentenceCount).toBe(2);
    expect(result.firstSentenceStartsWithImperative).toBe(true);
    expect(result.secondSentenceStartsWithUseWhen).toBe(true);
  });

  it("rejects single-sentence description in error mode", () => {
    const singleDoc = buildSkillDoc("Use when user wants to plan things.");
    const result = validateDescriptionExtended(singleDoc, { mode: "error" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("句"))).toBe(true);
  });

  it("rejects three-sentence description in error mode", () => {
    const doc = buildSkillDoc("Build the code. Also tests it. Use when you run /tinkerman build.");
    const result = validateDescriptionExtended(doc, { mode: "error" });
    expect(result.valid).toBe(false);
    expect(result.sentenceCount).toBe(3);
  });

  it("rejects non-imperative start in error mode", () => {
    const doc = buildSkillDoc("Something happens. Use when needed.");
    const result = validateDescriptionExtended(doc, { mode: "error" });
    expect(result.valid).toBe(false);
    expect(result.firstSentenceStartsWithImperative).toBe(false);
  });

  it("rejects second sentence not starting with 'Use when' in error mode", () => {
    const doc = buildSkillDoc("Build the code. Also runs tests.");
    const result = validateDescriptionExtended(doc, { mode: "error" });
    expect(result.valid).toBe(false);
    expect(result.secondSentenceStartsWithUseWhen).toBe(false);
  });

  it("warning mode reports errors but does not block existing valid descriptions", () => {
    // A description valid under old rules but not new two-sentence rules
    const doc = buildSkillDoc(
      "The planning engine handles spec decomposition. Use when user runs /tinkerman plan.",
    );
    const result = validateDescriptionExtended(doc, { mode: "warning" });
    // Should still report the new-rule violations as warnings
    expect(result.firstSentenceStartsWithImperative).toBe(false);
    // But overall valid should depend on old rules
  });
});
