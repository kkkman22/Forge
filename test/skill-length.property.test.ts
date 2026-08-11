/**
 * Unit and property-based tests for the skill length validator.
 *
 * Covers:
 *   - Unit tests for {@link countEffectiveLines} across known inputs
 *     (empty, single line, mixed blanks, CRLF).
 *   - Unit tests for {@link checkSkillLength} at, below, and above the
 *     budget, plus the `shared/` exemption branch.
 *   - Integration test for {@link validateAllSkillLengths} with an
 *     in-memory {@link SkillLengthFs} fixture that mixes exempt and
 *     non-exempt files.
 *   - Property: `countEffectiveLines` is invariant under inserting
 *     arbitrary numbers of blank lines between real lines.
 *
 * **Validates: Requirements 5.1, 5.5, 5.8**
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  checkSkillLength,
  countEffectiveLines,
  DEFAULT_LIMIT,
  type SkillLengthFs,
  validateAllSkillLengths,
} from "../src/skill-length.js";

// ---------------------------------------------------------------------------
// countEffectiveLines — unit
// ---------------------------------------------------------------------------

describe("countEffectiveLines", () => {
  it("returns 0 for empty content", () => {
    expect(countEffectiveLines("")).toBe(0);
  });

  it("counts a single non-empty line", () => {
    expect(countEffectiveLines("hello")).toBe(1);
  });

  it("counts a single non-empty line with trailing newline", () => {
    expect(countEffectiveLines("hello\n")).toBe(1);
  });

  it("ignores blank lines (empty string and whitespace-only)", () => {
    expect(countEffectiveLines("a\n\nb\n   \nc\n")).toBe(3);
  });

  it("returns 0 when the buffer contains only blank lines", () => {
    expect(countEffectiveLines("\n\n   \n\t\n")).toBe(0);
  });

  it("treats CRLF-terminated lines as non-empty when they carry content", () => {
    // split on "\n" leaves "\r" on the line which trim() collapses; a
    // line that was just "\r\n" collapses to an empty trim and is
    // excluded, which matches the spirit of "exclude blank lines".
    expect(countEffectiveLines("a\r\n\r\nb\r\n")).toBe(2);
  });

  it("counts every non-blank line in a representative SKILL.md skeleton", () => {
    const doc = [
      "---",
      "name: tinkerman-demo",
      'description: "Demo skill. Use when testing."',
      "---",
      "",
      "# Workflow",
      "",
      "Step 1: do things.",
      "",
    ].join("\n");
    // 4 frontmatter lines + 1 heading + 1 body line = 6.
    expect(countEffectiveLines(doc)).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// countEffectiveLines — property
// ---------------------------------------------------------------------------

describe("countEffectiveLines (property)", () => {
  /**
   * Inserting any number of blank separator lines between real lines
   * must not change the effective line count. This is the core
   * invariant that frees authors to format SKILL.md for readability.
   *
   * **Validates: Requirements 5.1**
   */
  it("is invariant under inserting blank separator lines", () => {
    fc.assert(
      fc.property(
        fc
          .array(
            // Real lines: non-empty strings without newlines or
            // whitespace-only content.
            fc
              .string({ unit: "grapheme-ascii", minLength: 1, maxLength: 20 })
              .filter((s) => !s.includes("\n") && s.trim() !== ""),
            { minLength: 1, maxLength: 10 },
          )
          .chain((realLines) =>
            fc
              .array(fc.integer({ min: 0, max: 3 }), {
                minLength: realLines.length + 1,
                maxLength: realLines.length + 1,
              })
              .map((blankCounts) => ({ realLines, blankCounts })),
          ),
        ({ realLines, blankCounts }) => {
          // Interleave: blankCounts[0] blanks, realLine[0], blankCounts[1] blanks, ...
          const parts: string[] = [];
          for (let i = 0; i < realLines.length; i++) {
            for (let b = 0; b < (blankCounts[i] ?? 0); b++) {
              parts.push("");
            }
            const line = realLines[i];
            if (line !== undefined) {
              parts.push(line);
            }
          }
          for (let b = 0; b < (blankCounts[realLines.length] ?? 0); b++) {
            parts.push("");
          }

          const content = parts.join("\n");
          expect(countEffectiveLines(content)).toBe(realLines.length);
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// checkSkillLength — unit
// ---------------------------------------------------------------------------

describe("checkSkillLength", () => {
  it("uses a default limit of 150", () => {
    const result = checkSkillLength("skills/tinkerman-x/SKILL.md", "line\n");
    expect(result.limit).toBe(DEFAULT_LIMIT);
    expect(DEFAULT_LIMIT).toBe(150);
  });

  it("marks a short, non-shared file as valid", () => {
    const content = "a\nb\nc\n";
    const result = checkSkillLength("skills/tinkerman-x/SKILL.md", content, 10);
    expect(result).toEqual({
      filePath: "skills/tinkerman-x/SKILL.md",
      lineCount: 3,
      effectiveLineCount: 3,
      limit: 10,
      exempt: false,
      valid: true,
    });
  });

  it("marks a file at the exact limit as valid", () => {
    const content = `${Array.from({ length: 5 }, (_, i) => `line${i}`).join("\n")}\n`;
    const result = checkSkillLength("skills/tinkerman-x/SKILL.md", content, 5);
    expect(result.effectiveLineCount).toBe(5);
    expect(result.valid).toBe(true);
  });

  it("marks a file over the limit as invalid", () => {
    const content = `${Array.from({ length: 6 }, (_, i) => `line${i}`).join("\n")}\n`;
    const result = checkSkillLength("skills/tinkerman-x/SKILL.md", content, 5);
    expect(result.effectiveLineCount).toBe(6);
    expect(result.valid).toBe(false);
  });

  it("exempts files under the shared/ directory even when long", () => {
    const content = `${Array.from({ length: 500 }, (_, i) => `line${i}`).join("\n")}\n`;
    const result = checkSkillLength("skills/shared/next-step-protocol.md", content, 10);
    expect(result.exempt).toBe(true);
    expect(result.valid).toBe(true);
    expect(result.effectiveLineCount).toBe(500);
  });

  it("exempts a file deeply nested inside a shared/ segment", () => {
    const content = "x\n";
    const result = checkSkillLength("skills/shared/sub/inner.md", content, 1);
    expect(result.exempt).toBe(true);
    expect(result.valid).toBe(true);
  });

  it("does not exempt a filename that merely contains the word 'shared'", () => {
    const content = `${Array.from({ length: 20 }, (_, i) => `line${i}`).join("\n")}\n`;
    const result = checkSkillLength("skills/tinkerman-shared-demo/SKILL.md", content, 10);
    expect(result.exempt).toBe(false);
    expect(result.valid).toBe(false);
  });

  it("handles Windows-style path separators when detecting shared/", () => {
    const content = "x\n";
    const result = checkSkillLength("skills\\shared\\next-step-protocol.md", content, 1);
    expect(result.exempt).toBe(true);
    expect(result.valid).toBe(true);
  });

  it("does not count blank separator lines toward the budget", () => {
    // 5 effective lines padded with many blanks; should fit a limit of 5.
    const content = "a\n\n\nb\n\nc\n\nd\n\ne\n";
    const result = checkSkillLength("skills/tinkerman-x/SKILL.md", content, 5);
    expect(result.effectiveLineCount).toBe(5);
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateAllSkillLengths — integration with fake fs
// ---------------------------------------------------------------------------

function createFakeFs(files: Record<string, string>): SkillLengthFs & {
  reads: string[];
} {
  const store = new Map(Object.entries(files));
  const reads: string[] = [];
  return {
    reads,
    listSkillMdFiles: (skillsDir: string) => {
      const prefix = `${skillsDir}/`;
      return [...store.keys()].filter((p) => p.startsWith(prefix) && p.endsWith(".md")).sort();
    },
    readFile: (p: string) => {
      reads.push(p);
      const c = store.get(p);
      if (c === undefined) throw new Error(`missing ${p}`);
      return c;
    },
  };
}

describe("validateAllSkillLengths", () => {
  it("checks every enumerated file and flags only non-exempt over-budget ones", () => {
    const short = "a\nb\nc\n";
    const long = `${Array.from({ length: 20 }, (_, i) => `line${i}`).join("\n")}\n`;
    const fs = createFakeFs({
      "skills/tinkerman-short/SKILL.md": short,
      "skills/tinkerman-long/SKILL.md": long,
      "skills/shared/next-step-protocol.md": long, // exempt despite being long
    });

    const results = validateAllSkillLengths(fs, "skills", 10);
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.filePath).sort()).toEqual(
      [
        "skills/shared/next-step-protocol.md",
        "skills/tinkerman-long/SKILL.md",
        "skills/tinkerman-short/SKILL.md",
      ].sort(),
    );

    const long1 = results.find((r) => r.filePath === "skills/tinkerman-long/SKILL.md");
    expect(long1?.valid).toBe(false);
    expect(long1?.exempt).toBe(false);
    expect(long1?.effectiveLineCount).toBe(20);

    const short1 = results.find((r) => r.filePath === "skills/tinkerman-short/SKILL.md");
    expect(short1?.valid).toBe(true);
    expect(short1?.effectiveLineCount).toBe(3);

    const shared = results.find((r) => r.filePath === "skills/shared/next-step-protocol.md");
    expect(shared?.exempt).toBe(true);
    expect(shared?.valid).toBe(true);
    expect(shared?.effectiveLineCount).toBe(20);

    expect([...fs.reads].sort()).toEqual(
      [
        "skills/shared/next-step-protocol.md",
        "skills/tinkerman-long/SKILL.md",
        "skills/tinkerman-short/SKILL.md",
      ].sort(),
    );
  });

  it("returns an empty array when no skill files exist", () => {
    const fs = createFakeFs({});
    expect(validateAllSkillLengths(fs, "skills")).toEqual([]);
  });

  it("uses the default limit when none is supplied", () => {
    // Build a file with exactly DEFAULT_LIMIT + 1 effective lines.
    const overBudget = `${Array.from({ length: DEFAULT_LIMIT + 1 }, (_, i) => `l${i}`).join("\n")}\n`;
    const atBudget = `${Array.from({ length: DEFAULT_LIMIT }, (_, i) => `l${i}`).join("\n")}\n`;
    const fs = createFakeFs({
      "skills/tinkerman-over/SKILL.md": overBudget,
      "skills/tinkerman-ok/SKILL.md": atBudget,
    });

    const results = validateAllSkillLengths(fs, "skills");
    const over = results.find((r) => r.filePath === "skills/tinkerman-over/SKILL.md");
    const ok = results.find((r) => r.filePath === "skills/tinkerman-ok/SKILL.md");
    expect(over?.limit).toBe(DEFAULT_LIMIT);
    expect(over?.valid).toBe(false);
    expect(ok?.valid).toBe(true);
  });
});
