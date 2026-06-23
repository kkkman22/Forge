import { describe, expect, it } from "vitest";
import {
  DEFAULT_FAIL_THRESHOLD,
  DEFAULT_WARN_THRESHOLD,
  jaccard,
  neutralizeEntities,
  shingles,
  stripFrontmatter,
  tokenize,
} from "../src/agent-originality.js";

describe("stripFrontmatter", () => {
  it("strips leading YAML frontmatter block", () => {
    const input = "---\nname: foo\ndescription: bar\n---\n# Body\ncontent";
    expect(stripFrontmatter(input)).toBe("\n# Body\ncontent");
  });

  it("returns input unchanged when no frontmatter", () => {
    const input = "# Body only";
    expect(stripFrontmatter(input)).toBe("# Body only");
  });
});

describe("tokenize", () => {
  it("splits into lowercase alphanumeric tokens", () => {
    expect(tokenize("Hello, World! 123")).toEqual(["hello", "world", "123"]);
  });

  it("collapses non-alphanumeric to spaces", () => {
    expect(tokenize("foo-bar_baz.qux")).toEqual(["foo", "bar", "baz", "qux"]);
  });
});

describe("neutralizeEntities", () => {
  it("replaces known entity strings with placeholder", () => {
    const result = neutralizeEntities(
      "spec-check uses Read and Grep tools",
      new Set(["spec-check", "read", "grep"]),
    );
    expect(result).not.toContain("spec-check");
    expect(result).not.toContain("read");
    expect(result).not.toContain("grep");
  });

  it("is case-insensitive", () => {
    const result = neutralizeEntities("SPEC-CHECK and Spec-Check", new Set(["spec-check"]));
    expect(result).not.toMatch(/spec-check/i);
  });

  it("returns input unchanged when no entities match", () => {
    expect(neutralizeEntities("hello world", new Set(["foo"]))).toBe("hello world");
  });
});

describe("shingles", () => {
  it("produces 8-word shingles", () => {
    const words = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
    const s = shingles(words, 8);
    // 10 words → 3 shingles (indices 0-7, 1-8, 2-9)
    expect(s.size).toBe(3);
    expect([...s][0]).toBe("a b c d e f g h");
    expect([...s][2]).toBe("c d e f g h i j");
  });

  it("returns empty set for fewer than k words", () => {
    expect(shingles(["a", "b", "c"], 8).size).toBe(0);
  });

  it("returns single shingle when exactly k words", () => {
    const s = shingles(["a", "b", "c", "d"], 4);
    expect(s.size).toBe(1);
    expect([...s][0]).toBe("a b c d");
  });
});

describe("jaccard", () => {
  it("returns 1.0 for identical sets", () => {
    const s = new Set(["a", "b", "c"]);
    expect(jaccard(s, s)).toBe(1);
  });

  it("returns 0.0 for disjoint sets", () => {
    expect(jaccard(new Set(["a"]), new Set(["b"]))).toBe(0);
  });

  it("returns 0.5 for half overlap (1 of 2 union)", () => {
    // intersection {b} = 1, union {a,b,c} = 3 → 1/3
    const a = new Set(["a", "b"]);
    const b = new Set(["b", "c"]);
    expect(jaccard(a, b)).toBeCloseTo(1 / 3, 5);
  });

  it("returns 0 when either set empty", () => {
    expect(jaccard(new Set(), new Set(["a"]))).toBe(0);
    expect(jaccard(new Set(["a"]), new Set())).toBe(0);
  });
});

describe("thresholds", () => {
  it("FAIL default is 40%", () => {
    expect(DEFAULT_FAIL_THRESHOLD).toBe(0.4);
  });

  it("WARN default is 20%", () => {
    expect(DEFAULT_WARN_THRESHOLD).toBe(0.2);
  });

  it("FAIL threshold > WARN threshold", () => {
    expect(DEFAULT_FAIL_THRESHOLD).toBeGreaterThan(DEFAULT_WARN_THRESHOLD);
  });
});
