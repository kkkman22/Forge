/**
 * Property 4: 决策文档路径格式
 *
 * Uses fast-check to generate date and topic strings, verifying that the output
 * path strictly matches `.tinkerman/decisions/<YYYY-MM-DD>-<topic>.md`.
 *
 * **Validates: Requirements 2.6**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { generateDecisionPath, toKebabCase } from "../src/decide.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Generate a valid YYYY-MM-DD date string with realistic ranges. */
const dateArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.integer({ min: 2000, max: 2099 }), // year
    fc.integer({ min: 1, max: 12 }), // month
    fc.integer({ min: 1, max: 31 }), // day
  )
  .map(([y, m, d]) => {
    const mm = String(m).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    return `${y}-${mm}-${dd}`;
  });

/** Characters that may appear in a topic string (mixed case, digits, specials). */
const TOPIC_CHARS = [
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
  "g",
  "h",
  "i",
  "j",
  "k",
  "l",
  "m",
  "n",
  "o",
  "p",
  "q",
  "r",
  "s",
  "t",
  "u",
  "v",
  "w",
  "x",
  "y",
  "z",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  " ",
  "-",
  "_",
  ".",
  "!",
  "@",
  "#",
  "$",
] as const;

/** Alphanumeric characters only — guaranteed to survive kebab-case conversion. */
const ALNUM_CHARS = [
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
  "g",
  "h",
  "i",
  "j",
  "k",
  "l",
  "m",
  "n",
  "o",
  "p",
  "q",
  "r",
  "s",
  "t",
  "u",
  "v",
  "w",
  "x",
  "y",
  "z",
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
] as const;

/**
 * Generate a non-empty topic string that contains at least one alphanumeric
 * character so the kebab-case result is never empty.
 */
const topicArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.array(fc.constantFrom(...TOPIC_CHARS), { minLength: 0, maxLength: 30 }),
    fc.constantFrom(...ALNUM_CHARS),
    fc.array(fc.constantFrom(...TOPIC_CHARS), { minLength: 0, maxLength: 30 }),
  )
  .map(([prefix, required, suffix]) => [...prefix, required, ...suffix].join(""));

// ---------------------------------------------------------------------------
// Regex for full path validation
// ---------------------------------------------------------------------------

/** Full path must match: .tinkerman/decisions/YYYY-MM-DD-<kebab-topic>.md */
const PATH_REGEX = /^\.tinkerman\/decisions\/\d{4}-\d{2}-\d{2}-.+\.md$/;

/** Kebab-case: only lowercase letters, digits, and hyphens; no leading/trailing hyphens. */
const KEBAB_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe("Property 4: 决策文档路径格式", () => {
  it("output path matches .tinkerman/decisions/<YYYY-MM-DD>-<topic>.md (Req 2.6)", () => {
    fc.assert(
      fc.property(dateArb, topicArb, (date, topic) => {
        const path = generateDecisionPath(date, topic);
        expect(path).toMatch(PATH_REGEX);
      }),
      { numRuns: 50 },
    );
  });

  it("date portion is valid: year 2000-2099, month 01-12, day 01-31", () => {
    fc.assert(
      fc.property(dateArb, topicArb, (date, topic) => {
        const path = generateDecisionPath(date, topic);

        // Extract the date portion from the path
        // Path format: .tinkerman/decisions/YYYY-MM-DD-<topic>.md
        const afterPrefix = path.replace(".tinkerman/decisions/", "");
        const datePart = afterPrefix.substring(0, 10); // YYYY-MM-DD

        const [yearStr, monthStr, dayStr] = datePart.split("-");
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10);
        const day = parseInt(dayStr, 10);

        expect(year).toBeGreaterThanOrEqual(2000);
        expect(year).toBeLessThanOrEqual(2099);
        expect(month).toBeGreaterThanOrEqual(1);
        expect(month).toBeLessThanOrEqual(12);
        expect(day).toBeGreaterThanOrEqual(1);
        expect(day).toBeLessThanOrEqual(31);
      }),
      { numRuns: 50 },
    );
  });

  it("topic portion is kebab-case: lowercase, no spaces, no special chars except hyphens", () => {
    fc.assert(
      fc.property(dateArb, topicArb, (date, topic) => {
        const path = generateDecisionPath(date, topic);

        // Extract the topic portion from the path
        // Path format: .tinkerman/decisions/YYYY-MM-DD-<topic>.md
        const afterPrefix = path.replace(".tinkerman/decisions/", "");
        // Remove the date (10 chars) and the separator hyphen (1 char)
        const topicWithExt = afterPrefix.substring(11);
        // Remove .md extension
        const topicPart = topicWithExt.replace(/\.md$/, "");

        expect(topicPart).toMatch(KEBAB_REGEX);
      }),
      { numRuns: 50 },
    );
  });

  it("path always starts with .tinkerman/decisions/ and ends with .md", () => {
    fc.assert(
      fc.property(dateArb, topicArb, (date, topic) => {
        const path = generateDecisionPath(date, topic);

        expect(path.startsWith(".tinkerman/decisions/")).toBe(true);
        expect(path.endsWith(".md")).toBe(true);
      }),
      { numRuns: 50 },
    );
  });

  it("toKebabCase produces only lowercase alphanumeric and hyphens", () => {
    fc.assert(
      fc.property(topicArb, (topic) => {
        const kebab = toKebabCase(topic);

        // Must match kebab-case pattern
        expect(kebab).toMatch(KEBAB_REGEX);

        // Must not contain uppercase
        expect(kebab).toBe(kebab.toLowerCase());

        // Must not contain spaces
        expect(kebab).not.toContain(" ");

        // Must not start or end with hyphen
        expect(kebab.startsWith("-")).toBe(false);
        expect(kebab.endsWith("-")).toBe(false);

        // Must not contain consecutive hyphens
        expect(kebab).not.toContain("--");
      }),
      { numRuns: 50 },
    );
  });
});
